/**
 * S / M / L card-size selector — three pill buttons that drive the app-wide card size
 * (see `useCardSize`). Purely presentational; the parent owns `value` + `onChange`. Mirrors
 * `LanguageToggle`, driven by the kit's ordered `CARD_SIZES` so the steps always match the kit.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CARD_SIZES, type CardSize } from 'tcgscan-browse';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

export function CardSizeToggle({
  value,
  onChange,
}: {
  value: CardSize;
  onChange: (size: CardSize) => void;
}) {
  return (
    <View style={styles.row}>
      {CARD_SIZES.map((size) => {
        const active = size === value;
        return (
          <Pressable
            key={size}
            onPress={() => onChange(size)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Card size ${size}`}
            style={({ pressed }) => [styles.btn, active && styles.btnActive, pressed && styles.pressed]}>
            <Text style={[styles.txt, active && styles.txtActive]}>{size}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.one },
  btn: {
    minWidth: 28,
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
  },
  btnActive: { backgroundColor: Palette.accent },
  pressed: { opacity: 0.7 },
  txt: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2 },
  txtActive: { color: Palette.accentText },
});
