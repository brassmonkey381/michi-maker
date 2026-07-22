/**
 * Post-checkout celebration modal — the big "Welcome aboard" moment after a subscription
 * checkout settles on /plans (?checkout=success + the tier flip). Replaces the old one-line
 * banner: a centred dialog (shared `sheet.dialog*` scaffold) with the tier's unlocked features
 * and the BUNDLE 60 cross-sell while the member's attention is highest. BundleOffer self-gates
 * (paid + no tcgscan_pro), so existing TCGScan members just see the features and the button.
 *
 * Shown once per arrival (parent owns visibility); dismissing returns to the plan page.
 */
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BundleOffer } from '@/components/monetization/BundleOffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { useTier } from '@/hooks/use-tier';

const FEATURES: Record<'pro' | 'vip', string[]> = {
  pro: [
    '12 binders, 40 pages each',
    'Full card catalog, similarity matching and every composer method',
    '1,000 Slice Studio artworks kept',
    'Fill-sheet PDFs with 1 included print a month, 12 a year on yearly billing',
    'Move up to VIP any time, prorated',
  ],
  vip: [
    'Unlimited binders and pages',
    'Unlimited Slice Studio artworks',
    'Similarity matching and every composer method',
    'Fill-sheet PDFs with 3 included prints a month, 36 a year on yearly billing',
    'First in line for print extras, plus a featured eligibility boost',
  ],
};

export function WelcomeAboardModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tier } = useTier();
  const plan = tier === 'vip' ? 'vip' : 'pro';
  const planName = plan === 'vip' ? 'VIP' : 'PRO';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheet.dialogBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={[sheet.dialogCard, styles.card]}>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.chip}>
                <ThemedText type="smallBold" style={styles.chipText}>
                  {planName} active
                </ThemedText>
              </View>
              <ThemedText type="subtitle" style={styles.title}>
                Welcome aboard!
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
                Your {planName} plan is live on this account, on web, iOS, and Android. Here is
                what just unlocked:
              </ThemedText>

              <View style={styles.features}>
                {FEATURES[plan].map((f) => (
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

              {/* The cross-sell, while the wallet is warm. Self-gates to members without
                  TCGScan Pro; renders nothing otherwise. */}
              <View style={styles.bundle}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.bundleLabel}>
                  ONE MORE THING
                </ThemedText>
                <BundleOffer />
              </View>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.ctaText}>
                  Start building
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
  bundle: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.two },
  bundleLabel: { fontSize: FontSize.sm, letterSpacing: 0.5 },
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
