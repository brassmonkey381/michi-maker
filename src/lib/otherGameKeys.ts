/**
 * Constants shared by lib/catalogConfig and lib/otherGame.
 *
 * Their own module because the two would otherwise import each other: catalogConfig registers One
 * Piece's image manifest at import time, and otherGame reads catalogConfig's `browseUrl`.
 */

/** The key One Piece's secondary image manifest is registered and cached under (kit >= 0.9.17). */
export const ONE_PIECE_MANIFEST_KEY = 'onepiece';

/** One Piece's prefix inside the same public browse bucket as Pokémon's artifacts. */
export const ONE_PIECE_PREFIX = 'onepiece';
