/**
 * THE PITCH FOR THE CURATOR, wherever people are already looking.
 *
 * The app's biggest trick — import the cards you own and it builds a binder from them — lived in
 * one place: two lines of text under the shelf on My binders. Discover, The michi method and
 * Learn get more visits than My binders put together, and never mentioned it; the analytics said
 * so in the plainest way (a handful of example imports against hundreds of page views).
 *
 * This block is the same offer everywhere, in the same words, with the transformation shown
 * rather than described: a few lines of a CSV on the left, the curated page they became on the
 * right. Both buttons land on My binders with the right sheet already open (see `?curate=` in
 * MyCollection); nothing here imports anything itself, so the funnel has one entry point and one
 * `demo.csv_import` per attempt, tagged with the surface that sent it.
 */
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Fonts, Palette, Radii, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { EXAMPLE_COLLECTION_CSV } from '@/data/exampleCollection';
import { useBinders } from '@/store/binders';

/** The one name for the feature, used on every surface so it is recognised from one to the next. */
export const CURATE_TITLE = 'Curate from my collection';
export const CURATE_TRY = 'Try the example';
export const CURATE_IMPORT = 'Import my CSV';

/** Which sheet to land in: the bundled example, or the person's own file. */
export type CurateMode = 'example' | 'import';

/** Where the curator's entry point lives; `from` tags the analytics with the surface that sent them. */
export function curateHref(mode: CurateMode, from: string): Href {
  return `/my-binders?curate=${mode}&from=${encodeURIComponent(from)}` as Href;
}

// Three real rows of the bundled example collection, shown as the "before".
const SAMPLE_ROWS = EXAMPLE_COLLECTION_CSV.split('\n')
  .slice(1, 4)
  .map((line) => {
    const [, , name, set] = line.split(',');
    return { name, set: set?.replace(/^SV: |^SV\d+: |^ME\d*: /, '') ?? '' };
  });

export function CurateCallout({
  surface,
  compact = false,
  onNavigate,
}: {
  surface: string;
  compact?: boolean;
  /** Runs just before leaving for My binders — the landing page uses it to mark itself seen. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const store = useBinders();
  // The "after": the first page of the first example binder, drawn small. Real pockets, real
  // cards — a picture of the outcome beats a sentence about it.
  const afterPage = store.exampleBinders.find((b) => b.pages[0]?.slots?.some((s) => s.cardId))?.pages[0] ?? store.exampleBinders[0]?.pages[0];
  const go = (mode: CurateMode) => {
    onNavigate?.();
    router.push(curateHref(mode, surface));
  };

  return (
    <ThemedView type="backgroundElement" style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.body}>
        <ThemedText type="smallBold" style={styles.kicker}>
          {CURATE_TITLE}
        </ThemedText>
        <ThemedText type="subtitle" style={styles.title}>
          Your cards in, a finished binder out.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
          Import the cards you own and michi-maker curates a binder from them: evolution lines,
          species pages, colour runs, artist galleries. One click, then keep the pages you like.
        </ThemedText>
        <View style={styles.actions}>
          <Pressable
            onPress={() => go('example')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>{CURATE_TRY}</Text>
          </Pressable>
          <Pressable
            onPress={() => go('import')}
            accessibilityRole="button"
            style={({ pressed }) => [pillChip.base, pressed && styles.pressed]}>
            <Text style={pillChip.text}>{CURATE_IMPORT}</Text>
          </Pressable>
        </View>
      </View>

      {!compact ? (
        <View style={styles.strip} pointerEvents="none">
          <View style={styles.before}>
            <Text style={styles.beforeHead}>collection.csv</Text>
            {SAMPLE_ROWS.map((r) => (
              <Text key={r.name} numberOfLines={1} style={styles.beforeRow}>
                {r.name}
                <Text style={styles.beforeSet}>  {r.set}</Text>
              </Text>
            ))}
            <Text style={styles.beforeRow}>…</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
          {afterPage ? (
            <View style={styles.after}>
              <BinderGrid page={afterPage} width={AFTER_W} />
            </View>
          ) : null}
        </View>
      ) : null}
    </ThemedView>
  );
}

const AFTER_W = 150;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    ...Shadows.page,
  },
  cardCompact: { padding: Spacing.three },
  body: { flex: 1, minWidth: 240, gap: 6 },
  kicker: { color: Palette.accent, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: FontSize.label },
  title: { marginTop: 2 },
  lede: { maxWidth: 520 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  primary: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    paddingVertical: 8,
  },
  primaryText: { color: Palette.accentText, fontSize: FontSize.body, fontWeight: Weight.semibold },
  pressed: { opacity: 0.75 },
  // The transformation: a slip of CSV, an arrow, the page it became.
  strip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  before: {
    width: 160,
    padding: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    gap: 3,
  },
  beforeHead: { fontFamily: Fonts.mono, fontSize: 10, color: Palette.ink3, marginBottom: 2 },
  beforeRow: { fontFamily: Fonts.mono, fontSize: 11, color: Palette.ink2 },
  beforeSet: { color: Palette.ink3 },
  arrow: { fontSize: 22, color: Palette.ink3 },
  after: { borderRadius: Radii.pageSmall, ...Shadows.page },
});
