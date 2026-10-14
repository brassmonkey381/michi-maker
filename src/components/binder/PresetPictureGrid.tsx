/**
 * THE PRESET PICTURE PICKER (owner, 2026-10-13: "make access to a collection of preselected
 * background images easier"). Thumbnails from data/presetBackdrops: textures where a sleeve or an
 * art backing is chosen, themes where the picture behind the share image is. One tap stores the
 * preset's hosted address, which is an ordinary picture address to everything downstream, so a
 * preset and a pasted link are the same thing once chosen. The link field keeps its place
 * underneath for anyone with a picture of their own.
 *
 * A CAROUSEL, NOT A STRIP (owner, 2026-10-13, second pass). The first version was a horizontal
 * ScrollView, which a mouse cannot move: no horizontal wheel, no drag, and the tiles past the
 * right edge might as well not exist. PagedCarousel gives it what every other strip here has:
 * arrows, wheel paging on web, dots, and a swipe on touch. The tiles are packed into pages of as
 * many as the measured width holds, with room at both ends for the arrows.
 *
 * Thumbnails only: the picker never loads a full picture. The one in use is outlined, and its
 * credit is shown underneath, the way the stock-art search shows who made a picture.
 */
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { PagedCarousel } from '@/components/PagedCarousel';
import { FontSize, Palette, Radius } from '@/constants/theme';
import { type PresetKind, type PresetPicture, presetFor, presetsOf } from '@/data/presetBackdrops';

const TILE_W = 72;
const TILE_GAP = 6;
/** Room at each end of a page for the carousel's arrows, so no tile sits under one. */
const PAGE_PAD = 44;

/** Pack the presets into pages of as many tiles as `width` holds, never fewer than one. */
export function presetPages<T>(items: readonly T[], width: number): T[][] {
  const per = Math.max(1, Math.floor((width - 2 * PAGE_PAD + TILE_GAP) / (TILE_W + TILE_GAP)));
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  return pages;
}

export function PresetPictureGrid({
  kind,
  value,
  onPick,
  testID,
}: {
  kind: PresetKind;
  /** The address in use, so the matching tile is outlined. A pasted link matches nothing. */
  value?: string | null;
  onPick: (url: string) => void;
  testID?: string;
}) {
  const presets = presetsOf(kind);
  const chosen = presetFor(value);
  const [width, setWidth] = useState(0);
  const pages = useMemo(() => (width > 0 ? presetPages(presets, width) : []), [presets, width]);
  // Open on the page holding the picture in use, so the outline is visible without paging to it.
  const initialPage = Math.max(0, pages.findIndex((pg) => pg.some((p) => p.id === chosen?.id)));

  const tile = (p: PresetPicture) => {
    const on = chosen?.id === p.id;
    return (
      <Pressable
        key={p.id}
        onPress={() => onPick(p.url)}
        accessibilityRole="button"
        accessibilityLabel={`${p.label}, by ${p.author}`}
        accessibilityState={{ selected: on }}
        testID={testID ? `${testID}-${p.id}` : undefined}
        style={[styles.tile, on && styles.tileOn]}>
        <Image source={{ uri: p.thumb }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
          {p.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.box} testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <PagedCarousel
          key={pages.length}
          width={width}
          initialPage={initialPage}
          prevLabel="Previous pictures"
          nextLabel="More pictures"
          pages={pages.map((pg, i) => (
            <View key={i} style={styles.row}>
              {pg.map(tile)}
            </View>
          ))}
        />
      ) : null}
      {chosen ? (
        <Text style={styles.credit} testID={testID ? `${testID}-credit` : undefined}>
          {chosen.label}, by{' '}
          <Text style={styles.creditLink} onPress={() => Linking.openURL(chosen.page).catch(() => {})}>
            {chosen.author}
          </Text>{' '}
          on {chosen.provider === 'pexels' ? 'Pexels' : 'Pixabay'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: TILE_GAP, paddingVertical: 2, paddingHorizontal: PAGE_PAD },
  tile: { width: TILE_W, borderRadius: Radius.control, borderWidth: 2, borderColor: 'transparent', padding: 2, gap: 2 },
  tileOn: { borderColor: Palette.accent },
  thumb: { width: '100%', aspectRatio: 3 / 2, borderRadius: Radius.control - 2, backgroundColor: Palette.panel },
  label: { fontSize: FontSize.xs, color: Palette.muted, textAlign: 'center' },
  labelOn: { color: Palette.ink, fontWeight: '600' },
  credit: { fontSize: FontSize.xs, color: Palette.muted },
  creditLink: { textDecorationLine: 'underline' },
});
