/**
 * WHICH FINISH is the card in this pocket — Normal, Holofoil, Reverse Holofoil, and so on.
 *
 * Unlike every other sheet in the binder, this one does not change the binder. It changes a real
 * row in the collection: the copy the pocket is tied to. That is why the choice goes through a
 * confirmation on the way out, and why this sheet is only reachable from a pocket that actually
 * names an owned copy.
 *
 * THE OPTIONS COME FROM THE CARD, NOT FROM A FIXED N / H / RH TRIPLE. Most cards were printed in
 * exactly one finish, nearly half were never printed as Normal at all, and a whole slice of the
 * catalogue is 1st Edition / Unlimited with none of the three. Offering a finish a card cannot
 * have is not merely untidy: tcgscan-app silently rewrites a stored finish its price data does not
 * list, so the user's choice would quietly undo itself the next time they opened that lot there.
 *
 * The per-finish price is shown because it is the reason the finish matters, and because it makes
 * the consequence of the change visible at the moment of choosing. It is not a prompt and there is
 * nothing to answer about it — picking a finish is picking its price.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { chipFor, variantOptionsFor } from '@/constants/printVariant';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { cardThumbUrl } from '@/lib/catalogConfig';
import { formatUsd, getPriceSummary, priceSnapshot, type PriceSummary } from '@/lib/prices';

export function VariantPickerSheet({
  visible,
  cardId,
  cardName,
  current,
  quantity,
  onPick,
  onClose,
}: {
  visible: boolean;
  cardId: string;
  cardName?: string;
  /** The finish recorded against the copy this pocket holds. */
  current: string;
  /** How many physical cards that one collection row covers — see the warning below. */
  quantity: number;
  onPick: (variant: string) => void;
  onClose: () => void;
}) {
  // Seeded synchronously from the module-level snapshot so a picker opened after the price caption
  // has been used renders instantly; otherwise it fetches on open. NOT loaded eagerly at boot —
  // the summary is several megabytes and most sessions never need it.
  const [summary, setSummary] = useState<PriceSummary | null>(() => priceSnapshot());
  useEffect(() => {
    if (!visible || summary) return;
    let active = true;
    getPriceSummary()
      .then((s) => {
        if (active) setSummary(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible, summary]);

  const priced = summary?.[cardId]?.variants;
  const options = variantOptionsFor(priced, current);
  const catalogArt = cardThumbUrl(cardId, 245);

  return (
    <DialogCard visible={visible} onClose={onClose} maxWidth={420} title="Which finish?">
      <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
        {options.length > 1
          ? `How ${cardName ? cardName : 'this card'} was printed. This is a detail of the copy in your collection, not of the binder — changing it changes the card itself.`
          : `${cardName ? cardName : 'This card'} was only ever printed one way, so there is nothing to change here.`}
      </ThemedText>

      {/* A lot is a ROW, not a card. One row can cover several identical cards, and the finish is
          stored once for the whole row — so there is no way to say "one of these three is the
          reverse holo" without splitting the lot, which happens in tcgscan, not here. Saying so is
          the difference between a user making an informed change and one being surprised by it. */}
      {quantity > 1 && options.length > 1 ? (
        <View style={styles.lotNote}>
          <ThemedText type="small" style={styles.lotNoteText}>
            This is one lot of {quantity} identical cards, so the finish applies to all {quantity}.
            To mark just one of them differently, split the lot in tcgscan first.
          </ThemedText>
        </View>
      ) : null}

      <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
        {options.map((variant) => {
          const chip = chipFor(variant);
          const value = priced?.[variant];
          const isCurrent = variant === current;
          return (
            <Pressable
              key={variant}
              onPress={() => (isCurrent ? onClose() : onPick(variant))}
              accessibilityRole="button"
              accessibilityLabel={`${chip.label}${isCurrent ? ', current' : ''}`}
              style={({ pressed }) => [styles.row, isCurrent && styles.rowCurrent, pressed && styles.pressed]}>
              <Image source={{ uri: catalogArt }} style={styles.thumb} contentFit="cover" transition={80} />
              <View style={[styles.chip, { backgroundColor: chip.fill }]}>
                <Text style={[styles.chipText, { color: chip.text }]}>{chip.letter}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {chip.label}
                  {isCurrent ? ' ✓' : ''}
                </Text>
                <ThemedText type="small" themeColor="textSecondary">
                  {/* An absent price is not a missing finish — it is a finish nobody has priced.
                      Saying "no price" is honest; showing $0.00 would not be. */}
                  {typeof value === 'number' ? formatUsd(value) : 'No price listed'}
                </ThemedText>
              </View>
              {isCurrent ? null : <Text style={styles.chev}>›</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  intro: { lineHeight: 18 },
  lotNote: {
    marginTop: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  lotNoteText: { lineHeight: 18 },
  list: { maxHeight: 300, marginTop: Spacing.two },
  listInner: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  rowCurrent: { borderColor: Palette.accent },
  pressed: { opacity: 0.7 },
  thumb: { width: 34, height: 47, borderRadius: Radius.xs, backgroundColor: Palette.skeletonFill },
  chip: {
    minWidth: 30,
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.tag,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.30)',
  },
  chipText: { fontSize: FontSize.micro, fontWeight: Weight.bold, letterSpacing: 0.5 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink },
  chev: { fontSize: FontSize.md, color: Palette.muted },
});
