/**
 * EN / JP printing-language multi-select — two pill buttons that drive a kit browser's
 * `languages` prop (CatalogBrowser / RecentProducts). Multi-select: either or both can be on;
 * at least one always stays selected (toggling off the last one is a no-op) so a surface never
 * ends up constrained to nothing.
 *
 * Purely presentational — the parent owns the `value` (and where it's remembered).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type CardLanguage } from 'tcgscan-browse';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

const OPTIONS: { code: CardLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ja', label: 'JP' },
];

export function LanguageToggle({
  value,
  onChange,
}: {
  value: CardLanguage[];
  onChange: (langs: CardLanguage[]) => void;
}) {
  const toggle = (code: CardLanguage) => {
    const on = value.includes(code);
    if (on && value.length === 1) return; // keep at least one language selected
    // Re-derive in canonical order so the value is stable regardless of click order.
    const next = OPTIONS.map((o) => o.code).filter((c) =>
      c === code ? !on : value.includes(c),
    );
    onChange(next);
  };

  return (
    <View style={styles.row}>
      {OPTIONS.map((o) => {
        const active = value.includes(o.code);
        return (
          <Pressable
            key={o.code}
            onPress={() => toggle(o.code)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Show ${o.code === 'ja' ? 'Japanese' : 'English'} cards`}
            style={({ pressed }) => [styles.btn, active && styles.btnActive, pressed && styles.pressed]}>
            <Text style={[styles.txt, active && styles.txtActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.one },
  btn: {
    paddingVertical: 5,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
  },
  btnActive: { backgroundColor: Palette.accent },
  pressed: { opacity: 0.7 },
  txt: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  txtActive: { color: Palette.accentText },
});
