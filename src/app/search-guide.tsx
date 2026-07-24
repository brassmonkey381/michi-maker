/**
 * "Search cheatsheet" — a quickstart for the browse search grammar. A handful of high-value
 * RECIPES (combinable queries) up top, each with a one-tap "Try it →" that runs it live in the
 * browser; then the runnable operators (tap any to run it) rendered from the kit's QUERY_MANUAL;
 * then an "Additional info" section for the non-query rows (UI features, keyboard tips, aliases).
 *
 * "Try it" sends a `search` BrowseCommand and navigates to /browse; the command is held pending
 * until that page's CatalogBrowser mounts, then runs — so the query lands whether or not a browser
 * was already up, and works cold (server search) or warm (on-device).
 */
import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QUERY_MANUAL, sendBrowseCommand } from 'tcgscan-browse';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, FontSize, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** Curated combinations — the "wait, you can do that?" moments. Each is a runnable query. */
const RECIPES: { title: string; query: string; blurb: string }[] = [
  {
    title: 'See your whole collection',
    query: 'have:yes',
    blurb: 'Every card you own, in the grid. Then keep stacking: sort it, narrow to a set, filter by type. It becomes the base for everything below.',
  },
  {
    title: 'Your most valuable cards',
    query: 'have:yes sort:value',
    blurb: 'Owned cards, priciest first (the tiles show values). Add a set: or type: to focus.',
  },
  {
    title: 'Finish a set',
    query: 'set:base have:no',
    blurb: 'Every card in Base Set you don’t own yet: an instant want-list. Swap in any set name.',
  },
  {
    title: 'One artist, one type',
    query: 'artist:arita type:fire',
    blurb: 'Combine fields freely, like an illustrator’s fire cards.',
  },
  {
    title: 'Chase cards',
    query: '>$100 sort:value',
    blurb: 'Everything over $100, most expensive first. Comparisons work on value, HP, stage, and dates.',
  },
  {
    title: 'Modern heavy hitters',
    query: 'hp>=300 date>2022 sort:hp',
    blurb: 'Numeric and date compares together, sorted by HP for recent, high-HP cards.',
  },
];

// The manual's last two sections describe UI features / keyboard, not query syntax — they go to
// "Additional info". Within the query sections, placeholder rows (…, ✓) are informational too.
const INFO_SECTIONS = new Set(['More', 'On the web']);
const isPlaceholder = (code: string) => /[…✓]/.test(code);

/** Strip em-dashes from rendered copy (house style), including the kit-sourced descriptions. */
const noDash = (s: string) => s.replace(/\s*—\s*/g, ', ');

/** Query sections with only their runnable example rows (tap-to-run). */
const OP_SECTIONS = QUERY_MANUAL.filter((s) => !INFO_SECTIONS.has(s.title))
  .map((s) => ({ title: s.title, rows: s.rows.filter(([code]) => !isPlaceholder(code)) }))
  .filter((s) => s.rows.length > 0);

/** Everything that isn't a runnable query — features, keyboard, aliases, placeholders. */
const INFO_ROWS: [code: string, desc: string][] = QUERY_MANUAL.flatMap((s) =>
  INFO_SECTIONS.has(s.title) ? s.rows : s.rows.filter(([code]) => isPlaceholder(code)),
);

export default function SearchGuideScreen() {
  const router = useRouter();
  const tryIt = (query: string) => {
    sendBrowseCommand({ type: 'search', query });
    router.push('/browse');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.shell}>
            <View style={styles.headerRow}>
              <ThemedText type="title" style={styles.h1}>
                Search cheatsheet
              </ThemedText>
              <Pressable onPress={() => router.push('/browse')} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Open Browse ›
                </ThemedText>
              </Pressable>
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
              The search box is a tiny query language. Type words, target a field, compare numbers
              and dates, sort, and filter by your collection, and combine any of them freely. Tap
              “Try it” to run a recipe in the browser, then keep layering chips and params on top.
            </ThemedText>

            <ThemedText type="smallBold" style={styles.sectionHead}>
              Recipes
            </ThemedText>
            <View style={styles.recipeGrid}>
              {RECIPES.map((r) => (
                <View key={r.query} style={styles.recipeCard}>
                  <ThemedText type="smallBold" style={styles.recipeTitle}>
                    {r.title}
                  </ThemedText>
                  <View style={styles.codeRow}>
                    <Text style={styles.code}>{r.query}</Text>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.recipeBlurb}>
                    {noDash(r.blurb)}
                  </ThemedText>
                  <Pressable
                    onPress={() => tryIt(r.query)}
                    style={({ pressed }) => [styles.tryBtn, pressed && styles.pressed]}>
                    <Text style={styles.tryBtnText}>Try it →</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <ThemedText type="smallBold" style={styles.sectionHead}>
              Every operator
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.refIntro}>
              Tap any example to run it.
            </ThemedText>
            {OP_SECTIONS.map((section) => (
              <View key={section.title} style={styles.refSection}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.refTitle}>
                  {section.title}
                </ThemedText>
                {section.rows.map(([code, desc]) => (
                  <View key={code} style={styles.refRow}>
                    <Pressable
                      onPress={() => tryIt(code)}
                      style={({ pressed }) => [styles.codeChip, pressed && styles.pressed]}>
                      <Text style={styles.codeChipText}>{code}</Text>
                    </Pressable>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.refDesc}>
                      {noDash(desc)}
                    </ThemedText>
                  </View>
                ))}
              </View>
            ))}

            <ThemedText type="smallBold" style={styles.sectionHead}>
              Additional info
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.refIntro}>
              Features and shortcuts, not search terms.
            </ThemedText>
            <View style={styles.refSection}>
              {INFO_ROWS.map(([code, desc]) => (
                <View key={code} style={styles.refRow}>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoChipText}>{code}</Text>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.refDesc}>
                    {noDash(desc)}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingBottom: Spacing.six },
  shell: {
    width: '100%',
    maxWidth: MaxContentWidthWide,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  h1: { fontFamily: Fonts?.brand, fontSize: FontSize.display, lineHeight: 40 },
  intro: { marginTop: Spacing.two, lineHeight: 20, maxWidth: 640 },
  sectionHead: {
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
    fontSize: FontSize.md,
    fontWeight: Weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  recipeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  recipeCard: {
    flexBasis: 300,
    flexGrow: 1,
    maxWidth: 420,
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.panel,
  },
  recipeTitle: { fontSize: FontSize.md },
  // Query chips: primary blue fill, white text.
  codeRow: { alignSelf: 'flex-start', borderRadius: Radius.control, backgroundColor: Palette.accent, paddingHorizontal: 10, paddingVertical: 6 },
  code: { fontFamily: mono, fontSize: FontSize.body, color: Palette.accentText, fontWeight: Weight.semibold },
  recipeBlurb: { lineHeight: 18 },
  // Try it: primary blue fill, white text (matching the query chips).
  tryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: 8,
    paddingHorizontal: Spacing.four,
  },
  tryBtnText: { color: Palette.accentText, fontSize: FontSize.control, fontWeight: Weight.bold },
  pressed: { opacity: 0.7 },
  refIntro: { marginTop: -4, marginBottom: Spacing.two },
  refSection: { marginBottom: Spacing.three },
  refTitle: { textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.one },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: 6, flexWrap: 'wrap' },
  codeChip: {
    borderRadius: Radius.control,
    backgroundColor: Palette.accent,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  codeChipText: { fontFamily: mono, fontSize: FontSize.sm, color: Palette.accentText, fontWeight: Weight.semibold },
  // Info chips: quiet, non-interactive — clearly not something to tap-run.
  infoChip: {
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  infoChipText: { fontSize: FontSize.sm, color: Palette.muted2, fontWeight: Weight.semibold },
  refDesc: { flexShrink: 1, minWidth: 180, lineHeight: 18 },
});
