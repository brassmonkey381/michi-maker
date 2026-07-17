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
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import type { DemoBinder } from '@/data/binderTypes';
import { fetchUserCards } from '@/data/collectionRepo';
import { createWebArtLoader } from '@/data/fillSheetArt';
import { startCheckout } from '@/data/checkout';
import { buildPlaceholderPdf, collectFillTiles } from '@/data/placeholderPdf';
import {
  downloadPurchasedPdf,
  purchaseStatus,
  spendPurchase,
  type PurchasedVersion,
  type PurchaseStatus,
} from '@/data/pdfSnapshot';
import { recordPrintEvent } from '@/data/printRepo';
import { BINDER_PDF_LOOKUP_KEY, CHECKOUT_OPEN } from '@/data/subscriptions';
import { useCatalog } from '@/hooks/use-catalog';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

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
  const { hasFullPrint, products, loading: entLoading } = useTier();
  const purchased = products.includes(`pdf_binder:${binder.id}`);
  const { isSignedIn } = useAuth();
  const store = useBinders();
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [exBusy, setExBusy] = useState(false);
  // pdfPath of the purchased version currently downloading (one at a time), or null.
  const [archBusyPath, setArchBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Where the per-binder purchase stands (state + every purchased version); null while resolving.
  const [pStatus, setPStatus] = useState<PurchaseStatus | null>(null);
  useEffect(() => {
    if (!purchased || hasFullPrint) return;
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
  }, [purchased, hasFullPrint, binder]);
  const pState = pStatus?.state ?? null;
  const versions = pStatus?.versions ?? [];
  // Subscribers print freely; a purchase covers its snapshot (unspent = next download locks it in).
  const unlocked = hasFullPrint || (purchased && (pState === 'unspent' || pState === 'current'));

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

  const download = async () => {
    if (!catalog || !counts || counts.total === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await buildPlaceholderPdf(binder, catalog, {
        ownedIds: effectiveOwned,
        // Art pixels: direct CORS fetch → art-proxy edge fn fallback → webp/canvas convert.
        loadImage: createWebArtLoader(),
      });
      const filename = `${binder.title.replace(/[^\w\- ]+/g, '').trim() || 'binder'} fill sheets.pdf`;
      // Web: a plain blob download. (Native share-sheet export can come later.)
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      // A one-time purchase SPENDS on this download: record the binder's fingerprint + archive
      // these exact bytes as a NEW purchased version (earlier versions stay downloadable too).
      if (!hasFullPrint && purchased && pState === 'unspent') {
        const v = await spendPurchase(binder, bytes, sheets).catch(() => null);
        setPStatus((prev) => ({
          state: 'current',
          versions: v
            ? [v, ...(prev?.versions ?? []).filter((p) => p.fingerprint !== v.fingerprint)]
            : (prev?.versions ?? []),
        }));
      }
      // Count against the plan's included monthly prints (advisory ledger; failure is fine —
      // the meter just misses one, the user keeps their PDF).
      recordPrintEvent(binder.id, sheets).catch(() => {});
      onDone?.(sheets);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Serve one archived purchased version (every spent purchase stays downloadable forever). */
  const downloadArchived = async (version: PurchasedVersion) => {
    if (archBusyPath) return;
    setArchBusyPath(version.pdfPath ?? 'pending');
    setError(null);
    try {
      const blob = await downloadPurchasedPdf(version);
      if (!blob) throw new Error('Your purchased PDF couldn’t be found. Contact support and we’ll sort it out.');
      const stamp = new Date(version.spentAt).toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${binder.title.replace(/[^\w\- ]+/g, '').trim() || 'binder'} fill sheets (purchased ${stamp}).pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setArchBusyPath(null);
    }
  };

  /** Launch the one-time purchase for THIS binder (first buy and buy-again after edits). */
  const buyBinderPdf = () => {
    if (buying) return;
    setBuying(true);
    setError(null);
    startCheckout(BINDER_PDF_LOOKUP_KEY, { binderId: binder.id })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBuying(false));
  };

  // Free teaser: a SHORT example PDF built from a bundled example binder (its first page of example
  // cards + artwork), so non-payers can see the exact format without printing their own binders.
  const downloadExample = async () => {
    if (!catalog || exBusy) return;
    const ex = store.exampleBinders[0];
    if (!ex) return;
    setExBusy(true);
    setError(null);
    try {
      const short = { ...ex, pages: ex.pages.slice(0, 1) };
      const bytes = await buildPlaceholderPdf(short, catalog, { loadImage: createWebArtLoader() });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'michi example fill sheet.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={sheet.dialogCard}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                Print fill sheets
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

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
                  A print-ready PDF of this binder’s pages as cut-ready fill sheets: card
                  placeholders (labeled with pocket + name/set/number), the binder’s ART pieces
                  (gap-compensated so pictures stay continuous across pocket dividers), and
                  color inserts. Every piece is real card size (2.5″ × 3.5″): print at 100%,
                  cut along the guides, slide in.
                </ThemedText>

                {!catalog && loading ? (
                  <View style={styles.center}>
                    <ActivityIndicator />
                    <ThemedText type="small" themeColor="textSecondary">
                      Loading the card catalog…
                    </ThemedText>
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
                    {sheets === 1 ? '' : 's'} (plus a cover with print instructions).
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

                {unlocked ? (
                  <>
                    <Pressable
                      onPress={download}
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
                    {!hasFullPrint && pState === 'unspent' ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                        Your unlock covers this binder as it is right now. Downloading locks in
                        this version — re-download it anytime, forever. Printing future edits
                        will need a new unlock or a PRO/VIP plan.
                      </ThemedText>
                    ) : null}
                  </>
                ) : entLoading || (purchased && pState === null) ? (
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
                        onPress={buyBinderPdf}
                        disabled={buying}
                        style={({ pressed }) => [styles.btn, (pressed || buying) && styles.dim]}>
                        {buying ? (
                          <ActivityIndicator color={Palette.accentText} />
                        ) : (
                          <Text style={styles.btnText}>Unlock this version · $3.99</Text>
                        )}
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
                    <Pressable
                      onPress={buyBinderPdf}
                      disabled={buying}
                      style={({ pressed }) => [styles.btn, (pressed || buying) && styles.dim]}>
                      {buying ? (
                        <ActivityIndicator color={Palette.accentText} />
                      ) : (
                        <Text style={styles.btnText}>Unlock this binder · $3.99</Text>
                      )}
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

                {/* Every purchased version, newest first — each downloadable forever, whatever
                    the binder looks like now. This is the version PICKER for multi-buy binders. */}
                {!hasFullPrint && versions.length > 0 ? (
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

                {/* Free teaser — a short example PDF (example cards + art), never the user's binder.
                    Hidden for purchasers: they've seen real output (edited state offers the archive). */}
                {!unlocked && !entLoading && !purchased && catalog && store.exampleBinders.length > 0 ? (
                  <Pressable
                    onPress={downloadExample}
                    disabled={exBusy}
                    style={({ pressed }) => [styles.exampleBtn, (pressed || exBusy) && styles.dim]}>
                    {exBusy ? (
                      <ActivityIndicator color={Palette.accent} />
                    ) : (
                      <Text style={styles.exampleBtnText}>See a free example (PDF)</Text>
                    )}
                  </Pressable>
                ) : null}

                {error ? (
                  <ThemedText type="small" style={styles.error}>
                    {error}
                  </ThemedText>
                ) : null}
              </>
            )}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cardWrap: { width: '100%', maxWidth: 440 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  sub: { lineHeight: 20 },
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
  error: { color: Palette.danger, lineHeight: 20 },
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
