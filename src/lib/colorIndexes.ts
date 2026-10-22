/**
 * BOTH POKÉMON COLOUR BLOBS, English and Japanese.
 *
 * The data server publishes a card's dominant colours as an on-device blob per language
 * (TCGScan-DS, 2026-10-22): `browse/color` holds English Pokémon (every cards_en row with a
 * picture), `browse/color-jp` holds Japanese, and the two share no ids. The kit's `getColorIndex()`
 * knows one URL at a time, derived from the active browse URL, so a Japanese card asked for its
 * palette through the kit alone always answered "no colour data". Other games keep the kit's
 * regular `<game>/color` prefix (lib/otherGame); only Pokémon splits by language.
 *
 * Load-once in the kit, keyed by URL, so asking twice costs nothing.
 */
import { useEffect, useState } from 'react';
import { getColorIndex, loadColorIndex, type ColorHit, type ColorIndex, type ColorRegion, type Lab } from 'tcgscan-browse';

import { browseUrl } from '@/lib/catalogConfig';

export const JP_COLOR_URL = `${browseUrl}/color-jp`;

/** Start both downloads (the active game's and the Japanese one). Resolves when both have settled. */
export function loadPokemonColorIndexes(): Promise<(ColorIndex | null)[]> {
  return Promise.all([loadColorIndex(), loadColorIndex(JP_COLOR_URL)]);
}

/** Every Pokémon index loaded so far, English first. */
export function loadedColorIndexes(): ColorIndex[] {
  const out: ColorIndex[] = [];
  const en = getColorIndex();
  const jp = getColorIndex(JP_COLOR_URL);
  if (en) out.push(en);
  if (jp && jp !== en) out.push(jp);
  return out;
}

/** The loaded index that holds `cardId`, or null when none does (yet). */
export function colorIndexHolding(cardId: string): ColorIndex | null {
  return loadedColorIndexes().find((i) => i.has(cardId)) ?? null;
}

/** Nearest palettes across every loaded index, nearest first. */
export function searchLoadedIndexes(query: Lab[], region: ColorRegion, limit: number): ColorHit[] {
  const hits = loadedColorIndexes().flatMap((i) => i.searchByColors(query, region, limit));
  return hits.sort((x, y) => x.score - y.score).slice(0, limit);
}

/**
 * React: kick off both loads and re-render as each lands. `settled` is true once both have
 * answered, loaded or not; `failed` when neither could load, so a sheet can stop waiting.
 */
export function usePokemonColorIndexes(): { settled: boolean; failed: boolean; tick: number } {
  const [state, setState] = useState(() => ({ settled: false, failed: false, tick: 0 }));
  useEffect(() => {
    let live = true;
    const bump = () => live && setState((s) => ({ ...s, tick: s.tick + 1 }));
    const a = loadColorIndex().then(bump);
    const b = loadColorIndex(JP_COLOR_URL).then(bump);
    void Promise.all([a, b]).then(() => {
      if (live) setState((s) => ({ ...s, settled: true, failed: loadedColorIndexes().length === 0 }));
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
