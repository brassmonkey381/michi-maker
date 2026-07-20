/**
 * Tier usage meters — "how much of my plan am I using". Two layers:
 *
 * - `TierUsage`: a presentational meter row (label, used of limit, thin progress bar).
 *   Infinity-safe: unlimited caps render as "N · Unlimited" with no bar. Deliberately never
 *   turns red — at-limit messaging is UpgradePerk's job, the meter just informs.
 * - `PlanUsageSection`: the data-wired block used by Settings and /subscriptions. While
 *   LIMITS_ENFORCED is false it reads the PLANNED caps from TIER_LIMITS directly (useTier's
 *   limits resolve to unlimited when the flag is off) and frames them as what the plan
 *   includes. FLAG-FLIP NOTE: when LIMITS_ENFORCED goes true, switch the `caps` line to
 *   `useTier().limits` so live enforcement and the meters can never disagree.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { openBillingPortal } from '@/data/checkout';
import { fetchEntitlementDetails } from '@/data/entitlementRepo';
import { addMonths } from '@/data/printWindow';
import { countLiveSavedSlices } from '@/data/sliceRepo';
import { ANNUAL_POOL, CHECKOUT_OPEN } from '@/data/subscriptions';
import { isActive, PRODUCTS, TIER_LIMITS, type Tier } from '@/data/tiers';
import { usePrintAllowance } from '@/hooks/use-print-allowance';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const TIER_NAMES: Record<Tier, string> = {
  guest: 'Guest',
  free: 'Free',
  pro: 'PRO',
  vip: 'VIP',
};

export function TierUsage({
  label,
  used,
  limit,
  note,
}: {
  label: string;
  used: number;
  limit: number;
  note?: string;
}) {
  const unlimited = !Number.isFinite(limit);
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <ThemedText type="smallBold" style={styles.meterLabel}>
          {label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.meterValue}>
          {unlimited ? `${used} · Unlimited` : `${used} of ${limit}`}
        </ThemedText>
      </View>
      {!unlimited ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(used / limit, 1) * 100}%` }]} />
        </View>
      ) : null}
      {note ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** One label · value line of the subscription details list. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

/** Everything the details block shows — computed once per fetch (dates resolved in the effect,
 *  never during render, per the react-hooks purity rule). */
interface PlanDetails {
  memberSince?: string;
  /** "PRO member since" — the active subscription row's granted_at. */
  planSince?: string;
  /** Term end of the active subscription row (manual grants lapse; webhooks will extend). */
  termEnds?: string;
  daysLeft?: number;
  /** The grant came from a manual SQL grant, not a checkout. */
  manualGrant?: boolean;
}

/** The current plan + usage block (Settings PLAN section, /subscriptions YOUR PLAN section). */
export function PlanUsageSection({ onManagePlan }: { onManagePlan?: () => void }) {
  const { tier, hasFullPrint, interval, periodStart, termAllocation, limits } = useTier();
  const { user } = useAuth();
  const { binderCount } = useBinders();
  // Planned caps, not live limits — see the header comment for the LIMITS_ENFORCED flip note.
  const caps = TIER_LIMITS[tier];

  // Included prints: allocation + usage for the CURRENT window (this billing month, or the whole
  // year for a yearly subscriber who released their pool). Resolved through the same hook the
  // print sheet uses, so the windowing logic can't drift between the two surfaces.
  //
  // Fed the PLANNED caps, matching the meters around it — while LIMITS_ENFORCED is off the live
  // limits read as unlimited and this meter would vanish entirely.
  const allowance = usePrintAllowance({
    enabled: hasFullPrint,
    includedPerMonth: caps.includedPrintsPerMonth,
    interval,
    periodStart,
    termAllocation,
  });
  // The pool CONTROL, unlike the meter, follows LIVE enforcement: releasing "your year of prints"
  // is meaningless while included prints aren't metered at all, and offering it here when the
  // print sheet (which reads live limits) shows an unmetered Download button would let someone
  // burn an irreversible unlock on nothing.
  const poolEnabled = Number.isFinite(limits.includedPrintsPerMonth);
  const printCount = allowance.used;
  const printWindow = allowance.window;
  const poolOffer = allowance.offer;
  const printAllocation = printWindow?.allocation ?? caps.includedPrintsPerMonth;
  const [confirmingPool, setConfirmingPool] = useState(false);

  // Server-counted usage: artworks kept (live saved slices).
  // Meters appear once counted; a failed count just leaves that meter off (never a spinner).
  const [artCount, setArtCount] = useState<number | null>(null);
  const [details, setDetails] = useState<PlanDetails | null>(null);
  const [portalNote, setPortalNote] = useState<string | null>(null);
  const isGuest = tier === 'guest';
  const memberSinceIso = user?.created_at;
  useEffect(() => {
    if (isGuest) return;
    let live = true;
    const fmt = (iso?: string | null) =>
      iso
        ? new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : undefined;
    fetchEntitlementDetails()
      .then((rows) => {
        if (!live) return;
        const now = Date.now();
        const activeRows = rows.filter((r) =>
          isActive({ product: r.product, expires_at: r.expiresAt }, now),
        );
        const subProduct =
          tier === 'vip' ? PRODUCTS.tierVip : tier === 'pro' ? PRODUCTS.tierPro : null;
        const sub = subProduct ? activeRows.find((r) => r.product === subProduct) : undefined;
        // The RENEWAL date is period_start + one interval — NOT expires_at. expires_at carries a
        // 3-day dunning grace on top of the period end so a failed-payment retry can't lock out a
        // paying customer mid-recovery. That's the right access boundary and the wrong billing
        // date: showing it told a customer renewing Jul 17 that they renewed Jul 20, and inflated
        // "days left" to match. Falls back to expires_at for manual grants, which have no term.
        const startMs = sub?.periodStart ? Date.parse(sub.periodStart) : NaN;
        const renewalMs =
          sub?.interval && !Number.isNaN(startMs)
            ? addMonths(startMs, sub.interval === 'year' ? 12 : 1)
            : sub?.expiresAt
              ? Date.parse(sub.expiresAt)
              : NaN;
        setDetails({
          memberSince: fmt(memberSinceIso),
          planSince: fmt(sub?.grantedAt),
          termEnds: Number.isNaN(renewalMs) ? undefined : fmt(new Date(renewalMs).toISOString()),
          daysLeft: Number.isNaN(renewalMs)
            ? undefined
            : Math.max(0, Math.ceil((renewalMs - now) / 86400000)),
          manualGrant: sub?.source === 'manual',
        });
      })
      .catch(() => {});
    countLiveSavedSlices()
      .then((n) => {
        if (live) setArtCount(n);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isGuest, tier, memberSinceIso]);

  return (
    <View style={styles.section}>
      <View style={styles.planRow}>
        <ThemedText type="small" themeColor="textSecondary">
          Current plan
        </ThemedText>
        <View style={styles.planChip}>
          <ThemedText type="smallBold" style={styles.planChipText}>
            {TIER_NAMES[tier]}
          </ThemedText>
        </View>
      </View>

      {tier === 'guest' ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          Sign in (free) to keep your binders long-term and unlock the full plan.
        </ThemedText>
      ) : (
        <>
          {details ? (
            <View style={styles.detailList}>
              {details.memberSince ? (
                <DetailRow label="Member since" value={details.memberSince} />
              ) : null}
              {details.planSince ? (
                <DetailRow label={`${TIER_NAMES[tier]} member since`} value={details.planSince} />
              ) : null}
              {details.termEnds ? (
                <DetailRow
                  label={CHECKOUT_OPEN ? 'Renews' : 'Current term ends'}
                  value={
                    details.daysLeft != null
                      ? `${details.termEnds} · ${details.daysLeft} day${details.daysLeft === 1 ? '' : 's'} left`
                      : details.termEnds
                  }
                />
              ) : tier === 'free' ? (
                <DetailRow label="Billing" value="None — Free is free forever" />
              ) : null}
              {details.termEnds && details.manualGrant && !CHECKOUT_OPEN ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  Plans don’t auto-renew during the beta — your term was granted directly and is
                  extended the same way. Automatic renewal arrives with checkout.
                </ThemedText>
              ) : null}
            </View>
          ) : null}
          <TierUsage label="Binders" used={binderCount} limit={caps.binders} />
          {artCount != null ? (
            <TierUsage label="Artworks kept" used={artCount} limit={caps.artUploads} />
          ) : null}
          {printCount != null && caps.includedPrintsPerMonth > 0 ? (
            <TierUsage
              label={
                printWindow?.kind === 'year'
                  ? 'Included prints used this year'
                  : 'Included prints used this month'
              }
              used={printCount}
              limit={printAllocation}
              note={
                Number.isFinite(printAllocation)
                  ? printWindow?.kind === 'year'
                    ? 'Full-binder fill-sheet PDFs. You released your whole year at once.'
                    : 'Full-binder fill-sheet PDFs included with your plan each month.'
                  : undefined
              }
            />
          ) : null}

          {/* ── The annual print pool: yearly subscribers only, and only once included prints
                 are actually metered (see poolEnabled above) ────────────────────────────── */}
          {!poolEnabled ? null : poolOffer.state === 'needsFirstPrint' ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.included}>
              {ANNUAL_POOL.needsFirstPrint(poolOffer.total)}
            </ThemedText>
          ) : poolOffer.state === 'unlocked' ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.included}>
              {ANNUAL_POOL.unlocked(poolOffer.total)}
            </ThemedText>
          ) : poolOffer.state === 'available' && confirmingPool ? (
            // Irreversible for the term, so it never fires on a single tap.
            <View style={styles.confirmBox}>
              <ThemedText type="smallBold">{ANNUAL_POOL.title(poolOffer.total)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                {ANNUAL_POOL.body(poolOffer.total, caps.includedPrintsPerMonth)}
              </ThemedText>
              <View style={styles.confirmRow}>
                <Pressable
                  onPress={() => setConfirmingPool(false)}
                  style={({ pressed }) => [styles.cancelBtn, pressed && styles.dim]}>
                  <Text style={styles.cancelBtnText}>{ANNUAL_POOL.cancel}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void allowance.unlock().then((ok) => {
                      if (ok) setConfirmingPool(false);
                    });
                  }}
                  disabled={allowance.unlocking}
                  style={({ pressed }) => [
                    styles.confirmBtn,
                    (pressed || allowance.unlocking) && styles.dim,
                  ]}>
                  {allowance.unlocking ? (
                    <ActivityIndicator color={Palette.accentText} />
                  ) : (
                    <Text style={styles.confirmBtnText}>{ANNUAL_POOL.cta(poolOffer.total)}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : poolOffer.state === 'available' ? (
            <ThemedText
              type="linkPrimary"
              style={styles.manage}
              onPress={() => setConfirmingPool(true)}>
              Use all {poolOffer.total} of this year’s prints ›
            </ThemedText>
          ) : hasFullPrint && interval === 'month' && caps.includedPrintsPerMonth > 0 ? (
            // Month-to-month subscribers have no pool to release — one honest line, not a nag.
            <ThemedText type="small" themeColor="textSecondary" style={styles.included}>
              {ANNUAL_POOL.monthlyUpsell}
            </ThemedText>
          ) : null}
          {allowance.error ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              {allowance.error}
            </ThemedText>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary" style={styles.included}>
            Your plan includes similarity matching and every composer method
            {caps.includedPrintsPerMonth > 0 && Number.isFinite(caps.includedPrintsPerMonth)
              ? `, plus ${caps.includedPrintsPerMonth} full-binder print${caps.includedPrintsPerMonth === 1 ? '' : 's'} a month`
              : ''}
            .
          </ThemedText>
        </>
      )}

      {/* Stripe Customer Portal: cancel, switch plans, payment method, invoices. Only offered
          once checkout is open AND the user actually has billing history to manage. */}
      {/* Not gated on CHECKOUT_OPEN: that flag gates SELLING. Someone who already pays should be
          able to reach cancellation and payment-method management regardless. */}
      {tier === 'pro' || tier === 'vip' ? (
        <ThemedText
          type="linkPrimary"
          style={styles.manage}
          onPress={() => {
            setPortalNote('Opening the billing portal…');
            openBillingPortal().catch((e) => setPortalNote((e as Error).message));
          }}>
          Manage billing ›
        </ThemedText>
      ) : null}
      {portalNote ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          {portalNote}
        </ThemedText>
      ) : null}

      {onManagePlan ? (
        <ThemedText type="linkPrimary" style={styles.manage} onPress={onManagePlan}>
          View plans ›
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  planChip: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
  },
  planChipText: { fontSize: FontSize.sm },
  detailList: {
    gap: Spacing.one,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.panelAlt,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.one,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  detailLabel: { fontSize: FontSize.sm },
  detailValue: { fontSize: FontSize.sm, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 },
  meter: { gap: 4 },
  meterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meterLabel: { fontSize: FontSize.label },
  meterValue: { fontSize: FontSize.sm, fontVariant: ['tabular-nums'] },
  track: { height: 4, borderRadius: Radius.pill, backgroundColor: Palette.panel, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill, backgroundColor: Palette.accent },
  note: { lineHeight: 18 },
  included: { lineHeight: 18 },
  manage: { fontSize: FontSize.label, marginTop: 2 },
  // Matches the print sheet's confirm step (accent-outlined box, cancel + commit pair) so the
  // same irreversible decision looks the same wherever it's offered.
  confirmBox: {
    borderWidth: 1.5,
    borderColor: Palette.accent,
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  confirmRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  confirmBtn: {
    flex: 1,
    backgroundColor: Palette.accent,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    minHeight: 40,
  },
  confirmBtnText: {
    color: Palette.accentText,
    fontSize: FontSize.label,
    fontWeight: Weight.semibold,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 40,
  },
  cancelBtnText: { color: Palette.accent, fontSize: FontSize.label, fontWeight: Weight.semibold },
  dim: { opacity: 0.6 },
});
