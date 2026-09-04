/**
 * THE SISTER APP, SAID PLAINLY. TCGScan is the phone app that scans cards into a collection, and
 * that collection is what the curator builds binders from — the two products are one loop:
 * scan it there, compose it here, print it, fill the real binder. Until now TCGScan surfaced only
 * in fine print and a synergy note on the import sheet; a visitor could use michi-maker for a
 * month without learning it existed.
 *
 * One block, the same on every surface it appears on (Home, Welcome, My binders), with the loop
 * drawn as three steps and one button. The button goes through openTcgscan, which mints the SSO
 * handoff so a signed-in member lands on tcgscan.ai already signed in.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openTcgscan } from '@/components/monetization/BundleOffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import { track } from '@/lib/analytics';

const STEPS: { glyph: string; head: string; body: string }[] = [
  { glyph: '📷', head: 'Scan', body: 'Point TCGScan at a card, a page, a whole binder. It reads them into your collection.' },
  { glyph: '📖', head: 'Compose', body: 'Your collection syncs here. The curator builds pages from the cards you actually own.' },
  { glyph: '🖨️', head: 'Fill', body: 'Print the fill sheets at true size, and swap the placeholders as the cards come in.' },
];

export function TcgscanPairing({ surface, compact = false }: { surface: string; compact?: boolean }) {
  const go = () => {
    track('tcgscan.pairing_click', { surface });
    openTcgscan();
  };
  return (
    <ThemedView type="backgroundElement" style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>TCGScan</Text>
        </View>
        <ThemedText type="smallBold" style={styles.kicker}>
          Pairs with michi-maker
        </ThemedText>
      </View>
      <ThemedText type="subtitle" style={styles.title}>
        Scan your cards on your phone. Build the binder here.
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        TCGScan is our sister app for iPhone and Android: it scans cards into a collection, tracks what you own
        and what it is worth, and shares one account with michi-maker, so what you scan is what you can build with.
      </ThemedText>
      {!compact ? (
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={s.head} style={styles.step}>
              <Text style={styles.glyph}>{s.glyph}</Text>
              <ThemedText type="smallBold">
                {i + 1}. {s.head}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.stepBody}>
                {s.body}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable onPress={go} accessibilityRole="link" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Get TCGScan</Text>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary">
          Free to start. PRO and VIP members get a bundle discount.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    gap: Spacing.two,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    ...Shadows.page,
  },
  cardCompact: { padding: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: { backgroundColor: Palette.chrome, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#F5EFE4', fontSize: FontSize.label, fontWeight: Weight.bold, letterSpacing: 0.3 },
  kicker: { color: Palette.accent, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: FontSize.label },
  title: { marginTop: 2 },
  lede: { maxWidth: 620 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.two },
  step: { flex: 1, minWidth: 180, gap: 2 },
  glyph: { fontSize: 20 },
  stepBody: { lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  primary: { backgroundColor: Palette.accent, borderRadius: Radius.pill, paddingHorizontal: Spacing.four, paddingVertical: 8 },
  primaryText: { color: Palette.accentText, fontSize: FontSize.body, fontWeight: Weight.semibold },
  pressed: { opacity: 0.75 },
});
