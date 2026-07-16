/**
 * `/learn` — the how-to hub. One card per guide from src/data/guides.ts; adding a guide there
 * adds it here automatically.
 */
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

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
        {GUIDE_LIST.map((g) => (
          <Pressable
            key={g.slug}
            onPress={() => router.push(`/learn/${g.slug}` as Href)}
            accessibilityRole="link"
            style={({ pressed }) => [pressed && styles.pressed]}>
            <ThemedView type="backgroundElement" style={styles.card}>
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
            </ThemedView>
          </Pressable>
        ))}
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: Fonts?.brand, marginBottom: Spacing.two },
  lede: { lineHeight: 22, marginBottom: Spacing.four },
  list: { gap: Spacing.three },
  pressed: { opacity: 0.8 },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    ...Shadows.page,
  },
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
