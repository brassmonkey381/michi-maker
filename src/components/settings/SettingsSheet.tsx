/**
 * User-facing Settings. A gear button in the home header opens this sheet; the
 * Appearance section lets the user pick a theme variation (see
 * `constants/variants.ts`). Selecting a theme persists it and re-applies (a
 * reload on web, where the token styles are resolved at load).
 */
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BundleOffer } from '@/components/monetization/BundleOffer';
import { PlanUsageSection } from '@/components/monetization/TierUsage';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import {
  VARIANTS,
  VARIANT_LIST,
  activeVariantId,
  setVariant,
  type VariantId,
} from '@/constants/variants';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth';

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
        <ThemedText style={styles.gear}>Settings</ThemedText>
      </Pressable>
      <SettingsSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  // Close the sheet first so the modal never sits over the pushed route.
  const go = (href: Href) => {
    onClose();
    router.push(href);
  };
  const current = activeVariantId();
  const { user } = useAuth();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={[sheet.dialogCard, styles.cardGap, styles.cardMax]}>
            <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
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

            {/* The signature look leads; the alternates sit demoted under "More looks" —
                one opinionated default, not four equals. */}
            <View style={styles.options}>
              {VARIANT_LIST.map((v, i) => {
                const active = v.id === current;
                const hero = i === 0;
                return (
                  <View key={v.id}>
                    {i === 1 ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.moreLabel}>
                        More looks
                      </ThemedText>
                    ) : null}
                    <Pressable
                      onPress={() => setVariant(v.id)}
                      accessibilityLabel={`Theme: ${v.label}`}
                      style={({ pressed }) => [
                        styles.option,
                        { borderColor: active ? Palette.accent : theme.backgroundSelected },
                        pressed && styles.pressed,
                      ]}>
                      <ThemePreview id={v.id} />
                      <View style={styles.optionText}>
                        <View style={styles.optionTitleRow}>
                          <ThemedText type="smallBold">{v.label}</ThemedText>
                          {hero ? (
                            <View style={styles.defaultTag}>
                              <Text style={styles.defaultTagText}>DEFAULT</Text>
                            </View>
                          ) : null}
                        </View>
                        <ThemedText type="small" themeColor="textSecondary">
                          {v.desc}
                        </ThemedText>
                      </View>
                      {active ? <ThemedText style={styles.check}>✓</ThemedText> : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
              PLAN
            </ThemedText>
            <PlanUsageSection onManagePlan={() => go('/plans' as Href)} />

            {/* Bundle cross-sell — only renders for a paying member who lacks TCGScan Pro. */}
            {user ? <BundleOffer /> : null}
            </ScrollView>
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
  gear: { fontSize: FontSize.control, fontWeight: '600', lineHeight: 28 },
  pressed: { opacity: 0.7 },

  cardWrap: { width: '100%', maxWidth: 380 },
  cardGap: { gap: Spacing.two },
  cardMax: { maxHeight: '88%' },
  scrollBody: { gap: Spacing.two },
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
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  moreLabel: { marginTop: Spacing.two, marginBottom: Spacing.one },
  defaultTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.tag,
    backgroundColor: Palette.panel,
  },
  defaultTagText: { fontSize: FontSize.micro, fontWeight: Weight.bold, letterSpacing: 0.5, color: Palette.muted },
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
