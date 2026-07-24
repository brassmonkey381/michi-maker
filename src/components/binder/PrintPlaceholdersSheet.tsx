/**
 * "Print placeholders" sheet — generates the placeholder-card PDF for a binder (see
 * src/data/placeholderPdf.ts): one gray, cut-to-card-size placeholder per card pocket,
 * labeled with its binder location (page + row/col) and the card's name / set / number.
 * Print, cut, and every pocket physically tells you which card it's waiting for.
 *
 * Card names come from the catalog, so this is a signed-in perk (guests get the standard
 * inline SignInPerk note, never a dead spinner). The PDF downloads in-browser on web; on
 * native we point at the web app for now (no share-sheet plumbing yet).
 */
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { LogoLoader } from '@/components/brand/LogoLoader';
import { ThemedText } from '@/components/themed-text';
import { PdfUnlockedModal } from '@/components/monetization/PdfUnlockedModal';
import { TrialCta } from '@/components/monetization/TrialCta';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';
import { fetchUserCards } from '@/data/collectionRepo';
import { EXAMPLE_FILL_SHEET_BINDER } from '@/data/exampleFillSheetBinder';
import { createWebArtLoader } from '@/data/fillSheetArt';
import { startCheckout } from '@/data/checkout';
import { buildFillSheetPdfs, collectFillTiles, type FillSheetPdf } from '@/data/placeholderPdf';
import {
  binderFingerprint,
  downloadPurchasedPdf,
  purchaseStatus,
  spendPurchase,
  type PurchasedVersion,
  type PurchaseStatus,
} from '@/data/pdfSnapshot';
import { PrintCapExceededError, recordPrintEvent, type RecordedPrint } from '@/data/printRepo';
import { ANNUAL_POOL, BINDER_PDF_LOOKUP_KEY, CHECKOUT_OPEN } from '@/data/subscriptions';
import { useCatalog } from '@/hooks/use-catalog';
import { usePrintAllowance } from '@/hooks/use-print-allowance';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';

/** Trigger a browser download for generated PDF bytes. */
function saveBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Filesystem-safe stem from a binder title (kept in sync with the snapshot filename rules). */
const fileStem = (title: string) => title.replace(/[^\w\- ]+/g, '').trim() || 'binder';

/**
 * Save every generated file as its own download. Placeholders and art now print as SEPARATE
 * PDFs (plain paper vs matte cardstock), so a binder with art yields two files — saved staggered
 * so the browser doesn't drop the second automatic download. `suffix` marks archived versions.
 */
async function saveFillSheetFiles(files: FillSheetPdf[], stem: string, suffix = '') {
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    const label = f.section === 'art' ? 'Art (matte cardstock)' : 'Placeholders (plain paper)';
    saveBytes(f.bytes, `${stem} - ${label}${suffix}.pdf`);
    if (i < files.length - 1) await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export function PrintPlaceholdersSheet({
  binder,
  onClose,
  onDone,
}: {
  binder: DemoBinder;
  onClose: () => void;
  /** Fired after a successful download (for a host toast). */
  onDone?: (sheets: number) => void;
}) {
  const { catalog, guestGated, loading } = useCatalog(true);
  // Printing your OWN binder comes with a PRO/VIP subscription or this binder's own one-time
  // purchase (`pdf_binder:<id>`). Non-payers get the counts preview + a free short EXAMPLE PDF
  // (example cards + artwork) as the teaser — never their own binders.
  //
  // The one-time purchase is a SNAPSHOT license (see data/pdfSnapshot.ts): it covers the binder
  // as it is when the purchase is spent (first download), forever. Editing the binder afterwards
  // requires a new unlock (or a plan) to print the edited version — the purchased version stays
  // downloadable from its archive.
  const {
    hasFullPrint,
    products,
    limits,
    interval,
    periodStart,
    termAllocation,
    loading: entLoading,
    refresh,
  } = useTier();
  const purchased = products.includes(`pdf_binder:${binder.id}`);

  // Back from Stripe checkout ON THIS PAGE (?checkout=success): the webhook grant lags the
  // redirect by a few seconds and nothing else re-polls the tier read here (only
  // /subscriptions does) — so poll until the purchase shows up, or give up quietly.
  //
  // `cameFromCheckout` also drives the celebration: read ONCE at mount (the URL can't change
  // under this sheet), so the modal fires when the grant lands on this visit and never on a
  // later re-open of an already-purchased binder. Lazy state, not an effect — setting it in the
  // effect would be a cascading-render setState.
  const [cameFromCheckout] = useState(
    () =>
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      new URL(window.location.href).searchParams.get('checkout') === 'success',
  );
  const [celebrated, setCelebrated] = useState(false);
  useEffect(() => {
    if (!cameFromCheckout || purchased) return;
    let polls = 0;
    const id = setInterval(() => {
      refresh();
      if (++polls >= 10) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, [cameFromCheckout, purchased, refresh]);
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [exBusy, setExBusy] = useState(false);
  // pdfPath of the purchased version currently downloading (one at a time), or null.
  const [archBusyPath, setArchBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The pending consequential action awaiting the user's explicit CONFIRM (nothing spends a
  // credit, locks a snapshot, or leaves for checkout on first click):
  //  'credit' → subscriber spends 1 included print on this version
  //  'spend'  → a one-time purchase locks onto the binder's current version
  //  'buy'    → leave for Stripe checkout ($3.99 unlock)
  //  'pool'   → yearly subscriber releases the whole year's prints at once (IRREVERSIBLE)
  const [confirming, setConfirming] = useState<null | 'credit' | 'spend' | 'buy' | 'pool'>(null);
  // Where this binder's printed/purchased VERSIONS stand (subscribers archive credit prints the
  // same way purchases archive spends, so both get free re-downloads); null while resolving.
  const [pStatus, setPStatus] = useState<PurchaseStatus | null>(null);
  useEffect(() => {
    // Any signed-in user can have archived versions (past purchases/credit prints survive
    // plan lapses and even binder edits) — always resolve them, so the list never vanishes.
    if (!isSignedIn) return;
    let live = true;
    purchaseStatus(binder)
      .then((s) => {
        if (live) setPStatus(s);
      })
      .catch(() => {
        if (live) setPStatus({ state: 'unspent', versions: [] }); // failure must not brick a paid unlock
      });
    return () => {
      live = false;
    };
  }, [isSignedIn, purchased, hasFullPrint, binder]);
  const pState = pStatus?.state ?? null;
  const versions = pStatus?.versions ?? [];
  // Binder currently matches an already-printed/purchased version → that document is paid for;
  // regenerating it is a FREE re-download for everyone (no credit, no purchase).
  const versionPaidFor = pState === 'current';

  // Subscriber print credits: the included allocation for the CURRENT window — normally this
  // billing month (PRO 1 / VIP 3), or the whole term at once (PRO 12 / VIP 36 on a full year,
  // less if they upgraded mid-term — see term_print_allocation) for a yearly
  // subscriber who released their pool. Only a CONFIRMED credit spend records usage. Infinity
  // (flag off) = no credit language at all.
  const allowance = usePrintAllowance({
    enabled: hasFullPrint,
    includedPerMonth: limits.includedPrintsPerMonth,
    interval,
    periodStart,
    termAllocation,
  });
  const { metered, left: creditsLeft, offer: poolOffer, window: printWindow } = allowance;
  const printsUsed = allowance.used;
  const allocation = printWindow?.allocation ?? limits.includedPrintsPerMonth;
  // Every "N left …" / "renews …" line has to name the right window or the numbers read as a bug.
  const periodWord = printWindow?.kind === 'year' ? 'this year' : 'this month';

  // Cards the user owns (My collection) — owned placeholders print green when the toggle is
  // on, so the cut sheet doubles as a pull-list (green = go grab it) + want-list (gray).
  const [ownedIds, setOwnedIds] = useState<Set<string> | null>(null);
  const [colorOwned, setColorOwned] = useState(true);
  useEffect(() => {
    if (!isSignedIn) return;
    let live = true;
    fetchUserCards()
      .then((rows) => {
        if (live) setOwnedIds(new Set(rows.filter((r) => r.quantity > 0).map((r) => r.cardId)));
      })
      .catch(() => {}); // no collection is fine — everything prints gray
    return () => {
      live = false;
    };
  }, [isSignedIn]);

  const effectiveOwned = colorOwned ? (ownedIds ?? undefined) : undefined;
  const collected = useMemo(
    () => (catalog ? collectFillTiles(binder, catalog, effectiveOwned) : null),
    [binder, catalog, effectiveOwned],
  );
  const counts = collected?.counts ?? null;
  const sheets = counts?.sheets ?? 0;
  const ownedCount = counts?.ownedCards ?? 0;

  /**
   * Generate + save the PDF. `credit: true` = a CONFIRMED subscriber credit spend (records
   * usage, archives the version); `spend: true` = a CONFIRMED one-time-purchase spend (archives
   * the version, no usage record). Free re-downloads of an already-paid version pass neither —
   * usage is only ever bumped by an explicit confirmation.
   */
  const download = async (opts: { credit?: boolean; spend?: boolean } = {}) => {
    if (!catalog || !counts || counts.total === 0 || busy) return;
    setConfirming(null);
    setBusy(true);
    setError(null);
    try {
      // Two files: a plain-paper placeholders PDF and a matte-cardstock art PDF (either omitted
      // if the binder has none of that kind). Web: plain blob downloads, staggered.
      const files = await buildFillSheetPdfs(binder, catalog, {
        ownedIds: effectiveOwned,
        // Art pixels: direct CORS fetch → art-proxy edge fn fallback → webp/canvas convert.
        loadImage: createWebArtLoader(),
      });
      if (files.length === 0) throw new Error('This binder has nothing to print yet.');

      // Spend the included credit BEFORE handing over the file (record-then-download): the RPC
      // checks the window allowance and inserts the ledger row atomically, so a spent-out window is
      // refused HERE — preventing the download — instead of the refusal trailing a PDF the user
      // already has. Files are built first (a build failure must not burn a credit), but nothing is
      // saved until the credit is secured. Usage bumps ONLY on a confirmed credit spend — never on
      // free re-downloads or purchases ('spend' gates on the paid unlock, not credits).
      let recorded: RecordedPrint | null = null;
      if (opts.credit) {
        try {
          recorded = await recordPrintEvent({ binderId: binder.id, sheets });
        } catch (e) {
          if (e instanceof PrintCapExceededError) {
            // Out of credits for this window (e.g. another tab just spent the last one). Reconcile
            // the meter to the server's truth — reload re-resolves to 0 left and the sheet falls
            // back to the existing out-of-credits UI — and DON'T hand over the file.
            allowance.reload();
            return;
          }
          throw e; // unexpected failure → surfaced by the catch below as an error message
        }
        // A soft failure (network/other) returns null: fall through to the download rather than
        // block a paying customer over a transient blip — under-counting is the accepted soft-fail
        // direction (see 20260724040000_authoritative_metering.sql).
      }

      // Credit secured (or this isn't a metered spend) — hand over the file(s) now.
      await saveFillSheetFiles(files, fileStem(binder.title));
      // Confirmed spends (credit OR purchase) archive this version so it re-downloads free
      // forever — the version list below is the "print a previous version" surface. The snapshot
      // regenerates from stored content on re-download, so archiving the first file's bytes is a
      // best-effort fallback; `sheets` stays the TOTAL across both files.
      if (opts.credit || opts.spend) {
        const v = await spendPurchase(binder, files[0].bytes, sheets).catch(() => null);
        setPStatus((prev) => ({
          state: 'current',
          versions: v
            ? [v, ...(prev?.versions ?? []).filter((p) => p.fingerprint !== v.fingerprint)]
            : (prev?.versions ?? []),
        }));
      }
      // Reflect the spend — the RPC's authoritative counts when we have them, else an optimistic bump.
      if (opts.credit) {
        allowance.noteSpent(recorded);
      }
      onDone?.(sheets);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Download one purchased version (every spent purchase stays downloadable forever). We
   *  REGENERATE whenever the version's content is recoverable — from its frozen snapshot, or
   *  from the live binder when the fingerprint still matches — so the color-owned toggle
   *  always applies with the user's CURRENT collection. Only unrecoverable old rows fall back
   *  to the archived bytes. */
  const downloadArchived = async (version: PurchasedVersion) => {
    if (archBusyPath) return;
    setArchBusyPath(version.pdfPath ?? 'pending');
    setError(null);
    try {
      const stamp = new Date(version.spentAt).toISOString().slice(0, 10);
      const stem = `${fileStem(binder.title)} (purchased ${stamp})`;
      const source = version.content
        ? {
            ...binder,
            title: version.content.title ?? binder.title,
            layoutStyle: version.content.layoutStyle,
            pages: version.content.pages,
          }
        : (await binderFingerprint(binder)) === version.fingerprint
          ? binder // pre-column row, but the live binder IS this version — regenerate from it
          : null;
      if (source && catalog) {
        // Recoverable version → regenerate BOTH files (placeholders + art) with current options.
        const files = await buildFillSheetPdfs(source, catalog, {
          ownedIds: effectiveOwned,
          loadImage: createWebArtLoader(),
        });
        if (files.length === 0) throw new Error('This purchased version has nothing to print.');
        await saveFillSheetFiles(files, stem);
      } else {
        // Unrecoverable legacy row: fall back to the single archived PDF from when it was bought.
        const blob = await downloadPurchasedPdf(version);
        if (!blob) throw new Error('Your purchased PDF couldn’t be found. Contact support and we’ll sort it out.');
        saveBytes(new Uint8Array(await blob.arrayBuffer()), `${stem}.pdf`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setArchBusyPath(null);
    }
  };

  /** Launch the one-time purchase for THIS binder (first buy and buy-again after edits).
   *  Only ever called from a CONFIRMED 'buy' action — never straight off a button. */
  const buyBinderPdf = () => {
    if (buying) return;
    setConfirming(null);
    setBuying(true);
    setError(null);
    startCheckout(BINDER_PDF_LOOKUP_KEY, { binderId: binder.id })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBuying(false));
  };

  /** The inline confirmation step for every consequential action (credit / spend / buy / pool). */
  const poolTotal = poolOffer.state === 'none' ? 0 : poolOffer.total;
  const confirmCopy: Record<
    'credit' | 'spend' | 'buy' | 'pool',
    { title: string; body: string; cta: string }
  > = {
    credit: {
      title: 'Use 1 included print?',
      body: `This spends 1 of your ${Number.isFinite(allocation) ? allocation : ''} included prints for ${periodWord} on this binder as it is right now. This version stays re-downloadable free, forever.`,
      cta: 'Use 1 print',
    },
    pool: {
      title: ANNUAL_POOL.title(poolTotal),
      body: ANNUAL_POOL.body(poolTotal, limits.includedPrintsPerMonth),
      cta: ANNUAL_POOL.cta(poolTotal),
    },
    spend: {
      title: 'Lock your unlock to this version?',
      body: 'This download locks your $3.99 unlock to the binder as it is right now — re-download this version anytime, forever. Printing future edits will need a new unlock or a plan.',
      cta: 'Download and lock in',
    },
    buy: {
      title: 'Unlock this binder for $3.99?',
      body: 'You will be taken to secure Stripe checkout. The one-time unlock covers this binder as it is today, yours to re-download forever.',
      cta: 'Continue to checkout',
    },
  };
  const runConfirmed = () => {
    if (confirming === 'credit') void download({ credit: true });
    else if (confirming === 'spend') void download({ spend: true });
    else if (confirming === 'buy') buyBinderPdf();
    else if (confirming === 'pool') {
      // Stay on the sheet: releasing the pool re-resolves the window in place, so the button
      // below turns straight back into "Use 1 included print" with the year's count.
      setConfirming(null);
      void allowance.unlock();
    }
  };

  // Free teaser: the curated sample binder (4 placeholder pages + 2 art pages), so non-payers see
  // the exact format — and BOTH output files (plain-paper placeholders + matte-cardstock art) —
  // without printing their own binders. See src/data/exampleFillSheetBinder.ts.
  // Arm the example download. Generation is DEFERRED to the effect below so the free example is
  // never hidden behind a slow/cold catalog load — the button stays visible and just shows a
  // spinner ("Preparing…") until the catalog is ready, then generates and downloads.
  const downloadExample = () => {
    if (exBusy) return;
    setError(null);
    setExBusy(true);
  };
  const exRunning = useRef(false);
  useEffect(() => {
    if (!exBusy || !catalog || exRunning.current) return;
    exRunning.current = true;
    let live = true;
    (async () => {
      try {
        const files = await buildFillSheetPdfs(EXAMPLE_FILL_SHEET_BINDER, catalog, {
          loadImage: createWebArtLoader(),
        });
        await saveFillSheetFiles(files, 'michi example');
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        exRunning.current = false;
        if (live) setExBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [exBusy, catalog]);

  return (
    <DialogCard title="Print fill sheets" onClose={onClose}>
            {guestGated ? (
              <SignInPerk message="Placeholder labels read the full card catalog. Sign in (free) to print them." />
            ) : Platform.OS !== 'web' ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                PDF download is available on the web app for now. Open michi-maker.com to print
                this binder’s placeholders.
              </ThemedText>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                  Print-ready cut sheets of this binder’s pages, as up to two files: a
                  placeholders PDF for plain paper (card placeholders labeled with pocket +
                  name/set/number, plus color inserts) and, if the binder has art, a separate art
                  PDF for matte cardstock (gap-compensated so pictures stay continuous across the
                  pocket dividers). Every piece is real card size (2.5″ × 3.5″): print at 100%,
                  cut along the guides, slide in.
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.legalNote}>
                  michi-maker lays out and exports your arrangement — the file is generated on
                  your device from art you supplied, for your personal collection. You print it
                  yourself, and you are responsible for the rights to any art it contains.
                </ThemedText>

                {!catalog && loading ? (
                  <View style={styles.center}>
                    <LogoLoader label="Loading the card catalog…" />
                  </View>
                ) : null}

                {counts ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    <ThemedText type="smallBold">{counts.cards}</ThemedText> card placeholder
                    {counts.cards === 1 ? '' : 's'}
                    {counts.art > 0 ? (
                      <>
                        {' · '}
                        <ThemedText type="smallBold">{counts.art}</ThemedText> art piece
                        {counts.art === 1 ? '' : 's'}
                      </>
                    ) : null}
                    {counts.inserts > 0 ? (
                      <>
                        {' · '}
                        <ThemedText type="smallBold">{counts.inserts}</ThemedText> insert
                        {counts.inserts === 1 ? '' : 's'}
                      </>
                    ) : null}
                    {' across '}
                    <ThemedText type="smallBold">{sheets}</ThemedText> sheet
                    {sheets === 1 ? '' : 's'}
                    {counts.art > 0 ? (
                      <>
                        {' — '}
                        <ThemedText type="smallBold">{counts.placeholderSheets}</ThemedText> on plain
                        paper, <ThemedText type="smallBold">{counts.artSheets}</ThemedText> on matte
                        cardstock (two files, each with its own cover).
                      </>
                    ) : (
                      ' (plus a cover with print instructions).'
                    )}
                    {colorOwned && ownedCount > 0
                      ? ` ${ownedCount} print${ownedCount === 1 ? 's' : ''} green, already in your collection.`
                      : ''}
                  </ThemedText>
                ) : null}
                {ownedIds && ownedIds.size > 0 && counts && counts.total > 0 ? (
                  <Pressable
                    onPress={() => setColorOwned((v) => !v)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: colorOwned }}
                    style={styles.toggleRow}
                    hitSlop={4}>
                    <View style={[styles.toggleBox, colorOwned && styles.toggleBoxOn]}>
                      {colorOwned ? <Text style={styles.toggleTick}>✓</Text> : null}
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      Color the cards I already own
                    </ThemedText>
                  </Pressable>
                ) : null}
                {counts && counts.total === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    This binder’s pockets are empty. Nothing to print yet.
                  </ThemedText>
                ) : null}

                {busy ? (
                  // PDF generation is the long processing funnel — brand the wait instead of a
                  // button spinner.
                  <View style={styles.center}>
                    <LogoLoader label="Generating your PDF…" variant="thinking" />
                  </View>
                ) : confirming ? (
                  // ── the confirmation step — nothing consequential happens on first click ──
                  <View style={styles.confirmBox}>
                    <ThemedText type="smallBold">{confirmCopy[confirming].title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                      {confirmCopy[confirming].body}
                    </ThemedText>
                    <View style={styles.confirmRow}>
                      <Pressable
                        onPress={() => setConfirming(null)}
                        style={({ pressed }) => [styles.cancelBtn, pressed && styles.dim]}>
                        <Text style={styles.exampleBtnText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={runConfirmed}
                        disabled={busy || buying}
                        style={({ pressed }) => [styles.btn, styles.confirmBtn, (pressed || busy || buying) && styles.dim]}>
                        {busy || buying ? (
                          <ActivityIndicator color={Palette.accentText} />
                        ) : (
                          <Text style={styles.btnText}>{confirmCopy[confirming].cta}</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ) : versionPaidFor ? (
                  // Binder matches an already-paid version (credit print or purchase) — free.
                  <>
                    <Pressable
                      onPress={() => void download()}
                      disabled={busy || !counts || counts.total === 0}
                      style={({ pressed }) => [
                        styles.btn,
                        (pressed || busy || !counts || counts.total === 0) && styles.dim,
                      ]}>
                      {busy ? (
                        <ActivityIndicator color={Palette.accentText} />
                      ) : (
                        <Text style={styles.btnText}>Download PDF · already yours, free</Text>
                      )}
                    </Pressable>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                      You already printed this exact version — re-downloads are always free.
                    </ThemedText>
                  </>
                ) : purchased && pState === null ? (
                  // This binder was BOUGHT — resolve where the purchase stands before showing
                  // any credit/upgrade UI (a paid unlock always beats spending a credit).
                  <View style={styles.center}>
                    <ActivityIndicator />
                  </View>
                ) : purchased && pState === 'unspent' ? (
                  // An unspent (or re-armed) purchase for THIS binder: use it first — even for
                  // PRO/VIP, the unlock is already paid for and credits keep for other binders.
                  <>
                    <Pressable
                      onPress={() => setConfirming('spend')}
                      disabled={busy || !counts || counts.total === 0}
                      style={({ pressed }) => [
                        styles.btn,
                        (pressed || busy || !counts || counts.total === 0) && styles.dim,
                      ]}>
                      <Text style={styles.btnText}>Download</Text>
                    </Pressable>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                      Your unlock covers this binder as it is right now. Downloading locks in
                      this version — re-download it anytime, forever.
                    </ThemedText>
                  </>
                ) : hasFullPrint && !metered ? (
                  // Unlimited included prints (enforcement off) — the plain subscriber button.
                  <Pressable
                    onPress={() => void download()}
                    disabled={busy || !counts || counts.total === 0}
                    style={({ pressed }) => [
                      styles.btn,
                      (pressed || busy || !counts || counts.total === 0) && styles.dim,
                    ]}>
                    {busy ? (
                      <ActivityIndicator color={Palette.accentText} />
                    ) : (
                      <Text style={styles.btnText}>Download PDF</Text>
                    )}
                  </Pressable>
                ) : hasFullPrint && printsUsed === null ? (
                  <View style={styles.center}>
                    <ActivityIndicator />
                  </View>
                ) : hasFullPrint && creditsLeft > 0 ? (
                  // Subscriber with credits: spending one requires the confirm step above.
                  <>
                    <Pressable
                      onPress={() => setConfirming('credit')}
                      disabled={busy || !counts || counts.total === 0}
                      style={({ pressed }) => [
                        styles.btn,
                        (pressed || busy || !counts || counts.total === 0) && styles.dim,
                      ]}>
                      <Text style={styles.btnText}>
                        Use 1 included print · {creditsLeft} of {allocation} left {periodWord}
                      </Text>
                    </Pressable>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                      Each print covers this binder as it is right now, and that version stays
                      re-downloadable free, forever.
                    </ThemedText>
                    {/* Yearly subscribers who have already spent one print can release the rest
                        of the year here, at the moment the monthly pace is on their mind. */}
                    {poolOffer.state === 'available' ? (
                      <ThemedText
                        type="linkPrimary"
                        style={styles.poolLink}
                        onPress={() => setConfirming('pool')}>
                        Use all {poolOffer.total} of this year’s prints instead ›
                      </ThemedText>
                    ) : null}
                    {allowance.error ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                        {allowance.error}
                      </ThemedText>
                    ) : null}
                  </>
                ) : hasFullPrint ? (
                  // Subscriber out of credits for this window. A yearly subscriber has more
                  // prints already paid for — offer those BEFORE selling anything.
                  <View style={styles.lockedBox}>
                    <ThemedText type="smallBold">
                      You’ve used your {allocation} included print{allocation === 1 ? '' : 's'} {periodWord}
                    </ThemedText>
                    {poolOffer.state === 'available' ? (
                      <>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                          You have {poolOffer.total} prints paid for this year. Release the rest of
                          them now and print whenever you want.
                        </ThemedText>
                        <Pressable
                          onPress={() => setConfirming('pool')}
                          disabled={allowance.unlocking}
                          style={({ pressed }) => [
                            styles.btn,
                            (pressed || allowance.unlocking) && styles.dim,
                          ]}>
                          {allowance.unlocking ? (
                            <ActivityIndicator color={Palette.accentText} />
                          ) : (
                            <Text style={styles.btnText}>
                              Use my {poolOffer.total} prints for the year
                            </Text>
                          )}
                        </Pressable>
                      </>
                    ) : (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                        {poolOffer.state === 'needsFirstPrint'
                          ? ANNUAL_POOL.needsFirstPrint(poolOffer.total)
                          : `Included prints renew ${printWindow?.kind === 'year' ? 'when your plan renews' : 'at the start of your next billing month'}. Need this one now? Unlock just this binder once for $3.99 — that version is yours to re-download forever.`}
                      </ThemedText>
                    )}
                    {allowance.error ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                        {allowance.error}
                      </ThemedText>
                    ) : null}
                    {CHECKOUT_OPEN ? (
                      <Pressable
                        onPress={() => setConfirming('buy')}
                        disabled={buying}
                        style={({ pressed }) => [
                          poolOffer.state === 'available' ? styles.cancelBtn : styles.btn,
                          (pressed || buying) && styles.dim,
                        ]}>
                        <Text
                          style={
                            poolOffer.state === 'available' ? styles.exampleBtnText : styles.btnText
                          }>
                          Unlock this binder · $3.99
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : entLoading || ((purchased || hasFullPrint) && pState === null) ? (
                  <View style={styles.center}>
                    <ActivityIndicator />
                  </View>
                ) : purchased && pState === 'edited' ? (
                  // Purchases spent on earlier versions and the binder has changed since. Every
                  // bought version stays downloadable (list below); the edited one needs a new unlock.
                  <View style={styles.lockedBox}>
                    <ThemedText type="smallBold">This binder changed since you bought its PDF</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                      Your purchased version{versions.length === 1 ? ' is' : 's are'} below —
                      download them anytime. Printing the edited version needs its own unlock, or
                      a PRO/VIP plan.
                    </ThemedText>
                    {CHECKOUT_OPEN ? (
                      <Pressable
                        onPress={() => setConfirming('buy')}
                        disabled={buying}
                        style={({ pressed }) => [styles.btn, (pressed || buying) && styles.dim]}>
                        <Text style={styles.btnText}>Unlock this version · $3.99</Text>
                      </Pressable>
                    ) : (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                        Purchases aren’t open quite yet; check back soon.
                      </ThemedText>
                    )}
                  </View>
                ) : CHECKOUT_OPEN ? (
                  <View style={styles.lockedBox}>
                    <ThemedText type="smallBold">Printing is a paid feature</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                      Fill-sheet PDFs come with a PRO or VIP plan. Or unlock just this binder once
                      for $3.99 — that download is this binder as it is today, yours to re-download
                      forever (later edits need a new unlock).
                    </ThemedText>
                    {/* Eligible free users see the trial first — start it and the sheet re-renders
                        to the subscriber Download button. Renders null when not eligible. */}
                    <TrialCta message="New here? Try PRO free and print this binder." />
                    <Pressable
                      onPress={() => setConfirming('buy')}
                      disabled={buying}
                      style={({ pressed }) => [styles.btn, (pressed || buying) && styles.dim]}>
                      <Text style={styles.btnText}>Unlock this binder · $3.99</Text>
                    </Pressable>
                  </View>
                ) : (
                  // No dead purchase button while checkout isn't open — an honest note instead.
                  <View style={styles.lockedBox}>
                    <ThemedText type="smallBold">Printing is a paid feature</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                      Fill-sheet PDFs of your own binders come with a PRO/VIP plan, or a one-time
                      unlock for this binder (covering it as it is at purchase — later edits need a
                      new unlock). Purchases aren’t open quite yet; check back soon.
                    </ThemedText>
                  </View>
                )}

                {/* Every printed/purchased version, newest first — each downloadable forever,
                    whatever the binder looks like now ("print a previous version"). */}
                {versions.length > 0 ? (
                  <View style={styles.versionsBox}>
                    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.versionsTitle}>
                      YOUR PURCHASED VERSIONS
                    </ThemedText>
                    {versions.map((v) => {
                      const isBusy = archBusyPath != null && archBusyPath === (v.pdfPath ?? 'pending');
                      const when = new Date(v.spentAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      });
                      return (
                        <View key={v.fingerprint} style={styles.versionRow}>
                          <ThemedText type="small" themeColor="textSecondary" style={styles.versionMeta}>
                            {when}
                            {v.sheets != null ? ` · ${v.sheets} sheet${v.sheets === 1 ? '' : 's'}` : ''}
                          </ThemedText>
                          <Pressable
                            onPress={() => void downloadArchived(v)}
                            disabled={archBusyPath != null}
                            style={({ pressed }) => [
                              styles.versionBtn,
                              (pressed || archBusyPath != null) && styles.dim,
                            ]}>
                            {isBusy ? (
                              <ActivityIndicator color={Palette.accent} />
                            ) : (
                              <Text style={styles.exampleBtnText}>Download</Text>
                            )}
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {/* Example PDFs — the curated 6-page sampler (placeholders + art), so both output
                    files download. Always available (never hidden behind the catalog load): the
                    button shows a spinner until the catalog is ready, then generates. Non-payers
                    see the format before buying; payers test printer scale without spending a credit. */}
                {exBusy ? (
                  <View style={styles.center}>
                    <LogoLoader
                      label={catalog ? 'Generating example…' : 'Preparing example…'}
                      variant="thinking"
                    />
                  </View>
                ) : (
                  <Pressable
                    onPress={downloadExample}
                    style={({ pressed }) => [styles.exampleBtn, pressed && styles.dim]}>
                    <Text style={styles.exampleBtnText}>See a free example (2 sample PDFs)</Text>
                  </Pressable>
                )}

                {/* View the same sampler as a binder (read-only reference — can't be edited or
                    copied), so you can see how the pages map to the printed files. */}
                <ThemedText
                  type="linkPrimary"
                  style={styles.viewExampleLink}
                  onPress={() => {
                    onClose();
                    router.push(`/binder/${EXAMPLE_FILL_SHEET_BINDER.id}`);
                  }}>
                  View the example binder ›
                </ThemedText>

                {error ? (
                  <ThemedText type="small" style={styles.error}>
                    {error}
                  </ThemedText>
                ) : null}
              </>
            )}

      {/* The unlock landed on this visit back from checkout — celebrate the document, once. */}
      <PdfUnlockedModal
        visible={cameFromCheckout && purchased && !celebrated}
        binderTitle={binder.title}
        onClose={() => setCelebrated(true)}
      />
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  sub: { lineHeight: 20 },
  legalNote: { lineHeight: 17, fontSize: FontSize.sm, fontStyle: 'italic' },
  center: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.two },
  btn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.semibold },
  exampleBtn: {
    borderWidth: 1,
    borderColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  exampleBtnText: { color: Palette.accent, fontSize: FontSize.label, fontWeight: Weight.semibold },
  viewExampleLink: { fontSize: FontSize.label, textAlign: 'center', marginTop: 2 },
  versionsBox: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  versionsTitle: { textTransform: 'uppercase', letterSpacing: 0.5, fontSize: FontSize.label },
  versionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  versionMeta: { flex: 1 },
  versionBtn: {
    borderWidth: 1,
    borderColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    minWidth: 96,
    alignItems: 'center',
  },
  dim: { opacity: 0.6 },
  confirmBox: {
    borderWidth: 1.5,
    borderColor: Palette.accent,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    backgroundColor: Palette.selectionSoft,
  },
  confirmRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  confirmBtn: { flex: 1 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  error: { color: Palette.danger, lineHeight: 20 },
  poolLink: { fontSize: FontSize.label, marginTop: 2 },
  lockedBox: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.one,
    backgroundColor: Palette.panel,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  toggleBox: {
    width: 18,
    height: 18,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBoxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  toggleTick: { color: Palette.accentText, fontSize: 12, fontWeight: Weight.bold, lineHeight: 14 },
});
