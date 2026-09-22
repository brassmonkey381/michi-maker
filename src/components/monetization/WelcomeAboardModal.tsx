/**
 * Post-checkout celebration modal — the big "Welcome aboard" moment after a subscription
 * checkout settles on /plans (?checkout=success + the tier flip). Replaces the old one-line
 * banner: a centred dialog (shared `sheet.dialog*` scaffold) listing what the plan just unlocked,
 * read straight off the COMPARISON table the member bought from so the two can never disagree.
 *
 * It used to carry the 60% cross-app cross-sell too; that discount is retired, so the section and
 * its heading are gone rather than left rendering an empty promise.
 *
 * Shown once per arrival (parent owns visibility); dismissing returns to the plan page.
 */
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { COMPARISON } from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';

/**
 * WHAT JUST UNLOCKED, READ OFF THE TABLE THEY BOUGHT FROM.
 *
 * This was a hand-typed list and it went stale the day the 2026-09 rework shipped: it told a
 * brand-new PRO member, in the seconds after their card was charged, that their plan was "12
 * binders, 40 pages each" and "1,000 Slice Studio artworks" — a twelfth of what they had just
 * bought, contradicting the Unlimited in the comparison table two scroll-lengths above it. It also
 * promised "1 included print a month, 12 a year", and no plan has included a print since that same
 * rework set includedPrintsPerMonth to 0 for every tier; the member would have gone to print a
 * binder and been asked for $1.99.
 *
 * So it no longer keeps its own copy of the truth. Deriving from COMPARISON means the celebration
 * screen and the plans table are the same sentence rendered twice, and a cap can only be wrong in
 * both places at once — which is a thing somebody notices.
 *
 * A '✓' cell is a capability that is simply ON, so its name alone is the whole message; a cell
 * with words has something to say, and says it after a colon.
 */
function unlockedByPro(): string[] {
  return COMPARISON
    // ONLY WHAT CHANGED. A row where PRO matches Free is something the buyer already had, and
    // crediting the purchase with it is the same kind of untruth as understating a cap.
    .filter((row) => row.pro.text !== row.free.text)
    .map((row) => (row.pro.text === '✓' ? row.capability : `${row.capability}: ${row.pro.text}`));
}

export function WelcomeAboardModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tier } = useTier();
  // A legacy VIP sees the PRO unlock list, which is correct rather than lazy: VIP is retired and
  // "reads as PRO everywhere" post-rework (PlanComparison.tsx:119). The chip still names their own
  // tier, because that is what their account actually holds.
  const planName = tier === 'vip' ? 'VIP' : 'PRO';

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
              {/* NOT "on web, iOS, and Android". michi-maker ships web only and has no native
                  build planned, so that sentence promised two apps that do not exist, at the
                  moment money changed hands. What is true is that the plan follows the account. */}
              <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
                Your {planName} plan is live on this account. Here is what just unlocked:
              </ThemedText>

              <View style={styles.features}>
                {unlockedByPro().map((f) => (
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

              {/* THE CROSS-SELL IS GONE, AND SO IS ITS HEADING. BundleOffer sold the 60%
                  cross-app discount and returns null unconditionally now that it is retired
                  (BundleOffer.tsx:148), so this rendered a bare "ONE MORE THING" with nothing
                  under it on every single web purchase. An empty promise on the celebration
                  screen is worse than no promise. If the two-app bundle is ever offered here,
                  it comes back as a component that renders its own heading, so the heading
                  cannot outlive the offer a second time. */}

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
