/**
 * Card-size source of truth: which real-world footprint each card kind occupies, and the
 * V-UNION / jumbo sets the editor offers. Kept dependency-light (only types) so both the
 * content helpers and the UI can import it.
 */

import type { CardKind } from '@/data/binderTypes';

/** Verified V-UNION piece ids (TCGdex `swshp`), in [topLeft, topRight, bottomLeft, bottomRight] order. */
export const VUNION = {
  mewtwo: ['swshp-SWSH159', 'swshp-SWSH160', 'swshp-SWSH161', 'swshp-SWSH162'],
  greninja: ['swshp-SWSH155', 'swshp-SWSH156', 'swshp-SWSH157', 'swshp-SWSH158'],
  zacian: ['swshp-SWSH163', 'swshp-SWSH164', 'swshp-SWSH165', 'swshp-SWSH166'],
  pikachu: ['swshp-SWSH139', 'swshp-SWSH140', 'swshp-SWSH141', 'swshp-SWSH142'],
} as const satisfies Record<string, readonly [string, string, string, string]>;

/** Jumbo (oversized) card ids in the catalogue. */
export const JUMBO = {
  charizard: 'jumbo-charizard',
  pikachu: 'jumbo-pikachu',
  mewtwo: 'jumbo-mewtwo',
  lugia: 'jumbo-lugia',
  umbreon: 'jumbo-umbreon',
  blastoise: 'jumbo-blastoise',
} as const;

/** The V-UNIONs the editor can place, as a list (label + the four piece ids). */
export const VUNION_SETS = [
  { key: 'mewtwo', label: 'Mewtwo V-UNION', pieces: VUNION.mewtwo },
  { key: 'greninja', label: 'Greninja V-UNION', pieces: VUNION.greninja },
  { key: 'zacian', label: 'Zacian V-UNION', pieces: VUNION.zacian },
  { key: 'pikachu', label: 'Pikachu V-UNION', pieces: VUNION.pikachu },
] as const;

/** The pocket footprint a single card of this kind occupies (jumbo = 2×2; everything else 1×1). */
export function footprintForKind(kind?: CardKind): { rows: number; cols: number } {
  return kind === 'jumbo' ? { rows: 2, cols: 2 } : { rows: 1, cols: 1 };
}
