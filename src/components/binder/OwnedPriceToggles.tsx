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

/** Prices on or off the way this pill does it (MIC-072: My Binders' bar shares it). */
export function setPricesOn(labels: Pick<CardLabelPrefsState, 'on' | 'fields' | 'update'>, on: boolean): void {
  if (on === pricesOn(labels)) return;
  if (!on) {
    labels.update({ fields: labels.fields.filter((f) => f !== 'price') });
    return;
  }
  // One write: labels on AND the Price field, so neither undoes the other.
  labels.update({ on: true, fields: labels.fields.includes('price') ? labels.fields : [...labels.fields, 'price'] });
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
  const togglePrices = () => setPricesOn(labels, !prices);
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
