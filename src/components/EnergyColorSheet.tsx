/**
 * FREE-tier color search: pick an energy TYPE (Grass/Fire/Water/…) and browse cards of that type.
 * Shown to free/guest users where a paid subscriber gets the full Tri-Color Search palette picker
 * (see ColorSearchSheet). Runs entirely on the existing query grammar — a tap emits
 * `sendBrowseCommand({ type: 'search', query: 'type:<energy>' })`, which the browser (warm or cold)
 * resolves against `card.types`. No colour index, no server RPC.
 *
 * A locked row advertises the paid Tri-Color Search and opens the same TriColorUpsell walkthrough
 * used by the composer gate.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { sendBrowseCommand } from 'tcgscan-browse';

import { TriColorUpsell } from '@/components/binder/TriColorUpsell';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { Catalog } from '@/lib/catalog';

/** The eleven TCG energy types + a vivid swatch each. `query` is the grammar token the tap runs. */
const ENERGY: { type: string; color: string }[] = [
  { type: 'Grass', color: '#63B34E' },
  { type: 'Fire', color: '#E8563B' },
  { type: 'Water', color: '#4B9BE0' },
  { type: 'Lightning', color: '#F2C43B' },
  { type: 'Psychic', color: '#B15BC9' },
  { type: 'Fighting', color: '#C25B34' },
  { type: 'Darkness', color: '#3E4A5C' },
  { type: 'Metal', color: '#8C9BAA' },
  { type: 'Fairy', color: '#E87AB0' },
  { type: 'Dragon', color: '#C9A227' },
  { type: 'Colorless', color: '#C9C6BE' },
];

export function EnergyColorSheet({ catalog, onClose }: { catalog: Catalog | null; onClose: () => void }) {
  const [upsell, setUpsell] = useState(false);

  const pick = (type: string) => {
    sendBrowseCommand({ type: 'search', query: `type:${type.toLowerCase()}` });
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Search by color</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>Pick an energy type to browse cards in its colour.</Text>
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {ENERGY.map((e) => (
              <Pressable key={e.type} onPress={() => pick(e.type)} style={styles.swatchItem}>
                <View style={[styles.swatch, { backgroundColor: e.color }]} />
                <Text style={styles.swatchLabel}>{e.type}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Upsell to the paid palette search. */}
          <Pressable onPress={() => setUpsell(true)} style={styles.upsellRow}>
            <View style={styles.upsellText}>
              <Text style={styles.upsellTitle}>Tri-Color Search</Text>
              <Text style={styles.upsellDesc}>Match cards by their exact palette. Mix up to three colours.</Text>
            </View>
            <View style={styles.proPill}>
              <Text style={styles.proPillText}>PRO</Text>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>

      <TriColorUpsell
        visible={upsell}
        onClose={() => setUpsell(false)}
        catalog={catalog}
        onBeforeUpgrade={onClose}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Palette.scrim45, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Palette.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    maxHeight: '80%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.ink },
  close: { fontSize: FontSize.md, color: Palette.muted, paddingHorizontal: Spacing.two },
  hint: { fontSize: FontSize.control, color: Palette.ink2, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'center', paddingVertical: Spacing.one },
  swatchItem: { alignItems: 'center', gap: 4, width: 72 },
  swatch: { width: 56, height: 56, borderRadius: Radius.control, borderWidth: 2, borderColor: Palette.surface },
  swatchLabel: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  upsellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  upsellText: { flex: 1, gap: 2 },
  upsellTitle: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  upsellDesc: { fontSize: FontSize.label, color: Palette.ink2, lineHeight: 16 },
  proPill: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  proPillText: { fontSize: FontSize.tag, color: Palette.ink2, fontWeight: '700', letterSpacing: 0.5 },
});
