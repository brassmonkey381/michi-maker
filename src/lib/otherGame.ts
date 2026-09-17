/**
 * ONE PIECE CARDS IN A POKÉMON BINDER — the second game michi can resolve.
 *
 * A pocket stores a bare TCGplayer productId (`binder_slots.card_id`), and that id namespace is
 * shared across every game, so a binder has always been ABLE to hold a One Piece card; it simply
 * had nothing to resolve one with. Everything michi loads — the gated catalog, the image manifest,
 * the price summary — is Pokémon's. This module is the second source, and it is deliberately NOT a
 * second kit `Catalog` for resolution: `resolveCard` is called synchronously from event handlers
 * (BinderScreen), so what it needs is a synchronous snapshot plus a subscription, which is what
 * this exposes.
 *
 * ALWAYS ON, NEVER EAGER (matching tcgscan-app's 2026-09-17 call). A binder opened from a share
 * link, a bookmark or a crawler carries no query string, and a nameless pocket there is a bug, not
 * a feature — so resolution is not behind a flag. The cost stays proportional instead: nothing here
 * fetches until an id MISSES a Pokémon catalog that is actually loaded, so a Pokémon-only binder
 * never issues one of these requests, and a guest (who never loads the Pokémon catalog at all)
 * cannot trigger a 1.4 MB download by missing on every id.
 *
 * `?multi-tcg` gates one thing only, in lib/games.ts: whether the card picker OFFERS One Piece.
 *
 * Art is not here: the kit resolves pictures inside its own components, so One Piece's image
 * manifest is registered with the kit itself (registerImageManifest, lib/catalogConfig.ts) and
 * every existing `cardThumbUrl` call site keeps working untouched.
 */
import { buildCatalog, type Catalog, type CatalogCard, type PriceSummary, type RawCatalog } from 'tcgscan-browse';

import { browseUrl } from '@/lib/catalogConfig';
import { ONE_PIECE_PREFIX } from '@/lib/otherGameKeys';

/** Where One Piece's public artifacts live, beside Pokémon's in the same bucket. */
export const ONE_PIECE_BROWSE = `${browseUrl}/${ONE_PIECE_PREFIX}`;

/**
 * Worth asking One Piece about: card ids are numeric TCGplayer productIds. michi mints its own
 * ids for artwork and placeholder slots, and those must never cost a lookup.
 */
export function askable(id: string | null | undefined): id is string {
  return !!id && /^\d+$/.test(id);
}

// ---- change notification -------------------------------------------------------------------
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function subscribeOtherGame(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Monotonic counter, bumped whenever One Piece data lands. `useOtherGame()` reads it. */
export function otherGameVersion(): number {
  return version;
}

// ---- cards ---------------------------------------------------------------------------------
//
// One Piece's public catalog.json is already RawCatalog-shaped, so the kit's own builder turns it
// into a real `Catalog` — the same object type the browser takes. That means one loaded copy serves
// BOTH jobs: resolving a pocket's name, and being browsed in the card picker, with the kit's search,
// drill-down and facets rather than a second implementation of them.

let catalog: Catalog | null = null;
let catalogLoad: Promise<Catalog | null> | null = null;
/** After a failure, wait this long before another attempt. */
const RETRY_MS = 60_000;
let failedAt = 0;

/**
 * Fetch + build One Piece's catalog once. A failure is retryable but RATE-LIMITED: this is reached
 * from render (a pocket resolving its name), so an un-cooled retry would re-request on every
 * render pass for as long as the file is unavailable.
 */
export function loadOtherGameCatalog(): Promise<Catalog | null> {
  if (!catalogLoad && Date.now() - failedAt < RETRY_MS) return Promise.resolve(catalog);
  catalogLoad ??= fetch(`${ONE_PIECE_BROWSE}/catalog.json`)
    .then((r) => (r.ok ? (r.json() as Promise<RawCatalog>) : null))
    .then(async (raw) => {
      if (!raw?.cards) throw new Error('one piece catalog unavailable');
      catalog = await buildCatalog(raw);
      bump();
      return catalog;
    })
    .catch(() => {
      catalogLoad = null; // never pin a failure: a later miss retries, after the cooldown
      failedAt = Date.now();
      return null;
    });
  return catalogLoad;
}

/** One Piece's catalog once built, else null. Synchronous; subscribe for the moment it lands. */
export function otherGameCatalog(): Catalog | null {
  return catalog;
}

/**
 * One Piece's card for `id`, or undefined. SYNCHRONOUS by contract (resolveCard is called from
 * event handlers); the first miss starts the fetch and `subscribeOtherGame` fires when it lands.
 *
 * `pokemonLoaded` is the guard that keeps this proportional: pass whether the Pokémon catalog is
 * actually in memory. Without it, every id misses for a guest and every visit pulls 1.4 MB.
 */
export function otherGameCard(id: string | null | undefined, pokemonLoaded: boolean): CatalogCard | undefined {
  if (!askable(id) || !pokemonLoaded) return undefined;
  if (!catalog) {
    void loadOtherGameCatalog();
    return undefined;
  }
  return catalog.getCard(id);
}

// ---- prices --------------------------------------------------------------------------------
let summary: Promise<PriceSummary> | null = null;

/**
 * One Piece's headline prices. Merged UNDER Pokémon's by lib/prices, so a shared id (there are
 * none today — the two summaries were measured disjoint) would still read as Pokémon's.
 */
export function otherGamePriceSummary(): Promise<PriceSummary> {
  summary ??= fetch(`${ONE_PIECE_BROWSE}/prices-summary.json`)
    .then((r) => {
      // THROW on a non-OK response so the catch below un-pins the cache. Returning {} here would
      // cache "One Piece has no prices" for the whole session after one 503.
      if (!r.ok) throw new Error(`one piece prices-summary ${r.status}`);
      return r.json() as Promise<PriceSummary>;
    })
    .catch(() => {
      summary = null;
      return {} as PriceSummary;
    });
  return summary;
}
