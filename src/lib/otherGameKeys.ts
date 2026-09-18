/**
 * EVERY GAME BESIDES POKÉMON WHOSE CARDS A BINDER CAN RESOLVE.
 *
 * Its own module because the two readers would otherwise import each other: catalogConfig
 * registers each secondary image manifest at import time, and otherGame reads catalogConfig's
 * `browseUrl`.
 *
 * ADDING A GAME IS ONE ENTRY HERE, once `browse/<prefix>/{catalog,images,prices-summary}.json` is
 * published. lib/otherGame loops this list, catalogConfig registers every manifest in it, and
 * lib/prices folds in every summary — none of them names a game.
 *
 * Pokémon is deliberately absent: it is michi's PRIMARY catalog (loaded through the gated source
 * in catalogConfig), not a secondary one.
 */
/** Every secondary game's key. Widen this AND add the entry below to onboard a game. */
export type SecondaryGameKey = 'onepiece' | 'lorcana';

export interface SecondaryGameDef {
  /** Also the image-manifest key and the cache-key suffix the kit stores it under. */
  key: SecondaryGameKey;
  label: string;
  /** Prefix inside the same public browse bucket as Pokémon's artifacts. */
  prefix: string;
}

export const SECONDARY_GAMES: readonly SecondaryGameDef[] = [
  { key: 'onepiece', label: 'One Piece', prefix: 'onepiece' },
  // Lorcana: uncomment once its browse artifacts are published. Until then every miss would
  // spend a 404, and the picker would offer a game with no cards in it.
  // { key: 'lorcana', label: 'Disney Lorcana', prefix: 'lorcana' },
];

/** The key One Piece's secondary image manifest is registered and cached under (kit >= 0.9.17). */
export const ONE_PIECE_MANIFEST_KEY = 'onepiece';

/** One Piece's prefix inside the same public browse bucket as Pokémon's artifacts. */
export const ONE_PIECE_PREFIX = 'onepiece';
