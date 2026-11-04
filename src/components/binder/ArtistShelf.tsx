/**
 * THE ARTISTS SHELF (owner, 2026-11-03): approved pieces from real artists, offered wherever the
 * app offers a picture. Same shape as the preset picker (tiles in a paged carousel, the one in
 * use outlined, a credit underneath), one shelf per surface. Renders NOTHING when no artist has
 * offered a piece for this surface, so a picker without artists looks exactly as it did.
 *
 * Preview only: a piece is placed as a picture address like any other, credited to the artist
 * (origin 'artist') and printed as a placeholder. The credit links to where the artist can be
 * commissioned, which is the whole point of the shelf.
 */
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { PagedCarousel } from '@/components/PagedCarousel';
import { presetPages } from '@/components/binder/PresetPictureGrid';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import type { ArtAttribution } from '@/data/artworkLibrary';
import { type ArtistSurface, type ShelfPiece, artistAttribution, artistLabel, fetchArtistShelf, piecesFor, shelfPieceFor } from '@/data/artists';

/** The shelf, fetched once and shared; [] until it arrives or when there is none. */
export function useArtistShelf(surface: ArtistSurface): ShelfPiece[] {
  const [all, setAll] = useState<ShelfPiece[]>([]);
  useEffect(() => {
    let live = true;
    void fetchArtistShelf().then((p) => { if (live) setAll(p); });
    return () => { live = false; };
  }, []);
  return useMemo(() => piecesFor(all, surface), [all, surface]);
}

export function ArtistShelf({
  surface,
  value,
  onPick,
  title = 'From artists',
  testID,
}: {
  surface: ArtistSurface;
  /** The address in use, so the matching tile is outlined. */
  value?: string | null;
  onPick: (url: string, attribution: ArtAttribution, piece: ShelfPiece) => void;
  title?: string;
  testID?: string;
}) {
  const pieces = useArtistShelf(surface);
  const chosen = shelfPieceFor(pieces, value);
  const [width, setWidth] = useState(0);
  const pages = useMemo(() => (width > 0 ? presetPages(pieces, width) : []), [pieces, width]);
  const initialPage = Math.max(0, pages.findIndex((pg) => pg.some((p) => p.id === chosen?.id)));
  if (pieces.length === 0) return null;

  const tile = (p: ShelfPiece) => {
    const on = chosen?.id === p.id;
    return (
      <Pressable
        key={p.id}
        onPress={() => onPick(p.url, artistAttribution(p), p)}
        accessibilityRole="button"
        accessibilityLabel={`${p.title}, by ${artistLabel(p)}`}
        accessibilityState={{ selected: on }}
        testID={testID ? `${testID}-${p.id}` : undefined}
        style={[styles.tile, on && styles.tileOn]}>
        <Image source={{ uri: p.url }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
          {p.title}
        </Text>
        <Text style={styles.by} numberOfLines={1}>
          {artistLabel(p)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.box} testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text style={styles.title}>{title}</Text>
      {width > 0 ? (
        <PagedCarousel
          key={pages.length}
          width={width}
          initialPage={initialPage}
          prevLabel="Previous artist pieces"
          nextLabel="More artist pieces"
          pages={pages.map((pg, i) => (
            <View key={i} style={styles.row}>
              {pg.map(tile)}
            </View>
          ))}
        />
      ) : null}
      {chosen ? (
        <Text style={styles.credit} testID={testID ? `${testID}-credit` : undefined}>
          {chosen.title}, by {artistLabel(chosen)}
          {chosen.artistLink ? (
            <>
              {' · '}
              <Text style={styles.creditLink} onPress={() => Linking.openURL(chosen.artistLink!).catch(() => {})}>
                Commission this artist ↗
              </Text>
            </>
          ) : null}
          {chosen.prints ? ' · prints as shown' : ' · preview only'}
        </Text>
      ) : null}
    </View>
  );
}

const TILE_W = 72;
const TILE_GAP = 6;
const PAGE_PAD = 44;

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', gap: 4 },
  title: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.muted3 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: TILE_GAP, paddingVertical: 2, paddingHorizontal: PAGE_PAD },
  tile: { width: TILE_W, borderRadius: Radius.control, borderWidth: 2, borderColor: 'transparent', padding: 2, gap: 2 },
  tileOn: { borderColor: Palette.accent },
  thumb: { width: '100%', aspectRatio: 3 / 2, borderRadius: Radius.control - 2, backgroundColor: Palette.panel },
  label: { fontSize: FontSize.xs, color: Palette.muted, textAlign: 'center' },
  labelOn: { color: Palette.ink, fontWeight: '600' },
  by: { fontSize: FontSize.xs, color: Palette.muted3, textAlign: 'center' },
  credit: { fontSize: FontSize.xs, color: Palette.muted },
  creditLink: { textDecorationLine: 'underline', color: Palette.accent },
});
