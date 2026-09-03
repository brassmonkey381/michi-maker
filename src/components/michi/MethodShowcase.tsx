/**
 * THE MICHI METHOD, SHOWN ON REAL PAGES.
 *
 * Two galleries drawn from the app's own content, live, with real cards — nothing borrowed from
 * the landing page and nothing painted as coloured squares:
 *
 *   StyleGallery      Michi's eight page styles, each as an actual page that embodies it — the
 *                     Lurantis anchor page, the Pikachu shrine, the OKUBO artist page…
 *   LayoutGallery     the named layouts from the 3×3 showcase binder ("Corner Post", "Triptych
 *                     Rails", "Woven Bands"…), single pages and open spreads, each captioned with
 *                     what its art is doing.
 *
 * Every tile opens the binder it came from, so a reader can turn the pages around it.
 */
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Radius, Shadows, Spacing } from '@/constants/theme';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';
import { SAMPLE_BINDERS } from '@/data/sampleData';
import { MICHI_LAYOUT_STYLES, type MichiLayoutStyle } from '@/types/domain';

// ---------------------------------------------------------------------------------------------
/** Where each style is best seen: a binder from the content set and a page title inside it. */
const STYLE_EXAMPLES: Record<MichiLayoutStyle, { binder: string; page: string; why: string }> = {
  anchor: { binder: 'ex-pitch-black-chase', page: 'Lurantis', why: 'One Illustration Rare in the middle; everything around it chosen to frame it.' },
  single_pokemon: { binder: 'ex-my-first-binder', page: 'Pikachu Shrine', why: 'One species, nine artists, nine eras.' },
  themed_story: { binder: 'ex-my-first-binder', page: 'Eevee and Friends', why: 'A picnic, read left to right: the cards tell it.' },
  artist: { binder: 'ex-color-play', page: 'OKUBO', why: 'One illustrator’s hand across a whole page.' },
  trainer: { binder: 'ex-ideas-in-flight', page: "Water Trainer's Pokemon", why: 'A trainer and the team she would actually run.' },
  full_page_spread: { binder: 'showcase-3x3', page: 'Divider Plate', why: 'One picture across the whole page; cards become the accents on the facing page.' },
  color_theme: { binder: 'ex-color-play', page: 'White and Yellow', why: 'The page reads as a colour before it reads as cards.' },
  freeform: { binder: 'ex-my-first-binder', page: 'Hands!', why: 'A pose, a joke, a mood — whatever the pile of cards suggests.' },
};

/** The showcase binder's named layouts. `pages` are titles; two titles make an open spread. */
const LAYOUTS: { name: string; pages: string[]; note: string }[] = [
  { name: 'Nine Beats', pages: ['Nine Beats'], note: 'No art, on purpose. Nine cards that carry the rhythm themselves.' },
  { name: 'Corner Post', pages: ['Corner Post'], note: 'One art piece in a corner, holding the page down.' },
  { name: 'Cornerstone', pages: ['Cornerstone'], note: 'A 2×2 anchor block of art; six cards around it.' },
  { name: 'Wall Text', pages: ['Wall Text'], note: 'A caption band along the foot, like a museum label.' },
  { name: 'Diagonal Channel', pages: ['Diagonal Channel'], note: 'Two bridging bands cut a channel across the grid.' },
  { name: 'Triptych Rails', pages: ['Triptych Rails'], note: 'Edge rails either side; three cards down the middle.' },
  { name: 'Reliquary', pages: ['Reliquary'], note: 'Title band, footer band, a single accent: a page that presents one thing.' },
  { name: 'The Complete Run', pages: ['The Complete Run (left)', 'The Complete Run (right)'], note: 'Eighteen pockets, one set, read across the spine.' },
  { name: 'Splash and the Run It Opens', pages: ['Splash and the Run It Opens (left)', 'Splash and the Run It Opens (right)'], note: 'A full-page plate on the left opens a run of cards on the right.' },
  { name: 'Scene Across the Spine', pages: ['Scene Across the Spine (left)', 'Scene Across the Spine (right)'], note: 'Two anchor blocks that read as one scene when the binder is open.' },
  { name: 'Unequal Bookends', pages: ['Unequal Bookends (left)', 'Unequal Bookends (right)'], note: 'An edge rail on one page, a corner post on the other.' },
  { name: 'Banner and Footer', pages: ['Banner and Footer (left)', 'Banner and Footer (right)'], note: 'A title band on the left page answers a caption band on the right.' },
  { name: 'Woven Bands', pages: ['Woven Bands (left)', 'Woven Bands (right)'], note: 'Bridging bands on both pages, interleaved across the gutter.' },
  { name: 'The Reserved Pocket', pages: ['The Reserved Pocket (left)', 'The Reserved Pocket (right)'], note: 'Eighteen pockets and one single accent, kept for the card that is still coming.' },
];

const binderById = (id: string): DemoBinder | undefined => SAMPLE_BINDERS.find((b) => b.id === id);
const pageByTitle = (binder: DemoBinder | undefined, title: string): DemoPage | undefined =>
  binder?.pages.find((p) => p.title === title);

/** How wide one page tile can be: two up on a phone, three or four on a desktop. */
function useTileWidth(perRowMax: number, min = 150) {
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 960) - 32;
  const gap = Spacing.three;
  const per = Math.max(1, Math.min(perRowMax, Math.floor((inner + gap) / (min + gap))));
  return Math.floor((inner - gap * (per - 1)) / per);
}

// ---------------------------------------------------------------------------------------------
export function StyleGallery() {
  const router = useRouter();
  const tileW = useTileWidth(4, 170);
  return (
    <View style={styles.grid}>
      {MICHI_LAYOUT_STYLES.map((style) => {
        const ex = STYLE_EXAMPLES[style.value];
        const binder = binderById(ex.binder);
        const page = pageByTitle(binder, ex.page);
        if (!binder || !page) return null;
        return (
          <Pressable
            key={style.value}
            onPress={() => router.push(`/binder/${binder.id}` as Href)}
            accessibilityRole="link"
            accessibilityLabel={`${style.label}: open ${binder.title}`}
            style={({ pressed }) => [{ width: tileW }, pressed && styles.pressed]}>
            <View style={styles.pageShadow}>
              <BinderGrid page={page} width={tileW} />
            </View>
            <ThemedText type="smallBold" style={styles.tileTitle}>
              {style.label}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tileNote}>
              {ex.why}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tileFrom} numberOfLines={1}>
              “{page.title}” · {binder.title}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
export function LayoutGallery() {
  const router = useRouter();
  const binder = binderById('showcase-3x3');
  const single = useTileWidth(3, 200);
  // A spread is two pages plus the gutter, so it takes a whole row on anything but a wide desktop.
  const { width } = useWindowDimensions();
  const spreadPage = Math.min(single, Math.floor((Math.min(width, 960) - 32 - GUTTER) / 2));
  if (!binder) return null;
  return (
    <View style={styles.grid}>
      {LAYOUTS.map((l) => {
        const pages = l.pages.map((t) => pageByTitle(binder, t)).filter((p): p is DemoPage => !!p);
        if (pages.length !== l.pages.length) return null;
        const isSpread = pages.length === 2;
        const w = isSpread ? spreadPage : single;
        return (
          <Pressable
            key={l.name}
            onPress={() => router.push(`/binder/${binder.id}` as Href)}
            accessibilityRole="link"
            accessibilityLabel={`${l.name}: open the showcase binder`}
            style={({ pressed }) => [{ width: isSpread ? w * 2 + GUTTER : w }, pressed && styles.pressed]}>
            <View style={[styles.spreadRow, { gap: GUTTER }]}>
              {pages.map((p) => (
                <View key={p.id} style={styles.pageShadow}>
                  <BinderGrid page={p} width={w} />
                </View>
              ))}
            </View>
            <ThemedText type="smallBold" style={styles.tileTitle}>
              {l.name}
              {isSpread ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {'  '}open spread
                </ThemedText>
              ) : null}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tileNote}>
              {l.note}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const GUTTER = 6;

/** The page the replay builds: the Lurantis anchor page, seed in the middle. */
export function replayPage(): DemoPage | undefined {
  return pageByTitle(binderById('ex-pitch-black-chase'), 'Lurantis');
}

/** A framed note beside a gallery. */
export function GalleryNote({ children }: { children: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.note}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.noteText}>
        {children}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, alignItems: 'flex-start' },
  spreadRow: { flexDirection: 'row' },
  pageShadow: { borderRadius: Radii.page, ...Shadows.page },
  pressed: { opacity: 0.8 },
  tileTitle: { marginTop: Spacing.two },
  tileNote: { lineHeight: 18, marginTop: 2 },
  tileFrom: { marginTop: 2, fontSize: 11 },
  note: { padding: Spacing.three, borderRadius: Radius.control, marginTop: Spacing.three },
  noteText: { lineHeight: 20 },
});
