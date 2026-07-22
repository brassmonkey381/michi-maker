/**
 * Post-checkout celebration for the ONE-TIME binder PDF unlock ($3.99) — the fourth michi
 * checkout, and the only one that doesn't return to /plans (Stripe bounces back to whatever
 * page the print sheet was opened from), so WelcomeAboardModal never covered it.
 *
 * The moment is different from a subscription's: nothing about the account changed, one specific
 * binder became printable forever. So this celebrates the DOCUMENT — what the unlock covers,
 * that it's re-downloadable for good, and where to read our paper/printer guidance before
 * spending ink on it. (A print-service partnership may live here later; today the link is our
 * own guide.)
 *
 * Fires from PrintPlaceholdersSheet when the entitlement lands after ?checkout=success.
 */
import { useRouter, type Href } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';

export function PdfUnlockedModal({
  visible,
  binderTitle,
  onClose,
}: {
  visible: boolean;
  binderTitle: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const readGuide = () => {
    onClose();
    router.push('/learn/print-binder' as Href);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={[sheet.dialogCard, styles.card]}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.chip}>
                <ThemedText type="smallBold" style={styles.chipText}>
                  Unlocked
                </ThemedText>
              </View>
              <ThemedText type="subtitle" style={styles.title}>
                {binderTitle} is ready to print
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
                Your unlock covers this binder exactly as it is today, and that version stays
                yours to download forever.
              </ThemedText>

              <View style={styles.features}>
                {[
                  'Two files: plain-paper placeholders and a matte-cardstock art sheet',
                  'Every piece at true 2.5 by 3.5 inch card size, cut-ready',
                  'Re-download any time, even years from now',
                  'Edit the binder later and the version you bought still prints',
                ].map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <ThemedText type="smallBold" style={styles.tick}>
                      ✓
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.featureText}>
                      {f}
                    </ThemedText>
                  </View>
                ))}
              </View>

              <View style={styles.guide}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.guideLabel}>
                  BEFORE YOU PRINT
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.guideText}>
                  Paper choice makes or breaks a fill sheet. Our guide covers which half wants
                  cardstock, why matte beats glossy behind a sleeve, and the one setting that
                  quietly shrinks every card.
                </ThemedText>
                <Pressable
                  onPress={readGuide}
                  style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                  <ThemedText type="smallBold" style={styles.secondaryText}>
                    Read the printing guide →
                  </ThemedText>
                </Pressable>
              </View>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.ctaText}>
                  Download my sheets
                </ThemedText>
              </Pressable>
            </ScrollView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cardWrap: { width: '100%', maxWidth: 520 },
  card: { maxHeight: '100%' },
  scroll: { gap: Spacing.three, alignItems: 'center' },
  chip: {
    backgroundColor: Palette.selectionSoft,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Palette.link,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: Weight.semibold,
  },
  title: { textAlign: 'center' },
  lede: { lineHeight: 20, textAlign: 'center' },
  features: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.one },
  featureRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  tick: { color: Palette.accent, fontSize: FontSize.label, lineHeight: 19 },
  featureText: { flex: 1, lineHeight: 19 },
  guide: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panelAlt,
  },
  guideLabel: { fontSize: FontSize.sm, letterSpacing: 0.5 },
  guideText: { lineHeight: 18 },
  secondary: { alignSelf: 'flex-start' },
  secondaryText: { color: Palette.link, fontSize: FontSize.label },
  cta: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    marginTop: Spacing.two,
  },
  ctaText: { color: Palette.accentText },
  pressed: { opacity: 0.7 },
});
