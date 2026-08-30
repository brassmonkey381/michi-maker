/**
 * Real scans ⇄ Catalogue images — one control, wherever a card can be shown either way.
 *
 * WHY A SEGMENTED PAIR AND NOT A CHECKBOX. "Real scans" as a single chip could only say whether it
 * was on; it could not say what OFF meant, and off is not "no picture" — it is the catalogue image,
 * a different and perfectly good answer. Two labelled halves make both states nameable, which is
 * what lets the same control read correctly on a binder page and in the browser, not just here.
 *
 * It is shown only where the owner actually has scans (the caller gates on that): a toggle whose
 * other half is empty is a question with one answer.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette, Radius, FontSize, Weight } from '@/constants/theme';
import type { ImageSource } from '@/hooks/use-image-source';

const OPTIONS: { value: ImageSource; label: string }[] = [
  { value: 'scans', label: 'Real scans' },
  { value: 'catalog', label: 'Catalog images' },
];

export function ImageSourceToggle({
  value,
  onChange,
}: {
  value: ImageSource;
  onChange: (next: ImageSource) => void;
}) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup">
      {OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.half, on && styles.halfOn]}>
            <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // One pill split in two, so the pair reads as a single control with a side chosen — rather than
  // as two chips that happen to sit together and might both be off.
  group: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
    overflow: 'hidden',
  },
  half: { paddingHorizontal: 12, paddingVertical: 5, minHeight: 30, justifyContent: 'center' },
  halfOn: { backgroundColor: Palette.accent },
  label: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.muted2 },
  labelOn: { color: Palette.accentText },
});
