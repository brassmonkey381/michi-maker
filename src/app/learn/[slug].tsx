/**
 * `/learn/[slug]` — one how-to guide, rendered from src/data/guides.ts. Unknown slugs get a
 * friendly not-found shell (no crash, no redirect loop).
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { Fonts, FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { GUIDES } from '@/data/guides';

export default function GuideScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const guide = typeof slug === 'string' ? GUIDES[slug] : undefined;

  if (!guide) {
    return (
      <PageShell title="Guide not found">
        <ThemedText type="subtitle" style={styles.h1}>
          Guide not found
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
          That guide doesn’t exist (or moved). Every guide lives on the how-to hub.
        </ThemedText>
        <Pressable onPress={() => router.push('/learn' as Href)} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <ThemedText style={styles.ctaText}>Browse the guides</ThemedText>
        </Pressable>
      </PageShell>
    );
  }

  return (
    <PageShell title={guide.title} description={guide.lede}>
      <ThemedText type="subtitle" style={styles.h1}>
        {guide.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        {guide.lede} About {guide.minutes} minutes.
      </ThemedText>

      <View style={styles.steps}>
        {guide.steps.map((s, i) => (
          <View key={s.title} style={styles.step}>
            <View style={styles.stepNum}>
              <ThemedText style={styles.stepNumText}>{i + 1}</ThemedText>
            </View>
            <View style={styles.stepBody}>
              <ThemedText type="smallBold" style={styles.stepTitle}>
                {s.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
                {s.body}
              </ThemedText>
            </View>
          </View>
        ))}
      </View>

      {guide.tip ? (
        <View style={styles.tipCard}>
          <ThemedText type="smallBold" style={styles.tipKicker}>
            Tip
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
            {guide.tip}
          </ThemedText>
        </View>
      ) : null}

      {guide.relatedSlugs?.length ? (
        <View style={styles.related}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.relatedLabel}>
            Keep going
          </ThemedText>
          {guide.relatedSlugs
            .filter((s) => GUIDES[s])
            .map((s) => (
              <Pressable key={s} onPress={() => router.push(`/learn/${s}` as Href)} hitSlop={6}>
                <ThemedText type="linkPrimary" style={styles.relatedLink}>
                  {GUIDES[s].title} →
                </ThemedText>
              </Pressable>
            ))}
        </View>
      ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: Fonts?.brand, marginBottom: Spacing.two },
  lede: { lineHeight: 22, marginBottom: Spacing.four },
  steps: { gap: Spacing.four },
  step: { flexDirection: 'row', gap: Spacing.three },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink2 },
  stepBody: { flex: 1, gap: Spacing.one },
  stepTitle: { fontSize: FontSize.control },
  stepText: { lineHeight: 20 },
  tipCard: {
    marginTop: Spacing.five,
    borderRadius: Radius.panel,
    backgroundColor: Palette.panelAlt,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  tipKicker: { fontSize: FontSize.label, textTransform: 'uppercase', letterSpacing: 0.5 },
  related: { marginTop: Spacing.five, gap: Spacing.two },
  relatedLabel: { textTransform: 'uppercase', letterSpacing: 0.5, fontSize: FontSize.sm },
  relatedLink: { fontSize: FontSize.label },
  cta: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  ctaText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },
  pressed: { opacity: 0.7 },
});
