/**
 * THE MICHI METHOD, SHOWN ON REAL PAGES.
 *
 * Michi's eight page styles, each as an actual page from the app's own content, live, with real
 * cards — the Lurantis anchor page, the Pikachu shrine, the OKUBO artist page… Nothing borrowed
 * from the landing page and nothing painted as coloured squares. Every tile opens the binder it
 * came from, so a reader can turn the pages around it.
 */
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import { Radii, Shadows, Spacing } from '@/constants/theme';
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

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, alignItems: 'flex-start' },
  pageShadow: { borderRadius: Radii.page, ...Shadows.page },
  pressed: { opacity: 0.8 },
  tileTitle: { marginTop: Spacing.two },
  tileNote: { lineHeight: 18, marginTop: 2 },
  tileFrom: { marginTop: 2, fontSize: 11 },
});
