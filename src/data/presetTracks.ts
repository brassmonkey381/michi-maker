/**
 * THE PRESET SOUNDTRACK LIBRARY: stock tracks a binder or a page can wear without an upload or a
 * rights tick, offered on a carousel in the soundtrack field the way sleeves and share backdrops
 * are (owner, 2026-10-14). All by Kevin MacLeod (incompetech.com), licensed CC BY 4.0, which asks for a
 * credit and nothing else: the credit is in the name the track pill shows (presetTrackName).
 *
 * LISTED IN src/data/presets.json (owner's sheet, tools/presets-sheet.html): the order there is the
 * order offered, and `offered: false` hides a track without losing it. The MP3s are hosted by
 * scripts/presets/rehost-tracks.mjs, which adds its entries to the same file.
 */
import presets from './presets.json' with { type: 'json' };


export interface PresetTrack {
  id: string;
  label: string;
  /** One word for the tile: what the track feels like. */
  mood: string;
  /** The hosted MP3, the address BinderTrack.url stores. */
  url: string;
  bytes: number;
  seconds: number;
}

export const PRESET_TRACK_AUTHOR = 'Kevin MacLeod';
export const PRESET_TRACK_LICENCE = 'CC BY 4.0';
export const PRESET_TRACK_SOURCE = 'incompetech.com';
export const PRESET_TRACK_PAGE = 'https://incompetech.com/music/royalty-free/';

export const PRESET_TRACKS: readonly PresetTrack[] = (presets.tracks as (PresetTrack & { offered?: boolean })[]).filter((t) => t.offered !== false);

/** The preset a stored track address is, if it is one. */
export function presetTrackFor(url: string | null | undefined): PresetTrack | undefined {
  return url ? PRESET_TRACKS.find((t) => t.url === url) : undefined;
}

/** The name the pill shows: the title with its credit, as the licence asks. */
export function presetTrackName(t: PresetTrack): string {
  return `${t.label} - ${PRESET_TRACK_AUTHOR} (${PRESET_TRACK_SOURCE}), ${PRESET_TRACK_LICENCE}`;
}

/** m:ss for a tile. */
export function trackLength(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
