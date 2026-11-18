/**
 * MIC-061 (owner 2026-11-18): "Owned" and "Prices" one tap from the binder, without opening
 * Settings. Both read and write the same preferences Settings does (the view's `owned`, and the
 * card labels' Price field), so the two places always agree. Outlined when off, filled when on
 * (toggleChip), 44 px.
 *
 * Prices: on turns the card labels on if they were off and adds the Price field; off removes the
 * Price field and leaves the other labels as they were.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { toggleChip } from '@/constants/ui';
import type { CardLabelPrefsState } from '@/hooks/use-card-label-prefs';

export function pricesOn(labels: Pick<CardLabelPrefsState, 'on' | 'fields'>): boolean {
  return labels.on && labels.fields.includes('price');
}

export function OwnedPriceToggles({
  owned,
  onOwned,
  labels,
  compact = false,
}: {
  owned: boolean;
  onOwned: (on: boolean) => void;
  labels: CardLabelPrefsState;
  /** Tighter padding for the phone row. */
  compact?: boolean;
}) {
  const prices = pricesOn(labels);
  const togglePrices = () => {
    if (prices) {
      labels.toggleField('price');
      return;
    }
    if (!labels.on) labels.setOn(true);
    if (!labels.fields.includes('price')) labels.toggleField('price');
  };
  return (
    <View style={styles.row} testID="owned-price-toggles">
      <Pressable
        onPress={() => onOwned(!owned)}
        accessibilityRole="switch"
        accessibilityState={{ checked: owned }}
        accessibilityLabel="Owned: mark the cards you own and count them"
        testID="toggle-owned"
        style={[toggleChip.base, compact && styles.compact, owned && toggleChip.active]}>
        <Text style={[toggleChip.text, owned && toggleChip.textActive]}>{owned ? '✓ Owned' : 'Owned'}</Text>
      </Pressable>
      <Pressable
        onPress={togglePrices}
        accessibilityRole="switch"
        accessibilityState={{ checked: prices }}
        accessibilityLabel="Prices: show each card's market price and what is left to finish"
        testID="toggle-prices"
        style={[toggleChip.base, compact && styles.compact, prices && toggleChip.active]}>
        <Text style={[toggleChip.text, prices && toggleChip.textActive]}>{prices ? '✓ Prices' : 'Prices'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compact: { paddingHorizontal: 12 },
});
