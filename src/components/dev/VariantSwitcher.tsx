/**
 * Dev-only, web-only floating switcher for the theme variations (Phase 2).
 * Tapping a variant persists it and reloads so the static token styles re-eval.
 * Renders nothing in production or on native.
 */
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing, Weight, FontSize } from '@/constants/theme';
import { VARIANT_LIST, activeVariantId, setVariant } from '@/constants/variants';

export function VariantSwitcher() {
  if (Platform.OS !== 'web' || !__DEV__) return null;

  const active = activeVariantId();

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        {VARIANT_LIST.map((v) => {
          const on = v.id === active;
          return (
            <Pressable
              key={v.id}
              onPress={() => setVariant(v.id)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityLabel={`Theme: ${v.label}`}>
              <ThemedText style={[styles.text, on && styles.textOn]}>{v.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.three,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Radius.pill,
    backgroundColor: Palette.chromeDeep,
    borderWidth: 1,
    borderColor: Palette.grayBorder50,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  chipOn: { backgroundColor: Palette.accent },
  text: { color: Palette.muted4, fontSize: FontSize.label, fontWeight: Weight.semibold },
  textOn: { color: Palette.accentText },
});
