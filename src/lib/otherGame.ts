/**
 * OTHER GAMES' CARDS IN A POKÉMON BINDER — every game michi can resolve besides its own.
 *
 * A pocket stores a bare TCGplayer productId (`binder_slots.card_id`), and that id namespace is
 * shared across every game, so a binder has always been ABLE to hold a One Piece or Lorcana card;
 * it simply had nothing to resolve one with. Everything michi loads — the gated catalog, the image
 * manifest, the price summary — is Pokémon's. This module is the other sources, and it is
 * deliberately NOT a second kit `Catalog` for resolution: `resolveCard` is called synchronously
 * from event handlers (BinderScreen), so what it needs is a synchronous snapshot plus a
 * subscription, which is what this exposes.
 *
 * PLURAL, ON PURPOSE (owner, 2026-09-17). This was written for exactly one secondary game, with
 * one catalog variable and one URL. A binder holding three games would have resolved only whichever
 * one that variable happened to be — the rest read "Unknown card", which is the blank-pocket bug
 * this module exists to prevent. Everything is keyed by game now; the list lives in otherGameKeys.
 *
 * ALWAYS ON, NEVER EAGER (matching tcgscan-app's 2026-09-17 call). A binder opened from a share
 * link, a bookmark or a crawler carries no query string, and a nameless pocket there is a bug, not
 * a feature — so resolution is not behind a flag. The cost stays proportional instead: nothing here
 * fetches until an id MISSES a Pokémon catalog that is actually loaded, so a Pokémon-only binder
 * never issues one of these requests, and a guest (who never loads the Pokémon catalog at all)
 * cannot trigger a 1.4 MB download by missing on every id.
 *
 * `?multi-tcg` gates one thing only, in lib/games.ts: whether the card picker OFFERS another game.
 *
 * Art is not here: the kit resolves pictures inside its own components, so each game's image
 * manifest is registered with the kit itself (registerImageManifest, lib/catalogConfig.ts) and
 * every existing `cardThumbUrl` call site keeps working untouched.
 */
import { buildCatalog, type Catalog, type CatalogCard, type PriceSummary, type RawCatalog } from 'tcgscan-browse';

import { browseUrl } from '@/lib/catalogConfig';
import { SECONDARY_GAMES, ONE_PIECE_PREFIX, type SecondaryGameDef } from '@/lib/otherGameKeys';

/** Where One Piece's public artifacts live, beside Pokémon's in the same bucket. */
export const ONE_PIECE_BROWSE = `${browseUrl}/${ONE_PIECE_PREFIX}`;

/**
 * Worth asking the other games about: card ids are numeric TCGplayer productIds. michi mints its
 * own ids for artwork and placeholder slots, and those must never cost a lookup.
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

/** Monotonic counter, bumped whenever any other game's data lands. `useOtherGame()` reads it. */
export function otherGameVersion(): number {
  return version;
}

// ---- cards ---------------------------------------------------------------------------------
//
// Each game's public catalog.json is already RawCatalog-shaped, so the kit's own builder turns it
// into a real `Catalog` — the same object type the browser takes. That means one loaded copy serves
// BOTH jobs: resolving a pocket's name, and being browsed in the card picker, with the kit's search,
// drill-down and facets rather than a second implementation of them.

/** After a failure, wait this long before another attempt. */
const RETRY_MS = 60_000;

interface GameState {
  def: SecondaryGameDef;
  browse: string;
  catalog: Catalog | null;
  load: Promise<Catalog | null> | null;
  failedAt: number;
  summary: Promise<PriceSummary> | null;
}

/** PER GAME, not per module: one shared `catalog` variable could only ever hold one game's. */
const games = new Map<string, GameState>(
  SECONDARY_GAMES.map((def) => [
    def.key,
    { def, browse: `${browseUrl}/${def.prefix}`, catalog: null, load: null, failedAt: 0, summary: null },
  ]),
);

function stateOf(game: string): GameState | undefined {
  return games.get(game);
}

/**
 * Fetch + build one game's catalog once. A failure is retryable but RATE-LIMITED: this is reached
 * from render (a pocket resolving its name), so an un-cooled retry would re-request on every
 * render pass for as long as the file is unavailable.
 */
function loadOne(s: GameState): Promise<Catalog | null> {
  if (!s.load && Date.now() - s.failedAt < RETRY_MS) return Promise.resolve(s.catalog);
  s.load ??= fetch(`${s.browse}/catalog.json`)
    .then((r) => (r.ok ? (r.json() as Promise<RawCatalog>) : null))
    .then(async (raw) => {
      if (!raw?.cards) throw new Error(`${s.def.key} catalog unavailable`);
      s.catalog = await buildCatalog(raw);
      bump();
      return s.catalog;
    })
    .catch((e: unknown) => {
      // SAID OUT LOUD. This swallowed a build failure whole on 2026-09-20: the file arrived with a
      // 200, the picker said "loading" for ever, and nothing anywhere said why.
      console.warn(`[otherGame] ${s.def.key} catalog failed:`, e instanceof Error ? e.message : e);
      s.load = null; // never pin a failure: a later miss retries, after the cooldown
      s.failedAt = Date.now();
      return null;
    });
  return s.load;
}

/**
 * Load one game's catalog (the picker, which browses a chosen game), or every other game's at
 * once (a pocket that missed, where nobody knows yet which game owns the id).
 */
export function loadOtherGameCatalog(game?: string): Promise<Catalog | null> {
  if (game) {
    const s = stateOf(game);
    return s ? loadOne(s) : Promise.resolve(null);
  }
  return Promise.all([...games.values()].map(loadOne)).then((all) => all.find(Boolean) ?? null);
}

/**
 * Find the game that owns `id`, ONE AT A TIME, stopping at the first that answers.
 *
 * This used to load every secondary game at once, which was free when there was one of them and
 * stopped being free at two: a binder holding a single One Piece card would also pull Lorcana's
 * whole catalog to learn nothing. Asking in order costs a little latency when the owner is last in
 * the list, and saves a download per game that is not in the binder at all — the common case, and
 * the one that happens on a phone.
 *
 * Concurrent misses are safe: `loadOne` memoises per game, so ten pockets missing at once share
 * one fetch rather than starting ten.
 */
async function loadUntilFound(id: string): Promise<Catalog | null> {
  for (const s of games.values()) {
    const catalog = s.catalog ?? (await loadOne(s));
    if (catalog?.getCard(id)) return catalog;
  }
  return null;
}

/** One game's catalog once built, else null. Synchronous; subscribe for the moment it lands. */
export function otherGameCatalog(game: string): Catalog | null {
  return stateOf(game)?.catalog ?? null;
}

/**
 * WHICH GAME OWNS `id`, and its catalog — for the surfaces that must SCAN a game rather than just
 * name one card. "Pages around this card" composes against a whole catalog, and handing it
 * Pokémon's for a One Piece seed is why every fill method came back empty: the methods themselves
 * are game-agnostic, the catalog under them was not.
 *
 * Synchronous and never fetches: a caller in render gets null until the catalog it needs has
 * already been loaded by ordinary pocket resolution.
 */
export function otherGameCatalogFor(id: string | null | undefined): { game: string; catalog: Catalog } | null {
  if (!askable(id)) return null;
  for (const s of games.values()) {
    if (s.catalog?.getCard(id)) return { game: s.def.key, catalog: s.catalog };
  }
  return null;
}

/** True once ANY other game's catalog is in memory — i.e. this binder holds another game's cards. */
export function anyOtherGameLoaded(): boolean {
  for (const s of games.values()) if (s.catalog) return true;
  return false;
}

/**
 * Any other game's card for `id`, or undefined. SYNCHRONOUS by contract (resolveCard is called
 * from event handlers); the first miss starts the fetches and `subscribeOtherGame` fires as each
 * lands. Ids are one namespace across games, so the first hit is the answer.
 *
 * `pokemonLoaded` is the guard that keeps this proportional: pass whether the Pokémon catalog is
 * actually in memory. Without it, every id misses for a guest and every visit pulls 1.4 MB.
 */
export function otherGameCard(id: string | null | undefined, pokemonLoaded: boolean): CatalogCard | undefined {
  if (!askable(id) || !pokemonLoaded) return undefined;
  let missing = false;
  for (const s of games.values()) {
    if (!s.catalog) {
      missing = true;
      continue;
    }
    const card = s.catalog.getCard(id);
    if (card) return card;
  }
  if (missing) void loadUntilFound(id);
  return undefined;
}

/**
 * Where a game's colour palettes live. Published beside its catalog, and read with the kit's
 * per-call override so a One Piece page can be composed from inside a Pokémon binder without
 * repointing the whole session (kit >= 0.9.20).
 */
export function otherGameColorUrl(game: string): string | null {
  const s = stateOf(game);
  return s ? `${s.browse}/color` : null;
}

// ---- visual neighbours ("More like this") ---------------------------------------------------
//
// STATIC, BECAUSE THE OTHER GAMES HAVE NO SERVER. Pokémon ranks neighbours through a pgvector RPC
// (`find_similar`); a secondary game is published as files with no API url at all, so its
// neighbours are precomputed from the SAME 64-d anchor embeddings the scanner uses and shipped as
// `similar-compact.json` beside its catalog. Ids are TCGplayer productIds, so a hit resolves
// through the catalog and image manifest already loaded.
//
// What it is honestly good at: OTHER PRINTINGS of the same art, which land first at 0.83-0.92.
// Past that cluster the ranking is colour and layout rather than subject — the same property
// Pokémon's shipped version has, and the reason the composer spreads results by subject.

interface CompactSimilar {
  scale: number;
  ids: string[];
  n: number[][];
  s: number[][];
}

export interface SimilarNeighbour {
  id: string;
  similarity: number;
}

const graphs = new Map<string, Map<string, SimilarNeighbour[]>>();
const graphLoads = new Map<string, Promise<void>>();

/** Fetch one game's neighbour graph once. Fails soft: no neighbours is a hidden method, not an error. */
export function loadOtherGameSimilar(game: string): Promise<void> {
  const s = stateOf(game);
  if (!s || graphs.has(game)) return Promise.resolve();
  let load = graphLoads.get(game);
  if (!load) {
    load = fetch(`${s.browse}/similar-compact.json`)
      .then((r) => (r.ok ? (r.json() as Promise<CompactSimilar>) : null))
      .then((raw) => {
        if (!raw?.ids) throw new Error(`${game} similar unavailable`);
        const out = new Map<string, SimilarNeighbour[]>();
        raw.ids.forEach((id, i) => {
          const idx = raw.n[i] ?? [];
          const sc = raw.s[i] ?? [];
          out.set(
            id,
            idx.map((j, rank) => ({ id: raw.ids[j], similarity: (sc[rank] ?? 0) / raw.scale })),
          );
        });
        graphs.set(game, out);
        bump();
      })
      .catch(() => {
        graphLoads.delete(game); // retryable, unlike a pinned empty graph
      });
    graphLoads.set(game, load);
  }
  return load;
}

/** True once this game's neighbour graph is in memory — the method is offered only then. */
export function otherGameSimilarReady(game: string): boolean {
  return graphs.has(game);
}

/**
 * One card's nearest neighbours, nearest first. An id absent from the graph (about 4% of One
 * Piece: cards with no usable image when the model's dataset was frozen) returns [], which the
 * caller treats as "no page to build", never as an error.
 */
export function otherGameSimilar(game: string, id: string, limit: number): SimilarNeighbour[] {
  return (graphs.get(game)?.get(id) ?? []).slice(0, limit);
}

// ---- prices --------------------------------------------------------------------------------
function loadSummary(s: GameState): Promise<PriceSummary> {
  s.summary ??= fetch(`${s.browse}/prices-summary.json`)
    .then((r) => {
      // THROW on a non-OK response so the catch below un-pins the cache. Returning {} here would
      // cache "this game has no prices" for the whole session after one 503.
      if (!r.ok) throw new Error(`${s.def.key} prices-summary ${r.status}`);
      return r.json() as Promise<PriceSummary>;
    })
    .catch(() => {
      s.summary = null;
      return {} as PriceSummary;
    });
  return s.summary;
}

/**
 * Every other game's headline prices, merged. Merged UNDER Pokémon's by lib/prices, so a shared id
 * (there are none today — the summaries were measured disjoint) would still read as Pokémon's.
 *
 * Only games whose CATALOG is loaded are asked: a summary is worth fetching once a binder is known
 * to hold that game's cards, and not before.
 */
export function otherGamePriceSummary(): Promise<PriceSummary> {
  const loaded = [...games.values()].filter((s) => s.catalog);
  if (!loaded.length) return Promise.resolve({} as PriceSummary);
  return Promise.all(loaded.map(loadSummary)).then((parts) => Object.assign({}, ...parts) as PriceSummary);
}
