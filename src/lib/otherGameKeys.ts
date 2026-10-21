/**
 * EVERY GAME BESIDES POKÉMON WHOSE CARDS A BINDER CAN RESOLVE.
 *
 * Its own module because the two readers would otherwise import each other: catalogConfig
 * registers each secondary image manifest at import time, and otherGame reads catalogConfig's
 * `browseUrl`.
 *
 * ADDING A GAME IS ONE ROW IN `DEFS`. Widen `SecondaryGameKey` and the compiler demands the row (and
 * refuses a row with no key, or one that does not say whether it is published), which is what an
 * array could not do: a key widened without an entry used to compile and resolve nothing.
 *
 * A ROW CAN LAND BEFORE ITS FILES, with `published: false`, and then nothing asks the bucket for
 * them: lib/otherGame, catalogConfig's manifest and price registration, the card picker (lib/games)
 * and the OG share renderer all read PUBLISHED_SECONDARY_GAMES. Flip the row to true once
 * `browse/<prefix>/catalog.json` is in the bucket, and add its prefix to the OG renderer's copy
 * (api/og-image-binder.js, plain CommonJS outside this build) in the same change:
 * otherGameKeys.test.ts pins that copy to the published rows and fails until they match. Labels
 * (lib/games `gameLabel`) read the whole table. None of these readers names a game.
 *
 * Pokémon is deliberately absent: it is michi's PRIMARY catalog (loaded through the gated source
 * in catalogConfig), not a secondary one.
 */
/** Every secondary game's key. Widen this and `DEFS` below must gain the row, or tsc fails. */
export type SecondaryGameKey = 'onepiece' | 'lorcana' | 'riftbound' | 'digimon' | 'magic' | 'yugioh' | 'cyberpunk';

export interface SecondaryGameDef {
  /** Also the image-manifest key and the cache-key suffix the kit stores it under. */
  key: SecondaryGameKey;
  label: string;
  /** Prefix inside the same public browse bucket as Pokémon's artifacts. */
  prefix: string;
  /**
   * Its browse bundle (`browse/<prefix>/{catalog,images,prices-summary}.json`) belongs in the
   * bucket, so michi may ask for it and the picker may offer it. MIRRORS tcgscan-data's
   * pipeline/tcgscan/publish/browse_specs.py `live` flag: that repo refuses to publish a game whose
   * `live` is False, so true here against False there is a chip that can never load. Required, so
   * every row has to state it.
   */
  published: boolean;
}

/** One row per key, in picker order (string keys enumerate in insertion order). */
const DEFS: Record<SecondaryGameKey, Omit<SecondaryGameDef, 'key'>> = {
  onepiece: { label: 'One Piece', prefix: 'onepiece', published: true },
  lorcana: { label: 'Disney Lorcana', prefix: 'lorcana', published: true },
  // live=True upstream since 2026-10-18: the first bundle is published by hand, then the 13:30 lane
  // refreshes it. No colour blob and no theme rows yet, so it resolves cards and nothing more.
  // Until the bundle is in the bucket, lib/otherGame takes the bucket's "no such file" as final for
  // the session (the picker says "isn't available yet") instead of asking again every minute.
  riftbound: { label: 'Riftbound', prefix: 'riftbound', published: true },
  // live=True upstream (proof of concept, owner 2026-10-18). Its first publish landed 2026-10-19:
  // browse/digimon/catalog.json answers 200 (9,399 cards, 8,960 pictured), with its colour file
  // beside it and no theme rows yet. Published here and in the OG copy in one change, as in
  // tcgscan-app's game-defs.ts.
  digimon: { label: 'Digimon', prefix: 'digimon', published: true },
  // Partial games (live=True upstream since 2026-10-20, catalog="imaged"): only their pictured cards
  // are published, ~14k each, and the image mirror is capped for now. First publish landed
  // 2026-10-20: both catalog.json answer 200. michi shows every game as soon as its bundle is up
  // (owner, 2026-10-20), while tcgscan-app keeps them hidden until App Store review news.
  magic: { label: 'Magic: The Gathering', prefix: 'magic', published: true },
  yugioh: { label: 'Yu-Gi-Oh!', prefix: 'yugioh', published: true },
  // live=True upstream since 2026-10-21 (onboarded with state/new-game.ps1): browse/cyberpunk/catalog.json
  // answers 200 (459 cards, all pictured). Colour, neighbours and theme rows follow in later steps.
  cyberpunk: { label: 'Cyberpunk TCG', prefix: 'cyberpunk', published: true },
};

/** Every row, published or not: keys and labels. Whatever FETCHES reads PUBLISHED_SECONDARY_GAMES. */
export const SECONDARY_GAMES: readonly SecondaryGameDef[] = (Object.keys(DEFS) as SecondaryGameKey[]).map(
  (key) => ({ key, ...DEFS[key] }),
);

/** The rows michi may ask the bucket about, in table order. */
export const PUBLISHED_SECONDARY_GAMES: readonly SecondaryGameDef[] = SECONDARY_GAMES.filter((g) => g.published);

/**
 * THE BUCKET SAYS THE FILE IS NOT THERE: a 4xx other than a timeout (408) or a rate limit (429),
 * which are worth asking again. Supabase storage answers a missing public object with HTTP 400 and
 * keeps the 404 inside its JSON body (`{"statusCode":"404","error":"not_found"}`), so a test for
 * `status === 404` would never fire. lib/otherGame treats this as final for the session; a 5xx or a
 * network error stays retryable.
 */
export function bucketSaysMissing(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
