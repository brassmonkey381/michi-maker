/**
 * WHICH GAMES THE CARD PICKER OFFERS.
 *
 * A binder always RESOLVES both games (lib/otherGame): names, art and prices for a One Piece card
 * work on every surface, for every visitor, with no flag — a shared binder link carries no query
 * string and a nameless pocket is a bug. This module gates one narrower thing: whether the picker
 * offers One Piece as a source you can browse and place FROM.
 *
 * `?multi-tcg` on any web URL turns it on for that browser and remembers it; `?multi-tcg=off`
 * forgets it. Same shape as the variant switch in constants/variants.ts, and web-only for the same
 * reason: native has no URL to carry it.
 */
import { Platform } from 'react-native';

export type GameId = 'pokemon' | 'onepiece';

const FLAG_KEY = 'michi.multiTcg';

export function gameLabel(game: GameId): string {
  return game === 'onepiece' ? 'One Piece' : 'Pokémon';
}

function readFlag(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('multi-tcg')) {
      const v = (q.get('multi-tcg') ?? '').toLowerCase();
      const on = !(v === 'off' || v === '0' || v === 'false');
      if (on) window.localStorage?.setItem(FLAG_KEY, '1');
      else window.localStorage?.removeItem(FLAG_KEY);
      return on;
    }
    return window.localStorage?.getItem(FLAG_KEY) === '1';
  } catch {
    return false; // storage can throw in private mode / with site data blocked
  }
}

/** True when this browser may pick One Piece cards. Constant for the page load. */
export const MULTI_TCG: boolean = readFlag();

/** The games the picker offers, in order. Pokémon alone unless the flag is on. */
export const PICKER_GAMES: readonly GameId[] = MULTI_TCG ? ['pokemon', 'onepiece'] : ['pokemon'];
