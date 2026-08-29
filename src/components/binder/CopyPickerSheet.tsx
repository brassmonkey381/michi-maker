/**
 * WHICH OF YOUR CARDS goes in this pocket — or none of them.
 *
 * A cardId names a printing; it does not name a possession. When you own copies of the card being
 * placed, this is where that difference gets settled: pick the copy (each with its own scan, so
 * three of the same card are three different cards here), or say the pocket is just the catalogue
 * image and keep every copy free.
 *
 * IT ONLY OPENS WHEN THERE IS SOMETHING TO DECIDE — at least one unplaced copy. A card you do not
 * own has no question attached to it and is placed straight away, which is most of browsing.
 *
 * The catalogue option is not a cancel and is not a lesser choice: a binder page of cards you are
 * HUNTING is a real thing to build, and the pocket that means "I want this" must not quietly eat a
 * card you already own. Choosing it leaves the pocket aspirational, exactly as it was before the
 * copy accounting existed.
 */
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { OwnedEntry } from '@/data/ownedCopies';
import { useScanImages } from '@/hooks/use-scan-images';
import { cardThumbUrl } from '@/lib/catalogConfig';

/** A scan date reads as a date, not a timestamp — it is the only thing separating two copies. */
function scannedLabel(at: string | null): string {
  if (!at) return 'No photo yet';
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? 'Scanned'
    : `Scanned ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function CopyPickerSheet({
  visible,
  cardId,
  cardName,
  copies,
  currentEntryId,
  onPick,
  onClose,
}: {
  visible: boolean;
  cardId: string;
  cardName?: string;
  /**
   * The copies on offer: unplaced ones, best first (see availableCopiesOf), and — when an existing
   * pocket is being changed — the copy it already holds, which is not "available" precisely
   * because this pocket has it.
   */
  copies: OwnedEntry[];
  /** The copy this pocket already holds, ticked in the list. */
  currentEntryId?: string;
  /** The copy chosen, or null for "just the catalogue image — claim nothing". */
  onPick: (entryId: string | null) => void;
  onClose: () => void;
}) {
  const scans = useScanImages();
  const catalogArt = cardThumbUrl(cardId, 245);

  return (
    <DialogCard visible={visible} onClose={onClose} maxWidth={420} title="Which copy?">
      <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
        {currentEntryId
          ? 'This pocket holds one of your cards. Swap it for another copy, or hand it back and let the pocket be just the catalogue image.'
          : `You own ${copies.length === 1 ? 'a copy' : `${copies.length} copies`} of${
              cardName ? ` ${cardName}` : ' this card'
            } that ${copies.length === 1 ? 'is' : 'are'} not in a binder yet. Pick the one that goes in this pocket, and it stops counting as free.`}
      </ThemedText>

      <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
        {copies.map((c, i) => {
          const scan = scans?.byEntry.get(c.entryId);
          return (
            <Pressable
              key={c.entryId}
              onPress={() => onPick(c.entryId)}
              accessibilityRole="button"
              accessibilityLabel={`Use my copy ${i + 1}, ${scannedLabel(c.scannedAt)}`}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Image
                source={{ uri: scan ?? catalogArt }}
                style={styles.thumb}
                contentFit="cover"
                transition={80}
              />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {copies.length === 1 ? 'My copy' : `My copy ${i + 1}`}
                  {c.quantity > 1 ? ` · lot of ${c.quantity}` : ''}
                  {c.entryId === currentEntryId ? ' ✓ in this pocket' : ''}
                </Text>
                <ThemedText type="small" themeColor="textSecondary">
                  {/* The photo IS the distinction between two copies, so say when there isn't one:
                      an unscanned copy still counts as owned, it just shows the catalogue art. */}
                  {scan ? scannedLabel(c.scannedAt) : 'No photo yet — shows the catalogue image'}
                </ThemedText>
              </View>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={() => onPick(null)}
        accessibilityRole="button"
        accessibilityLabel="Use the catalogue image and keep my copies free"
        style={({ pressed }) => [styles.row, styles.catalogRow, pressed && styles.pressed]}>
        <Image source={{ uri: catalogArt }} style={styles.thumb} contentFit="cover" transition={80} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>
            {currentEntryId ? 'Let my card go — just the catalogue image' : 'Just the catalogue image'}
          </Text>
          <ThemedText type="small" themeColor="textSecondary">
            {currentEntryId
              ? 'The copy goes back to being free, and the pocket stays as it looks.'
              : 'None of your cards is tied to this pocket — for a page of cards you are still after.'}
          </ThemedText>
        </View>
        <Text style={styles.chev}>›</Text>
      </Pressable>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  intro: { lineHeight: 18 },
  list: { maxHeight: 260 },
  listInner: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  // Set apart from the copies above it: it is the other KIND of answer, not another copy.
  catalogRow: { marginTop: Spacing.two, borderStyle: 'dashed' },
  pressed: { opacity: 0.8 },
  thumb: { width: 44, height: 44 * (88 / 63), borderRadius: Radius.xs, backgroundColor: Palette.panel },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  chev: { fontSize: 20, color: Palette.muted2, paddingHorizontal: Spacing.one },
});
