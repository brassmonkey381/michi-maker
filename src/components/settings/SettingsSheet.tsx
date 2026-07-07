/**
 * User-facing Settings. A gear button in the home header opens this sheet; the
 * Appearance section lets the user pick a theme variation (see
 * `constants/variants.ts`). Selecting a theme persists it and re-applies (a
 * reload on web, where the token styles are resolved at load).
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import {
  VARIANTS,
  VARIANT_LIST,
  activeVariantId,
  setVariant,
  type VariantId,
} from '@/constants/variants';
import { useTheme } from '@/hooks/use-theme';

/** Gear entry point for the home header. Owns the sheet's open state. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Settings"
        hitSlop={8}
        style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}>
        <ThemedText style={styles.gear}>⚙</ThemedText>
      </Pressable>
      <SettingsSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const current = activeVariantId();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title}>
                Settings
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="link" themeColor="textSecondary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
              APPEARANCE
            </ThemedText>

            <View style={styles.options}>
              {VARIANT_LIST.map((v) => {
                const active = v.id === current;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => setVariant(v.id)}
                    accessibilityLabel={`Theme: ${v.label}`}
                    style={({ pressed }) => [
                      styles.option,
                      { borderColor: active ? Palette.accent : theme.backgroundSelected },
                      pressed && styles.pressed,
                    ]}>
                    <ThemePreview id={v.id} />
                    <View style={styles.optionText}>
                      <ThemedText type="smallBold">{v.label}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {v.desc}
                      </ThemedText>
                    </View>
                    {active ? <ThemedText style={styles.check}>✓</ThemedText> : null}
                  </Pressable>
                );
              })}
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A tiny swatch strip built from the variant's own tokens. */
function ThemePreview({ id }: { id: VariantId }) {
  const t = VARIANTS[id];
  return (
    <View style={styles.preview}>
      <View style={[styles.swatch, { backgroundColor: t.surface.mat }]} />
      <View style={[styles.swatch, { backgroundColor: t.palette.panel }]} />
      <View style={[styles.swatch, { backgroundColor: t.palette.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  gearBtn: { padding: Spacing.one },
  gear: { fontSize: FontSize.title, lineHeight: 28 },
  pressed: { opacity: 0.7 },

  backdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  cardWrap: { width: '100%', maxWidth: 380 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.two },

  options: { gap: Spacing.two, marginTop: Spacing.one },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.panel,
    borderWidth: 1,
  },
  optionText: { flex: 1 },
  check: { color: Palette.accent, fontSize: FontSize.md, fontWeight: Weight.bold },

  preview: {
    flexDirection: 'row',
    width: 54,
    height: 34,
    borderRadius: Radius.thumb,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.grayBorder50,
  },
  swatch: { flex: 1 },
});
