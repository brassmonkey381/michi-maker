/**
 * THE PRESET TRACK PICKER (owner, 2026-10-14: "a track picker on a carousel, like sleeves and
 * picture backgrounds"). Tiles from data/presetTracks on a PagedCarousel: arrows, wheel paging on
 * web, dots, a swipe on touch, packed into pages of as many tiles as the measured width holds,
 * the same way PresetPictureGrid does it. A tile is the title, a mood word and the length; the one
 * in use is outlined. One tap sets the preset as the track, with its credit in the name and the
 * rights attested by us (the licence is ours to attest), so no upload and no tick.
 *
 * PREVIEW, ON WEB. Each tile has a small play button that plays that track through its own audio
 * element, not the binder player: the binder player belongs to the page the visitor is on and a
 * preview must not crossfade it away. One preview at a time; opening another, picking a tile or
 * leaving the dialog stops it. Native shows the tiles without the button.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { PagedCarousel } from '@/components/PagedCarousel';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import {
  PRESET_TRACK_AUTHOR,
  PRESET_TRACK_LICENCE,
  PRESET_TRACK_PAGE,
  PRESET_TRACKS,
  type PresetTrack,
  presetTrackFor,
  trackLength,
} from '@/data/presetTracks';

const TILE_W = 104;
const TILE_GAP = 6;
/** Room at each end of a page for the carousel's arrows, so no tile sits under one. */
const PAGE_PAD = 44;

/** Pack the tracks into pages of as many tiles as `width` holds, never fewer than one. */
export function trackPages<T>(items: readonly T[], width: number): T[][] {
  const per = Math.max(1, Math.floor((width - 2 * PAGE_PAD + TILE_GAP) / (TILE_W + TILE_GAP)));
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  return pages;
}

export function PresetTrackGrid({
  value,
  onPick,
  testID,
}: {
  /** The address in use, so the matching tile is outlined. An upload matches nothing. */
  value?: string | null;
  onPick: (track: PresetTrack) => void;
  testID?: string;
}) {
  const chosen = presetTrackFor(value);
  const [width, setWidth] = useState(0);
  const pages = useMemo(() => (width > 0 ? trackPages(PRESET_TRACKS, width) : []), [width]);
  const initialPage = Math.max(0, pages.findIndex((pg) => pg.some((t) => t.id === chosen?.id)));

  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopPreview = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = '';
    }
    audioRef.current = null;
    setPreviewing(null);
  };
  useEffect(() => stopPreview, []);
  const preview = (t: PresetTrack) => {
    if (previewing === t.id) {
      stopPreview();
      return;
    }
    stopPreview();
    const a = new Audio(t.url);
    a.volume = 0.6;
    a.onended = stopPreview;
    audioRef.current = a;
    setPreviewing(t.id);
    a.play().catch(stopPreview);
  };

  const tile = (t: PresetTrack) => {
    const on = chosen?.id === t.id;
    const playing = previewing === t.id;
    return (
      <View key={t.id} style={[styles.tile, on && styles.tileOn]} testID={testID ? `${testID}-${t.id}` : undefined}>
        <Pressable
          onPress={() => {
            stopPreview();
            onPick(t);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${t.label}, ${t.mood}, ${trackLength(t.seconds)}`}
          accessibilityState={{ selected: on }}
          style={styles.pick}>
          <Text style={[styles.label, on && styles.labelOn]} numberOfLines={2}>
            {t.label}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {t.mood} · {trackLength(t.seconds)}
          </Text>
        </Pressable>
        {Platform.OS === 'web' ? (
          <Pressable
            onPress={() => preview(t)}
            accessibilityRole="button"
            accessibilityLabel={playing ? `Stop previewing ${t.label}` : `Preview ${t.label}`}
            style={({ pressed }) => [styles.play, playing && styles.playOn, pressed && styles.pressed]}
            testID={testID ? `${testID}-${t.id}-preview` : undefined}>
            <Text style={[styles.playText, playing && styles.playTextOn]}>{playing ? '■' : '▶'}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.box} testID={testID} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <PagedCarousel
          key={pages.length}
          width={width}
          initialPage={initialPage}
          prevLabel="Previous tracks"
          nextLabel="More tracks"
          pages={pages.map((pg, i) => (
            <View key={i} style={styles.row}>
              {pg.map(tile)}
            </View>
          ))}
        />
      ) : null}
      <Text style={styles.credit} testID={testID ? `${testID}-credit` : undefined}>
        {chosen ? `${chosen.label}, by ` : 'Stock tracks by '}
        <Text style={styles.creditLink} onPress={() => Linking.openURL(PRESET_TRACK_PAGE).catch(() => {})}>
          {PRESET_TRACK_AUTHOR}
        </Text>
        , {PRESET_TRACK_LICENCE}. The credit stays in the track name.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: TILE_GAP, paddingVertical: 2, paddingHorizontal: PAGE_PAD },
  tile: { width: TILE_W, borderRadius: Radius.control, borderWidth: 2, borderColor: 'transparent', backgroundColor: Palette.panel, padding: 6, gap: 4 },
  tileOn: { borderColor: Palette.accent },
  pick: { gap: 2, minHeight: 44 },
  label: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink2, lineHeight: 16 },
  labelOn: { color: Palette.ink },
  meta: { fontSize: FontSize.xs, color: Palette.muted },
  play: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: Palette.hairline },
  playOn: { backgroundColor: Palette.accent },
  playText: { fontSize: FontSize.xs, color: Palette.ink2 },
  playTextOn: { color: Palette.accentText },
  pressed: { opacity: 0.7 },
  credit: { fontSize: FontSize.xs, color: Palette.muted },
  creditLink: { textDecorationLine: 'underline' },
});
