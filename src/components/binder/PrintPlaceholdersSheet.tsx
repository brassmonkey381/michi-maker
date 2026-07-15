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
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';
import { buildPlaceholderPdf, placeholderTiles, sheetsFor } from '@/data/placeholderPdf';
import { useCatalog } from '@/hooks/use-catalog';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tiles = useMemo(
    () => (catalog ? placeholderTiles(binder, catalog) : null),
    [binder, catalog],
  );
  const sheets = tiles ? sheetsFor(tiles.length) : 0;

  const download = async () => {
    if (!catalog || !tiles || tiles.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await buildPlaceholderPdf(binder, catalog);
      const filename = `${binder.title.replace(/[^\w\- ]+/g, '').trim() || 'binder'} placeholders.pdf`;
      // Web: a plain blob download. (Native share-sheet export can come later.)
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
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
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                🖨 Print placeholders
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {guestGated ? (
              <SignInPerk message="Placeholder labels read the full card catalog — sign in (free) to print them." />
            ) : Platform.OS !== 'web' ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                PDF download is available on the web app for now — open michi-maker.com to print
                this binder’s placeholders.
              </ThemedText>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                  A print-ready PDF with one gray placeholder card per pocket — real card size
                  (2.5″ × 3.5″), labeled with its binder page + row/column and the card’s name,
                  set, and number. Print at 100%, cut along the guides, and every pocket tells
                  you which card it’s waiting for.
                </ThemedText>

                {!catalog && loading ? (
                  <View style={styles.center}>
                    <ActivityIndicator />
                    <ThemedText type="small" themeColor="textSecondary">
                      Loading the card catalog…
                    </ThemedText>
                  </View>
                ) : null}

                {tiles ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    <ThemedText type="smallBold">{tiles.length}</ThemedText> placeholder
                    {tiles.length === 1 ? '' : 's'} across{' '}
                    <ThemedText type="smallBold">{sheets}</ThemedText> sheet
                    {sheets === 1 ? '' : 's'} (plus a cover with print instructions).
                  </ThemedText>
                ) : null}
                {tiles && tiles.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    This binder has no cards in its pockets yet — nothing to print.
                  </ThemedText>
                ) : null}

                <Pressable
                  onPress={download}
                  disabled={busy || !tiles || tiles.length === 0}
                  style={({ pressed }) => [
                    styles.btn,
                    (pressed || busy || !tiles || tiles.length === 0) && styles.dim,
                  ]}>
                  {busy ? (
                    <ActivityIndicator color={Palette.accentText} />
                  ) : (
                    <Text style={styles.btnText}>Download PDF</Text>
                  )}
                </Pressable>

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
  backdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  cardWrap: { width: '100%', maxWidth: 440 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three },
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
});
