/**
 * `/learn` — the how-to hub. One card per guide from src/data/guides.ts; adding a guide there
 * adds it here automatically.
 */
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { CurateCallout } from '@/components/CurateCallout';
import { ExternalLink } from '@/components/external-link';
import { GuideHook } from '@/components/learn/GuideFigure';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, FontSize, Radius, Shadows, Spacing, MaxContentWidthDoc } from '@/constants/theme';
import { GUIDE_LIST } from '@/data/guides';

export default function LearnHubScreen() {
  const router = useRouter();
  // TWO ACROSS ON A DESKTOP. One card per row at the document width left the right two thirds of
  // every card empty beside a 72px picture. Paired, each card is about 450px with a card-sized
  // hook at 120px, so the pictures carry their share of the row; a narrow window stacks them.
  const { width } = useWindowDimensions();
  const twoUp = width >= 760;
  const hookW = twoUp ? 120 : 84;
  return (
    <PageShell
      maxWidth={MaxContentWidthDoc}
      title="Pokémon binder how-to guides"
      description="Short illustrated guides to building a Pokémon binder the michi way: fill a page around one card, cut art into pockets, print at true card size, and search your cards.">
      <ThemedText type="subtitle" style={styles.h1}>
        Pokémon binder how-to guides
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        Short, practical walkthroughs of the craft: building a binder, cutting art into pockets,
        and getting it onto paper at true size.
      </ThemedText>

      <View style={[styles.list, twoUp && styles.listTwoUp]}>
        {GUIDE_LIST.map((g) => {
          const card = (
            <ThemedView type="backgroundElement" style={styles.card}>
              <GuideHook hook={g.hook} width={hookW} />
              <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <ThemedText type="smallBold" style={styles.cardTitle}>
                  {g.title}
                </ThemedText>
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
                style={({ pressed }) => [twoUp && styles.half, pressed && styles.pressed]}>
                {card}
              </Pressable>
            </ExternalLink>
          ) : (
            <Pressable
              key={g.slug}
              onPress={() => router.push(`/learn/${g.slug}` as Href)}
              accessibilityRole="link"
              style={({ pressed }) => [twoUp && styles.half, pressed && styles.pressed]}>
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
  listTwoUp: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  // Two per row with one gap between: each takes half of what is left. Percentages would ignore
  // the gap and wrap to one per row.
  half: { width: '48.5%', flexGrow: 1 },
  pressed: { opacity: 0.8 },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    ...Shadows.page,
  },
  cardBody: { flex: 1, minWidth: 0, gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  cardTitle: { fontSize: FontSize.md, flexShrink: 1 },
  cardLede: { lineHeight: 20 },
  cardLink: { fontSize: FontSize.label, marginTop: Spacing.one },
});
