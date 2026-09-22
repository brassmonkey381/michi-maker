/**
 * WHICH GAMES THE CARD PICKER OFFERS.
 *
 * A binder always RESOLVES both games (lib/otherGame): names, art and prices for a One Piece card
 * work on every surface, for every visitor, with no flag — a shared binder link carries no query
 * string and a nameless pocket is a bug. This module gates one narrower thing: whether the picker
 * offers One Piece as a source you can browse and place FROM.
 *
 * ON FOR EVERYONE (owner, 2026-09-21). It was behind `?multi-tcg` while the other games were
 * proved out; nobody should have to type a query string to see a game. The switch is kept the
 * other way round: `?multi-tcg=off` on any web URL hides the other games for that browser and
 * remembers it, and `?multi-tcg` (or `=on`) brings them back. Native has no URL to carry it and
 * simply has them on.
 */
import { Platform } from 'react-native';

import { SECONDARY_GAMES, type SecondaryGameKey } from '@/lib/otherGameKeys';

export type GameId = 'pokemon' | SecondaryGameKey;

const FLAG_KEY = 'michi.multiTcg';

export function gameLabel(game: GameId): string {
  return SECONDARY_GAMES.find((g) => g.key === game)?.label ?? 'Pokémon';
}

function readFlag(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('multi-tcg')) {
      const v = (q.get('multi-tcg') ?? '').toLowerCase();
      const on = !(v === 'off' || v === '0' || v === 'false');
      // Only the opt-out is remembered; on is the default and needs no record.
      if (on) window.localStorage?.removeItem(FLAG_KEY);
      else window.localStorage?.setItem(FLAG_KEY, 'off');
      return on;
    }
    return window.localStorage?.getItem(FLAG_KEY) !== 'off';
  } catch {
    return true; // storage can throw in private mode / with site data blocked
  }
}

/** True unless this browser has opted out of the other games. Constant for the page load. */
export const MULTI_TCG: boolean = readFlag();

/** The games the picker offers, in order. Every game unless the browser opted out. */
export const PICKER_GAMES: readonly GameId[] = MULTI_TCG
  ? ['pokemon', ...SECONDARY_GAMES.map((g) => g.key)]
  : ['pokemon'];
