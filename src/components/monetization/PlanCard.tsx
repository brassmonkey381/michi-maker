/**
 * One plan card on /pricing: name, badge, price, feature bullets, CTA. Presentational — the
 * page owns checkout state and current-plan awareness.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, FontSize, Palette, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import type { PlanSpec } from '@/data/pricing';

export function PlanCard({
  plan,
  isCurrent,
  onSelect,
  note,
}: {
  plan: PlanSpec;
  /** The signed-in user's active tier matches this card. */
  isCurrent: boolean;
  onSelect: () => void;
  /** Honest line shown under the CTA after pressing while checkout is closed. */
  note?: string | null;
}) {
  const free = plan.monthly === null;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.name}>
          {plan.name}
        </ThemedText>
        {plan.badge ? (
          <View style={[styles.badge, plan.badge === 'Most popular' && styles.badgeAccent]}>
            <ThemedText
              type="smallBold"
              style={[styles.badgeText, plan.badge === 'Most popular' && styles.badgeTextAccent]}>
              {plan.badge}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.priceRow}>
        <ThemedText style={styles.price}>{free ? 'Free' : plan.monthly}</ThemedText>
        {!free ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.per}>
            /mo
          </ThemedText>
        ) : null}
      </View>
      {plan.yearly ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.yearly}>
          or {plan.yearly} a year
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.yearly}>
          forever
        </ThemedText>
      )}

      <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
        {plan.blurb}
      </ThemedText>

      <View style={styles.features}>
        {plan.features.map((f) => (
          <View key={f} style={styles.featureRow}>
            <ThemedText style={styles.tick}>✓</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.feature}>
              {f}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.grow} />

      {isCurrent ? (
        <View style={[styles.cta, styles.ctaCurrent]}>
          <ThemedText type="smallBold" style={styles.ctaCurrentText}>
            Your plan
          </ThemedText>
        </View>
      ) : (
        <Pressable onPress={onSelect} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.ctaText}>
            {free ? 'Start free' : `Get ${plan.name}`}
          </ThemedText>
        </Pressable>
      )}
      {note ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          {note}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '31%',
    minWidth: 240,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairline,
    padding: Spacing.four,
    gap: Spacing.two,
    ...Shadows.page,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  name: { fontSize: FontSize.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
  },
  badgeAccent: { backgroundColor: Palette.accent },
  badgeText: { fontSize: FontSize.xs },
  badgeTextAccent: { color: Palette.accentText },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: Spacing.one },
  price: { fontFamily: Fonts?.brand, fontSize: FontSize.display, lineHeight: 40, fontWeight: Weight.bold },
  per: { marginBottom: 6 },
  yearly: { fontSize: FontSize.sm },
  blurb: { lineHeight: 19, marginTop: Spacing.one },
  features: { gap: Spacing.one, marginTop: Spacing.two },
  featureRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  tick: { color: Palette.accent, fontSize: FontSize.label, lineHeight: 18 },
  feature: { flex: 1, lineHeight: 18 },
  grow: { flexGrow: 1 },
  cta: {
    marginTop: Spacing.three,
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  ctaText: { color: Palette.accentText, fontSize: FontSize.control },
  ctaCurrent: { backgroundColor: Palette.panel },
  ctaCurrentText: { color: Palette.muted, fontSize: FontSize.control },
  note: { lineHeight: 17, textAlign: 'center' },
  pressed: { opacity: 0.8 },
});
