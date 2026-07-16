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
import { buildPlaceholderPdf, collectFillTiles } from '@/data/placeholderPdf';
import { recordPrintEvent } from '@/data/printRepo';
import { useCatalog } from '@/hooks/use-catalog';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';

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
  // Full print comes with PRO/VIP, or a one-time pdf_print unlock (grandfathered — existing
  // holders keep it forever). The counts preview stays free as the teaser.
  const { hasFullPrint: unlocked, loading: entLoading } = useTier();
  const { isSignedIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                ) : entLoading ? (
                  <View style={styles.center}>
                    <ActivityIndicator />
                  </View>
                ) : (
                  // No dead purchase button while checkout isn't wired — an honest note instead.
                  <View style={styles.lockedBox}>
                    <ThemedText type="smallBold">Printing is a paid feature</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                      Full fill-sheet PDFs come with a PRO plan, or a small one-time unlock. Print
                      any of your binders forever. Purchases aren’t open quite yet; check back soon.
                    </ThemedText>
                  </View>
                )}

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
