/**
 * `/learn` — the how-to hub. One card per guide from src/data/guides.ts; adding a guide there
 * adds it here automatically.
 */
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CurateCallout } from '@/components/CurateCallout';
import { ExternalLink } from '@/components/external-link';
import { GuideHook } from '@/components/learn/GuideFigure';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, FontSize, Palette, Radius, Shadows, Spacing } from '@/constants/theme';
import { GUIDE_LIST } from '@/data/guides';

export default function LearnHubScreen() {
  const router = useRouter();
  return (
    <PageShell
      title="How-to guides"
      description="Short guides to building, slicing, and printing michi binders.">
      <ThemedText type="subtitle" style={styles.h1}>
        How-to guides
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        Short, practical walkthroughs of the craft: building a binder, cutting art into pockets,
        and getting it onto paper at true size.
      </ThemedText>

      <View style={styles.list}>
        {GUIDE_LIST.map((g) => {
          const card = (
            <ThemedView type="backgroundElement" style={styles.card}>
              <GuideHook hook={g.hook} />
              <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <ThemedText type="smallBold" style={styles.cardTitle}>
                  {g.title}
                </ThemedText>
                <View style={styles.chip}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.chipText}>
                    {g.minutes} min
                  </ThemedText>
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cardLede}>
                {g.lede}
              </ThemedText>
              <ThemedText type="linkPrimary" style={styles.cardLink}>
                Read the guide →
              </ThemedText>
              </View>
            </ThemedView>
          );
          // A guide can point at a hosted page instead of its in-app steps (see Guide.externalHref).
          // Those are real URLs, not Expo routes, so they must never go through router.push.
          return g.externalHref ? (
            <ExternalLink key={g.slug} href={g.externalHref as Href & string} asChild>
              <Pressable
                accessibilityRole="link"
                style={({ pressed }) => [pressed && styles.pressed]}>
                {card}
              </Pressable>
            </ExternalLink>
          ) : (
            <Pressable
              key={g.slug}
              onPress={() => router.push(`/learn/${g.slug}` as Href)}
              accessibilityRole="link"
              style={({ pressed }) => [pressed && styles.pressed]}>
              {card}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.callout}>
        <CurateCallout surface="learn" />
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  callout: { marginTop: 28 },
  h1: { fontFamily: Fonts?.brand, marginBottom: Spacing.two },
  lede: { lineHeight: 22, marginBottom: Spacing.four },
  list: { gap: Spacing.three },
  pressed: { opacity: 0.8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    ...Shadows.page,
  },
  cardBody: { flex: 1, minWidth: 0, gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  cardTitle: { fontSize: FontSize.md, flexShrink: 1 },
  chip: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
  },
  chipText: { fontSize: FontSize.xs },
  cardLede: { lineHeight: 20 },
  cardLink: { fontSize: FontSize.label, marginTop: Spacing.one },
});
