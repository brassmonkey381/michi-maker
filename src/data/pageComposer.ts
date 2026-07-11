/**
 * Page composer — auto-curates a binder page around a SEED card, michi-method style.
 *
 * Each method takes the seed + the loaded catalog + the current page and returns placements
 * for the page's EMPTY pockets (existing cards, the seed included, are never touched):
 *
 *  - sameArtist    → the seed illustrator's other work, spread across eras (Card Artist method)
 *  - samePokemon   → the seed's species across sets/art styles (Single Pokémon method)
 *  - evolutionLine → the seed's evolution family, arranged to read Basic → final stage
 *                    (Themed/Story method)
 *  - moreLikeThis  → visually similar cards via the embedding RPC, framing the seed
 *                    (Anchor method)
 *
 * Selection is deterministic (except the RPC ranking): only standard 1×1 cards, no card already
 * on the page, no duplicate (name, set) print twice, and "variety ranking" — candidates are
 * round-robined across series so a page samples eras/styles instead of dumping one set's run.
 */
import { findSimilar, similarAvailable } from 'tcgscan-browse';

import type { Catalog, CatalogCard } from '@/lib/catalog';
import { occupiedCells, type DemoPage } from '@/data/binderTypes';
import { hasToken } from '@/data/nameMatch';
import { loadPokemonPartners, partnersFor } from '@/data/pokemonPartners';
import { loadTrainerPartners, trainerFor } from '@/data/trainerPartners';

/**
 * Kick off (or await) the upstream partner tables (tcgscan-data). Load-once; the AutoFill
 * sheet awaits this before computing which methods a seed supports.
 */
export function loadPartnerData(): Promise<void> {
  return Promise.all([loadTrainerPartners(), loadPokemonPartners()]).then(() => undefined);
}

export type ComposeMethod =
  | 'sameArtist'
  | 'samePokemon'
  | 'evolutionLine'
  | 'moreLikeThis'
  | 'trainerPage'
  | 'pokemonFriends';

export interface ComposePlacement {
  row: number;
  col: number;
  cardId: string;
}

export const COMPOSE_METHODS: {
  key: ComposeMethod;
  label: string;
  description: string;
}[] = [
  {
    key: 'moreLikeThis',
    label: '≈ More like this',
    description: 'Frame this card with its most visually similar neighbours (anchor page).',
  },
  {
    key: 'samePokemon',
    label: 'Same Pokémon',
    description: 'This Pokémon across sets and art styles.',
  },
  {
    key: 'evolutionLine',
    label: 'Evolution line',
    description: 'Its family, reading Basic → final stage across the page.',
  },
  {
    key: 'pokemonFriends',
    label: 'Friends & partners',
    description: 'Pokémon this one is known to pair with — duos, TAG TEAMs, lore.',
  },
  {
    key: 'trainerPage',
    label: 'Trainer page',
    description: 'Their signature partner, canonical team, and trainer cards together.',
  },
  {
    key: 'sameArtist',
    label: 'Same artist',
    description: 'More cards illustrated by the same artist, sampled across eras.',
  },
];

/** Which methods make sense for this seed (e.g. no artist page when illustrator is unknown). */
export function availableMethods(seed: CatalogCard, catalog: Catalog): ComposeMethod[] {
  const out: ComposeMethod[] = [];
  if (similarAvailable()) out.push('moreLikeThis');
  const species = speciesOf(seed);
  if (species) out.push('samePokemon');
  if (seed.evolutionLine.length > 1) out.push('evolutionLine');
  if (species && partnersFor(species, catalog).length > 0) out.push('pokemonFriends');
  if (trainerFor(seed.name)) out.push('trainerPage');
  if (seed.illustrator.trim()) out.push('sameArtist');
  return out;
}

// Decorations that appear alongside a species in card names ("Pikachu ex", "Radiant Greninja",
// "Dark Alakazam"); stripped when falling back to name-based species extraction.
const NAME_DECORATIONS = new Set([
  'ex', 'gx', 'v', 'vmax', 'vstar', 'v-union', 'break', 'prime', 'radiant', 'shining',
  'dark', 'light', 'delta', 'star', 'lv.x',
]);

/**
 * The seed's species, lowercase — from its evolution line when known (authoritative), else a
 * best-effort strip of decorations/owner prefixes from the name ("Erika's Vileplume" → vileplume).
 * '' when nothing sensible remains (e.g. an item card).
 */
export function speciesOf(card: CatalogCard): string {
  const n = card.name.toLowerCase();
  if (card.evolutionLine.length > 0) {
    // Longest family member contained in the name (handles "Surfing Pikachu", "Pikachu VMAX").
    const hit = [...card.evolutionLine].sort((a, b) => b.length - a.length).find((s) => n.includes(s));
    if (hit) return hit;
  }
  const tokens = n
    .split(/\s+/)
    .filter((t) => !NAME_DECORATIONS.has(t) && !/['’]s$/.test(t));
  return tokens.join(' ').trim();
}

/** Empty pockets of a page in reading (row-major) order. */
function emptyCellsRowMajor(page: DemoPage): { row: number; col: number }[] {
  const occupied = occupiedCells(page);
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < page.rows; r += 1) {
    for (let c = 0; c < page.cols; c += 1) {
      if (!occupied.has(`${r},${c}`)) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** Empty pockets in column-major order — used so evolution stages read left → right. */
function emptyCellsColMajor(page: DemoPage): { row: number; col: number }[] {
  const occupied = occupiedCells(page);
  const cells: { row: number; col: number }[] = [];
  for (let c = 0; c < page.cols; c += 1) {
    for (let r = 0; r < page.rows; r += 1) {
      if (!occupied.has(`${r},${c}`)) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** Ids already placed on the page (never repeat a card that's on it, seed included). */
function idsOnPage(page: DemoPage): Set<string> {
  return new Set(page.slots.filter((s) => s.cardId).map((s) => s.cardId as string));
}

/**
 * Base candidate filter: standard footprint only (jumbo/V-UNION need multi-pocket handling the
 * composer doesn't attempt), a real image-worthy card, not already on the page, and each
 * (name, set) print at most once across the result.
 */
function filterAndDedupe(candidates: CatalogCard[], page: DemoPage): CatalogCard[] {
  const onPage = idsOnPage(page);
  const seenPrint = new Set<string>();
  const out: CatalogCard[] = [];
  for (const c of candidates) {
    if (c.kind !== 'standard') continue;
    if (onPage.has(c.id)) continue;
    const print = `${c.name.toLowerCase()}|${c.setId}`;
    if (seenPrint.has(print)) continue;
    seenPrint.add(print);
    out.push(c);
  }
  return out;
}

/**
 * Variety ranking: bucket by series (era), order buckets oldest → newest, then round-robin —
 * so a 9-pocket page samples across eras instead of running one set front-to-back.
 */
function varietyRank(cards: CatalogCard[]): CatalogCard[] {
  const buckets = new Map<string, CatalogCard[]>();
  for (const c of cards) {
    const list = buckets.get(c.seriesId) ?? [];
    list.push(c);
    buckets.set(c.seriesId, list);
  }
  const ordered = [...buckets.values()].map((list) =>
    [...list].sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999')),
  );
  ordered.sort((a, b) => (a[0].releaseDate || '9999').localeCompare(b[0].releaseDate || '9999'));
  const out: CatalogCard[] = [];
  for (let i = 0; out.length < cards.length; i += 1) {
    let advanced = false;
    for (const bucket of ordered) {
      if (i < bucket.length) {
        out.push(bucket[i]);
        advanced = true;
      }
    }
    if (!advanced) break;
  }
  return out;
}

/** Round-robin across buckets keyed by `keyFn` (bucket order = first appearance). */
function interleaveBy(cards: CatalogCard[], keyFn: (c: CatalogCard) => string): CatalogCard[] {
  const buckets = new Map<string, CatalogCard[]>();
  for (const c of cards) {
    const k = keyFn(c);
    const list = buckets.get(k) ?? [];
    list.push(c);
    buckets.set(k, list);
  }
  const lists = [...buckets.values()];
  const out: CatalogCard[] = [];
  for (let i = 0; out.length < cards.length; i += 1) {
    let advanced = false;
    for (const list of lists) {
      if (i < list.length) {
        out.push(list[i]);
        advanced = true;
      }
    }
    if (!advanced) break;
  }
  return out;
}

/**
 * Share `total` picks across ordered buckets (earlier buckets absorb the remainder), then
 * backfill any shortfall from the leftovers — so one huge bucket can't starve the others.
 */
function allocateAcross(buckets: CatalogCard[][], total: number): CatalogCard[] {
  const nonEmpty = buckets.filter((b) => b.length > 0);
  if (nonEmpty.length === 0) return [];
  const base = Math.floor(total / nonEmpty.length);
  const remainder = total % nonEmpty.length;
  const picked: CatalogCard[] = [];
  const leftovers: CatalogCard[] = [];
  nonEmpty.forEach((bucket, i) => {
    const quota = base + (i < remainder ? 1 : 0);
    picked.push(...bucket.slice(0, quota));
    leftovers.push(...bucket.slice(quota));
  });
  return [...picked, ...leftovers].slice(0, total);
}

/** Zip candidates onto cells. */
function place(cells: { row: number; col: number }[], cards: CatalogCard[]): ComposePlacement[] {
  return cells.slice(0, cards.length).map((cell, i) => ({ ...cell, cardId: cards[i].id }));
}

/**
 * Compose placements for the page's empty pockets. Async because `moreLikeThis` calls the
 * similarity RPC; the other methods scan the loaded catalog synchronously. Returns [] when the
 * method yields nothing (unknown artist, no empty pockets, RPC unavailable, …).
 */
export async function composePage(
  method: ComposeMethod,
  seed: CatalogCard,
  catalog: Catalog,
  page: DemoPage,
): Promise<ComposePlacement[]> {
  const cells = method === 'evolutionLine' ? emptyCellsColMajor(page) : emptyCellsRowMajor(page);
  if (cells.length === 0) return [];

  if (method === 'moreLikeThis') {
    // Ask for extra hits: some resolve to jumbo/V-UNION or cards already placed and get filtered.
    const hits = await findSimilar(seed.id, cells.length * 3 + 8);
    const cards = hits
      .map((h) => catalog.getCard(h.id))
      .filter((c): c is CatalogCard => !!c);
    return place(cells, filterAndDedupe(cards, page).slice(0, cells.length));
  }

  if (method === 'sameArtist') {
    const artist = seed.illustrator.trim().toLowerCase();
    if (!artist) return [];
    const cards = catalog.listAll().filter((c) => c.illustrator.trim().toLowerCase() === artist);
    return place(cells, varietyRank(filterAndDedupe(cards, page)).slice(0, cells.length));
  }

  if (method === 'samePokemon') {
    const species = speciesOf(seed);
    if (!species) return [];
    const cards = catalog.listAll().filter((c) => c.name.toLowerCase().includes(species));
    return place(cells, varietyRank(filterAndDedupe(cards, page)).slice(0, cells.length));
  }

  if (method === 'pokemonFriends') {
    // The seed's canonical companions: curated duos/groups + species proven to share card art
    // with it (multi-Pokémon names — a "Gengar & Mimikyu" print shows both). One bucket per
    // partner species (curated partners lead), pockets shared across them.
    const species = speciesOf(seed);
    if (!species) return [];
    const partners = partnersFor(species, catalog);
    if (partners.length === 0) return [];
    const deduped = filterAndDedupe(
      catalog.listAll().filter((c) => partners.some((p) => hasToken(c.name, p))),
      page,
    );
    const buckets = partners.map((p) => varietyRank(deduped.filter((c) => hasToken(c.name, p))));
    // A tag-team print matches two partners — drop repeats introduced by the per-partner split.
    const seen = new Set<string>();
    const unique = allocateAcross(buckets, cells.length * 2).filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    return place(cells, unique.slice(0, cells.length));
  }

  if (method === 'trainerPage') {
    // The trainer's world on one page: signature partner(s) first, their other trainer-named
    // cards (supporters, owned prints), and the rest of the canonical team — pockets shared
    // across the three groups so no single one dominates.
    const trainer = trainerFor(seed.name);
    if (!trainer) return [];
    const tokens = trainer.tokens ?? [trainer.name.toLowerCase()];
    const isTrainerCard = (c: CatalogCard) => {
      const n = c.name.toLowerCase();
      return tokens.some((t) => n === t || hasToken(n, t));
    };
    const sigOf = (c: CatalogCard) => trainer.signature.find((s) => hasToken(c.name, s));
    const teamOf = (c: CatalogCard) => trainer.pokemon.find((s) => hasToken(c.name, s));

    const signature: CatalogCard[] = [];
    const trainerCards: CatalogCard[] = [];
    const team: CatalogCard[] = [];
    for (const c of filterAndDedupe(catalog.listAll(), page)) {
      // Owned prints like "Cynthia's Garchomp" count as signature/team — the Pokémon is the art.
      if (sigOf(c)) signature.push(c);
      else if (isTrainerCard(c)) trainerCards.push(c);
      else if (teamOf(c)) team.push(c);
    }
    const ordered = allocateAcross(
      [
        interleaveBy(varietyRank(signature), (c) => sigOf(c) ?? ''),
        varietyRank(trainerCards),
        interleaveBy(varietyRank(team), (c) => teamOf(c) ?? ''),
      ],
      cells.length,
    );
    return place(cells, ordered);
  }

  // evolutionLine — family members ordered Basic → final; column-major cells make the page
  // read left → right through the stages. Within a stage, variety-ranked.
  const family = seed.evolutionLine;
  if (family.length < 2) return [];
  const members = catalog
    .listAll()
    .filter((c) => family.some((s) => c.name.toLowerCase().includes(s)));
  const deduped = filterAndDedupe(members, page);
  const stageOf = (c: CatalogCard) => {
    // Prefer the card's own stage index; fall back to its species' position in the family.
    if (c.evolutionStage > 0) return c.evolutionStage;
    const n = c.name.toLowerCase();
    const idx = family.findIndex((s) => n.includes(s));
    return idx >= 0 ? idx + 1 : 99;
  };
  const byStage = new Map<number, CatalogCard[]>();
  for (const c of deduped) {
    const s = stageOf(c);
    const list = byStage.get(s) ?? [];
    list.push(c);
    byStage.set(s, list);
  }
  const stages = [...byStage.keys()].sort((a, b) => a - b);

  // Share the pockets across the stages present (earlier stages absorb the remainder) —
  // otherwise a popular basic (Eevee has 100+ prints) fills every cell and the evolutions
  // never appear. Within a stage, interleave by species (Vaporeon/Jolteon/… all get a look),
  // then variety-rank across eras. Any shortfall backfills from the leftover pool.
  const speciesOfMember = (c: CatalogCard) => {
    const n = c.name.toLowerCase();
    return family.find((s) => n.includes(s)) ?? '';
  };
  const ordered = allocateAcross(
    stages.map((s) => interleaveBy(varietyRank(byStage.get(s)!), speciesOfMember)),
    cells.length,
  );
  return place(cells, ordered);
}
