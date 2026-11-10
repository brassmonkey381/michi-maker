/**
 * "Search Cheatsheet": the searches people actually use, one line each (the search to type and
 * what it finds), every line tappable to run it in the browser. The full operator list is folded
 * under "Every search term" for the curious (owner, 2026-11-10: "practical, readable and usable").
 *
 * Running a line sends a `search` BrowseCommand and navigates to /browse; the command is held
 * pending until that page's CatalogBrowser mounts, then runs, cold or warm.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { QUERY_MANUAL, sendBrowseCommand } from 'tcgscan-browse';

import { FREE_THEME } from '@/data/freeTheme';
import { FREE_THEME_QUERY, runThemeDemo } from '@/data/themeDemo';

import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { Fonts, FontSize, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';

type Line = { q: string; finds: string; free?: boolean; browseOnly?: boolean };

/**
 * ORDER: whole-catalog searches first, so a first tap always returns cards; `have:` last (empty
 * before you own anything). Only forms the kit's grammar supports (see QUERY_MANUAL); the minus
 * works on themes.
 */
const SECTIONS: { title: string; note?: string; lines: Line[] }[] = [
  {
    title: 'Names and words',
    lines: [
      { q: 'charizard', finds: 'a Pokémon, or any word on the card' },
      { q: 'arita fire', finds: 'every word must match' },
      { q: '"full art" sort:value', finds: 'full arts, priciest first' },
    ],
  },
  {
    title: 'Set, artist, rarity, type',
    lines: [
      { q: 'set:"evolving skies"', finds: 'one set (quote names with spaces)' },
      { q: 'artist:arita', finds: 'one illustrator' },
      { q: 'rarity:illustration', finds: 'Illustration Rares, special ones too' },
      { q: 'type:fire', finds: 'one energy type' },
      { q: 'artist:arita type:fire', finds: 'stack any fields together' },
    ],
  },
  {
    title: 'What the art shows',
    note: 'Free: top matches. PRO: every match. Forest is free for everyone.',
    lines: [
      { q: FREE_THEME_QUERY, finds: 'cards drawn in a forest', free: true },
      { q: 'theme:water -theme:sky', finds: 'water, but no sky (minus removes)' },
      { q: 'theme:night theme:city', finds: 'both must show' },
      { q: 'pokemon:pikachu', finds: 'shows a Pikachu, whatever its name' },
      { q: 'theme:snow rarity:illustration', finds: 'Illustration Rares in the snow' },
    ],
  },
  {
    title: 'Colour',
    lines: [{ q: 'Color Search', finds: 'in Browse: pick up to 3 colours to match a palette', browseOnly: true }],
  },
  {
    title: 'Price, HP, dates, sort',
    lines: [
      { q: '>$100 sort:value', finds: 'over $100, priciest first' },
      { q: 'hp>=300 date>2022', finds: 'big HP, released since 2022' },
      { q: 'sort:newest', finds: 'newest releases first' },
      { q: 'year:1999', finds: 'one release year' },
    ],
  },
  {
    title: 'Your collection',
    lines: [
      { q: 'have:no set:"evolving skies"', finds: 'what you still need from a set' },
      { q: 'have:yes sort:value', finds: 'your cards, priciest first' },
    ],
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
    if (query === FREE_THEME_QUERY) {
      // Tracked as the demonstration, shared with the browser's theme button (themeDemo). The
      // recipe names forest, so it runs forest; only the button rotates.
      runThemeDemo('cheatsheet', FREE_THEME);
      router.push('/browse');
      return;
    }
    sendBrowseCommand({ type: 'search', query });
    router.push('/browse');
  };

  const [all, setAll] = useState(false);
  const run = (l: Line) => (l.browseOnly ? router.push('/browse') : tryIt(l.q));

  return (
    <PageShell title="Search Cheatsheet" description="The searches people use in the card browser, one line each, tap to run." maxWidth={MaxContentWidthWide} footer={false}>
      <View style={styles.shell}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.h1}>
            Search Cheatsheet
          </ThemedText>
          <Pressable onPress={() => router.push('/browse')} hitSlop={8}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Open Browse ›
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          Tap a search to run it.
        </ThemedText>

        {SECTIONS.map((sec) => (
          <View key={sec.title} style={styles.section}>
            <ThemedText type="smallBold" style={styles.sectionHead}>
              {sec.title}
            </ThemedText>
            {sec.note ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                {sec.note}
              </ThemedText>
            ) : null}
            {sec.lines.map((l) => (
              <Pressable
                key={l.q}
                onPress={() => run(l)}
                accessibilityRole="button"
                accessibilityLabel={`Run ${l.q}: ${l.finds}`}
                style={({ pressed }) => [styles.line, pressed && styles.pressed]}>
                <View style={l.browseOnly ? styles.infoChip : styles.codeChip}>
                  <Text style={l.browseOnly ? styles.infoChipText : styles.codeChipText}>{l.q}</Text>
                </View>
                <Text style={styles.finds}>
                  {l.finds}
                  {l.free ? <Text style={styles.free}>  free</Text> : null}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}

        <Pressable onPress={() => setAll((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: all }} style={styles.allToggle}>
          <ThemedText type="smallBold" style={styles.allToggleText}>
            {all ? '▾' : '▸'} Every search term
          </ThemedText>
        </Pressable>
        {all ? (
          <View>
            {OP_SECTIONS.map((section) => (
              <View key={section.title} style={styles.refSection}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.refTitle}>
                  {section.title}
                </ThemedText>
                {section.rows.map(([code, desc]) => (
                  <Pressable key={code} onPress={() => tryIt(code)} style={({ pressed }) => [styles.line, pressed && styles.pressed]}>
                    <View style={styles.codeChip}>
                      <Text style={styles.codeChipText}>{code}</Text>
                    </View>
                    <Text style={styles.finds}>{noDash(desc)}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            <View style={styles.refSection}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.refTitle}>
                Features and shortcuts
              </ThemedText>
              {INFO_ROWS.map(([code, desc]) => (
                <View key={code} style={styles.line}>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoChipText}>{code}</Text>
                  </View>
                  <Text style={styles.finds}>{noDash(desc)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </PageShell>
  );
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  shell: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.five },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  h1: { fontFamily: Fonts?.brand, fontSize: FontSize.display, lineHeight: 40 },
  intro: { marginTop: Spacing.one },
  section: { marginTop: Spacing.four },
  sectionHead: { fontSize: FontSize.sm, fontWeight: Weight.bold, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Spacing.one },
  note: { marginBottom: Spacing.one },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 4, columnGap: Spacing.two, paddingVertical: 5 },
  pressed: { opacity: 0.6 },
  codeChip: { borderRadius: Radius.control, backgroundColor: Palette.accent, paddingHorizontal: 9, paddingVertical: 5 },
  codeChipText: { fontFamily: mono, fontSize: FontSize.sm, color: Palette.accentText, fontWeight: Weight.semibold },
  infoChip: { borderRadius: Radius.control, backgroundColor: Palette.panel, borderWidth: 1, borderColor: Palette.hairlineStrong, paddingHorizontal: 9, paddingVertical: 5 },
  infoChipText: { fontSize: FontSize.sm, color: Palette.muted2, fontWeight: Weight.semibold },
  finds: { flexShrink: 1, fontSize: FontSize.sm, color: Palette.muted, lineHeight: 18 },
  free: { color: Palette.accent, fontWeight: Weight.bold },
  allToggle: { marginTop: Spacing.five, paddingVertical: Spacing.two },
  allToggleText: { color: Palette.accent },
  refSection: { marginTop: Spacing.three },
  refTitle: { textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.one },
});
