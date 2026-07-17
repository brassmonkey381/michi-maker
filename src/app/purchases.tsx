/**
 * `/purchases` — the account's money-and-grants ledger, three sections:
 *
 *  1. PAYMENTS — everything paid through Stripe (subscription invoices incl. renewals, one-time
 *     unlocks), with timestamps, amounts, and hosted receipt links. Server-read via the
 *     stripe-checkout edge function's `history` action (the mapped Stripe customer).
 *  2. PLAN & UNLOCK GRANTS — the entitlements ledger (what the payments granted, plus any
 *     manual/beta grants that never touched Stripe), with granted/expires timestamps.
 *  3. INCLUDED PRINTS USED — confirmed print-credit spends (which binder, when, how many sheets).
 *
 * Dates are resolved to display strings inside effects (react-hooks purity rule). Every section
 * has an honest empty state; fetch failures show a note, never a dead spinner.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { PrintPlaceholdersSheet } from '@/components/binder/PrintPlaceholdersSheet';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { FontSize, MaxContentWidth, Palette, Radius, Spacing } from '@/constants/theme';
import { fetchBinder, fetchBinderTitles } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { fetchPurchaseHistory, openBillingPortal, type PurchasePayment } from '@/data/checkout';
import { fetchEntitlementDetails } from '@/data/entitlementRepo';
import {
  downloadPurchasedPdf,
  fetchAllPurchasedVersions,
  type AnyPurchasedVersion,
} from '@/data/pdfSnapshot';
import { fetchPrintEvents } from '@/data/printRepo';
import { CHECKOUT_OPEN } from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';

/** Product keys → human names for the grants section. */
function grantName(product: string): string {
  if (product === 'tier_pro') return 'PRO subscription';
  if (product === 'tier_vip') return 'VIP subscription';
  if (product === 'tcgscan_pro') return 'TCGScan Pro (partner app)';
  if (product === 'pdf_print') return 'Full-print unlock (lifetime)';
  if (product.startsWith('pdf_binder:')) return 'Binder PDF unlock';
  return product;
}

const fmtDateTime = (iso: string | number) =>
  new Date(typeof iso === 'number' ? iso * 1000 : iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const fmtAmount = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(
    cents / 100,
  );

interface Row {
  key: string;
  when: string;
  title: string;
  detail?: string;
  amount?: string;
  receiptUrl?: string | null;
  /** Row action (e.g. downloading an archived purchased PDF). */
  action?: { label: string; run: () => void; busy?: boolean };
}

function SectionRows({
  label,
  rows,
  empty,
  failed,
}: {
  label: string;
  rows: Row[] | null;
  empty: string;
  failed: boolean;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
        {label}
      </ThemedText>
      {failed ? (
        <ThemedText type="small" themeColor="textSecondary">
          Couldn’t load this section right now — try again in a moment.
        </ThemedText>
      ) : rows === null ? (
        <ThemedText type="small" themeColor="textSecondary">
          Loading…
        </ThemedText>
      ) : rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {empty}
        </ThemedText>
      ) : (
        <View style={styles.list}>
          {rows.map((r) => (
            <View key={r.key} style={styles.row}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold" style={styles.rowTitle}>
                  {r.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.rowWhen}>
                  {r.when}
                  {r.detail ? ` · ${r.detail}` : ''}
                </ThemedText>
              </View>
              <View style={styles.rowRight}>
                {r.amount ? (
                  <ThemedText type="smallBold" style={styles.amount}>
                    {r.amount}
                  </ThemedText>
                ) : null}
                {r.receiptUrl ? (
                  <ThemedText
                    type="linkPrimary"
                    style={styles.receipt}
                    onPress={() => void Linking.openURL(r.receiptUrl!)}>
                    Receipt ›
                  </ThemedText>
                ) : null}
                {r.action ? (
                  <ThemedText
                    type="linkPrimary"
                    style={styles.receipt}
                    onPress={r.action.busy ? undefined : r.action.run}>
                    {r.action.busy ? 'Downloading…' : `${r.action.label} ›`}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function PurchasesScreen() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { isPaid } = useTier();

  const [payments, setPayments] = useState<Row[] | null>(null);
  const [paymentsFailed, setPaymentsFailed] = useState(false);
  const [grants, setGrants] = useState<Row[] | null>(null);
  const [grantsFailed, setGrantsFailed] = useState(false);
  const [prints, setPrints] = useState<Row[] | null>(null);
  const [printsFailed, setPrintsFailed] = useState(false);
  const [pdfs, setPdfs] = useState<AnyPurchasedVersion[] | null>(null);
  const [pdfsFailed, setPdfsFailed] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // The binder whose print sheet is open — rows for unlocks/prints open the SAME fill-sheet
  // modal as the home page (options, confirm step, credit/unlock logic all included).
  const [printTarget, setPrintTarget] = useState<DemoBinder | null>(null);

  // Binder titles resolved SERVER-SIDE (RLS: own + public binders) — the local store races
  // this page's mount and mislabeled real binders as deleted. Missing ids are genuinely gone.
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const binderTitle = (id: string | null) => {
    if (!id) return undefined;
    const t = titles.get(id);
    return t ? `“${t}”` : 'a binder that is no longer available';
  };

  /** Open the standard print fill-sheets modal for a binder referenced by a purchase row. */
  const openPrint = (binderId: string) => {
    setPdfError(null);
    fetchBinder(binderId)
      .then((b) => {
        if (b) setPrintTarget(b);
        else setPdfError('That binder is no longer available — its archived PDFs above still download.');
      })
      .catch((e) => setPdfError((e as Error).message));
  };

  useEffect(() => {
    if (!isSignedIn) return;
    let live = true;
    (async () => {
      const [pay, ent, pv, pe] = await Promise.allSettled([
        fetchPurchaseHistory(),
        fetchEntitlementDetails(),
        fetchAllPurchasedVersions(),
        fetchPrintEvents(),
      ]);
      if (!live) return;

      // Resolve every referenced binder title in one query before building rows.
      const ids = new Set<string>();
      if (pay.status === 'fulfilled') pay.value.forEach((p) => p.binderId && ids.add(p.binderId));
      if (ent.status === 'fulfilled')
        ent.value.forEach((r) => {
          if (r.product.startsWith('pdf_binder:')) ids.add(r.product.slice('pdf_binder:'.length));
        });
      if (pv.status === 'fulfilled') pv.value.forEach((v) => ids.add(v.binderId));
      if (pe.status === 'fulfilled') pe.value.forEach((r) => r.binderId && ids.add(r.binderId));
      const titleMap = await fetchBinderTitles([...ids]).catch(() => new Map<string, string>());
      if (!live) return;
      setTitles(titleMap);
      const named = (id: string | null) => {
        if (!id) return undefined;
        const t = titleMap.get(id);
        return t ? `“${t}”` : 'a binder that is no longer available';
      };

      if (pay.status === 'fulfilled') {
        setPayments(
          pay.value.map((p: PurchasePayment) => ({
            key: p.id,
            when: fmtDateTime(p.createdAt),
            title: p.description,
            detail:
              [named(p.binderId), p.status !== 'paid' ? p.status : undefined]
                .filter(Boolean)
                .join(' · ') || undefined,
            amount: fmtAmount(p.amount, p.currency),
            receiptUrl: p.receiptUrl,
          })),
        );
      } else setPaymentsFailed(true);

      if (ent.status === 'fulfilled') {
        setGrants(
          ent.value
            .slice()
            .sort((a, b) => Date.parse(b.grantedAt ?? '') - Date.parse(a.grantedAt ?? ''))
            .map((r, i) => {
              const binderId = r.product.startsWith('pdf_binder:')
                ? r.product.slice('pdf_binder:'.length)
                : null;
              return {
                key: `${r.product}-${i}`,
                when: r.grantedAt ? fmtDateTime(r.grantedAt) : 'unknown date',
                title: grantName(r.product),
                detail: [
                  binderId ? named(binderId) : undefined,
                  r.source === 'manual' ? 'granted directly (beta)' : r.source ? `via ${r.source}` : undefined,
                  r.expiresAt ? `runs through ${fmtDateTime(r.expiresAt)}` : 'lifetime',
                ]
                  .filter(Boolean)
                  .join(' · '),
                // The binder still exists → open the standard print modal (options + confirm).
                ...(binderId && titleMap.has(binderId)
                  ? { action: { label: 'Print', run: () => openPrint(binderId) } }
                  : {}),
              };
            }),
        );
      } else setGrantsFailed(true);

      if (pv.status === 'fulfilled') setPdfs(pv.value);
      else setPdfsFailed(true);

      if (pe.status === 'fulfilled') {
        setPrints(
          pe.value.map((r, i) => ({
            key: `${r.createdAt}-${i}`,
            when: fmtDateTime(r.createdAt),
            title: 'Included print used',
            detail: [
              named(r.binderId),
              r.sheets != null ? `${r.sheets} sheet${r.sheets === 1 ? '' : 's'}` : undefined,
            ]
              .filter(Boolean)
              .join(' · '),
            ...(r.binderId && titleMap.has(r.binderId)
              ? { action: { label: 'Print', run: () => openPrint(r.binderId!) } }
              : {}),
          })),
        );
      } else setPrintsFailed(true);
    })();
    return () => {
      live = false;
    };
  }, [isSignedIn]);

  return (
    <PageShell title="My Purchases" description="Your michi-maker payments, grants, and print usage.">
      <View style={styles.prose}>
        <ThemedText type="subtitle" style={styles.h1}>
          My Purchases
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
          Every payment, plan grant, and included print on your account, newest first.
        </ThemedText>

        {!isSignedIn ? (
          <ThemedText type="small" themeColor="textSecondary">
            Sign in to see your purchase history.
          </ThemedText>
        ) : (
          <>
            <SectionRows
              label="PAYMENTS"
              rows={payments}
              empty="No payments yet — everything is free while michi-maker is in beta."
              failed={paymentsFailed}
            />
            <SectionRows
              label="PURCHASED BINDER PDFs"
              rows={
                pdfs === null
                  ? null
                  : pdfs.map((v) => ({
                      key: `${v.binderId}-${v.fingerprint}`,
                      when: fmtDateTime(v.spentAt),
                      title: binderTitle(v.binderId) ?? 'Binder PDF',
                      detail: v.sheets != null ? `${v.sheets} sheet${v.sheets === 1 ? '' : 's'}` : undefined,
                      action: {
                        label: 'Download',
                        busy: pdfBusy === `${v.binderId}-${v.fingerprint}`,
                        run: () => {
                          const key = `${v.binderId}-${v.fingerprint}`;
                          setPdfBusy(key);
                          setPdfError(null);
                          downloadPurchasedPdf(v)
                            .then((blob) => {
                              if (!blob) throw new Error('This PDF’s archive is missing — contact support and we’ll sort it out.');
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `binder fill sheets (purchased ${new Date(v.spentAt).toISOString().slice(0, 10)}).pdf`;
                              a.click();
                              setTimeout(() => URL.revokeObjectURL(url), 10000);
                            })
                            .catch((e) => setPdfError((e as Error).message))
                            .finally(() => setPdfBusy(null));
                        },
                      },
                    }))
              }
              empty="No purchased binder PDFs yet. Every purchased or credit-printed version lands here, and stays downloadable even if you delete the binder."
              failed={pdfsFailed}
            />
            {pdfError ? (
              <ThemedText type="small" style={styles.error}>
                {pdfError}
              </ThemedText>
            ) : null}
            <SectionRows
              label="PLAN AND UNLOCK GRANTS"
              rows={grants}
              empty="No grants yet."
              failed={grantsFailed}
            />
            <SectionRows
              label="INCLUDED PRINTS USED"
              rows={prints}
              empty="No included prints used yet."
              failed={printsFailed}
            />

            {CHECKOUT_OPEN && isPaid ? (
              <ThemedText
                type="linkPrimary"
                style={styles.portal}
                onPress={() => void openBillingPortal().catch(() => {})}>
                Manage billing (payment method, cancel, invoices) ›
              </ThemedText>
            ) : null}
            <ThemedText
              type="linkPrimary"
              style={styles.portal}
              onPress={() => router.push('/subscriptions' as Href)}>
              View plans ›
            </ThemedText>
          </>
        )}
      </View>

      {/* The standard print fill-sheets modal (same options, confirm step, and credit/unlock
          logic as the home page) — opened from a purchase row's Print action. */}
      {printTarget ? (
        <PrintPlaceholdersSheet binder={printTarget} onClose={() => setPrintTarget(null)} />
      ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  prose: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', gap: Spacing.three },
  h1: { marginBottom: Spacing.one },
  lede: { lineHeight: 20, marginBottom: Spacing.two },
  section: { gap: Spacing.two, marginTop: Spacing.two },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  list: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.lg,
    backgroundColor: Palette.panelAlt,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontSize: FontSize.label },
  rowWhen: { fontSize: FontSize.sm },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: FontSize.label, fontVariant: ['tabular-nums'] },
  receipt: { fontSize: FontSize.sm },
  portal: { fontSize: FontSize.label, marginTop: Spacing.two },
  error: { color: Palette.danger, lineHeight: 18, fontSize: FontSize.sm },
});
