/**
 * Page composer — auto-curates a binder page around a SEED card, michi-method style.
 *
 * Each method takes the seed + the loaded catalog + the current page and returns placements
 * for the page's EMPTY pockets (existing cards, the seed included, are never touched). The
 * seven documented michi methods (woahpoke.com/michi-method) all have a composer:
 *
 *  - moreLikeThis   → visually similar cards via the embedding RPC, framing the seed (Anchor)
 *  - samePokemon    → the seed's species across sets/art styles (Single Pokémon)
 *  - evolutionLine  → the seed's evolution family, reading Basic → final stage (Themed/Story)
 *  - sameArtist     → the seed illustrator's other work, spread across eras (Card Artist)
 *  - trainerPage    → a trainer's partner/team/supporter world (Trainer)
 *  - colorTheme     → cards whose PALETTE is closest to the seed (the Tri-Color Search —
 *                     findSimilarByColor), with tonal inserts for cohesion (Color-Themed)
 *  - fullPageSpread → one of our OWNED procedural "color sheets" (themeBackgrounds — 3 palettes ×
 *                     18 energy families = 54) sliced across every empty pocket; the placed cards
 *                     read as accents on the sheet (Full-Page Spread)
 *  (+ pokemonFriends — curated duos/TAG-TEAM lore, our extra beyond the canonical seven.)
 *
 * Selection is deterministic (except the moreLikeThis RPC ranking and colorTheme's palette
 * ranking): only standard 1×1 cards,
 * no card already on the page, no duplicate (name, set) print twice, and "variety ranking" —
 * candidates are round-robined across series so a page samples eras/styles instead of dumping
 * one set's run.
 */
import { colorSearchAvailable, findSimilar, findSimilarByColor, similarAvailable } from 'tcgscan-browse';

import type { Catalog, CatalogCard } from '@/lib/catalog';
import { occupiedCells, type DemoPage } from '@/data/binderTypes';
import { hasToken } from '@/data/nameMatch';
import { THEME_BACKGROUNDS, themeBackgroundDataUri } from '@/data/themeBackgrounds';
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
  | 'pokemonFriends'
  | 'colorTheme'
  | 'fullPageSpread';

/**
 * One filled pocket: a card, a tonal insert (Color-Themed), or an artwork slice
 * (Full-Page Spread). Exactly one of cardId / insertColor / imageUrl is set.
 */
export interface ComposePlacement {
  row: number;
  col: number;
  cardId?: string;
  insertColor?: string;
  imageUrl?: string;
  /** Sub-rectangle of `imageUrl` this pocket shows (fractions 0–1 of the whole image). */
  imageCrop?: { x: number; y: number; w: number; h: number };
  /** Set by the caller on pool ("from my collection") fills: the pocket consumes an owned copy. */
  fromCollection?: boolean;
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
    description: 'Pokémon this one is known to pair with: duos, TAG TEAMs, lore.',
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
  {
    key: 'colorTheme',
    label: 'Color match',
    description: 'Cards whose palette is closest to this one (tri-color search), with tonal inserts.',
  },
  {
    key: 'fullPageSpread',
    label: 'Full-page spread',
    description: 'A color sheet flows across every empty pocket. Your cards become the accents.',
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
  // Color match ranks by palette (findSimilarByColor) — offered whenever a color path is usable
  // (on-device index OR the server RPC), regardless of the seed's type.
  if (colorSearchAvailable()) out.push('colorTheme');
  // Full-page spread now sources from our OWNED procedural color sheets (themeBackgrounds), so it
  // always works — no external art, no licensing.
  out.push('fullPageSpread');
  return out;
}

/**
 * Per-energy-type tonal insert colours (light → deeper, echoing the card frame palette) — the
 * scattered negative-space tiles the Color-match method drops in for cohesion. The card FRAME is
 * coloured by its energy type, so type is a faithful colour-palette proxy for the inserts.
 */
const TYPE_STYLES: Record<string, { tones: string[] }> = {
  Grass: { tones: ['#E3EEDA', '#C4DCB0', '#9CC584'] },
  Fire: { tones: ['#FAE0D2', '#F4BCA0', '#EC9273'] },
  Water: { tones: ['#DCEAF7', '#B4D3EE', '#86B8E2'] },
  Lightning: { tones: ['#FBF2CC', '#F6E4A0', '#EFD16F'] },
  Psychic: { tones: ['#EBDFF3', '#D4BCE7', '#B994D8'] },
  Fighting: { tones: ['#F1E3D3', '#E0C5A5', '#CBA377'] },
  Darkness: { tones: ['#DCDFE4', '#AEB4BF', '#767E8C'] },
  Metal: { tones: ['#EBEDEF', '#D2D7DC', '#B3BAC3'] },
  Fairy: { tones: ['#FAE2EA', '#F4C0D3', '#EC9CBB'] },
  Dragon: { tones: ['#F0E6CC', '#E0D0A0', '#CBB373'] },
  Colorless: { tones: ['#F3F2EF', '#E3E1DB', '#CFCCC4'] },
};

/**
 * TCG energy type → themeBackgrounds family (our owned "color sheets"). The families ice / poison /
 * ground / flying / bug / rock / ghost exist as sheets too but aren't card types, so they're never
 * mapped from here; a typeless card (item/trainer) falls back to 'normal'.
 */
const TYPE_TO_FAMILY: Record<string, string> = {
  Grass: 'grass',
  Fire: 'fire',
  Water: 'water',
  Lightning: 'electric',
  Psychic: 'psychic',
  Fighting: 'fighting',
  Darkness: 'dark',
  Metal: 'steel',
  Fairy: 'fairy',
  Dragon: 'dragon',
  Colorless: 'normal',
};

/** Stable string → 32-bit hash (FNV-1a), for deterministically picking a sheet palette/arrangement
 *  from the seed card id — the same card always yields the same spread. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Decorations that appear alongside a species in card names ("Pikachu ex", "Radiant Greninja",
// "Mega Charizard Y", "Dark Alakazam"); stripped when falling back to name-based species
// extraction. 'x'/'y' are the Mega form suffixes (no species is named a bare X or Y).
const NAME_DECORATIONS = new Set([
  'ex', 'gx', 'v', 'vmax', 'vstar', 'v-union', 'break', 'prime', 'radiant', 'shining',
  'dark', 'light', 'delta', 'star', 'lv.x', 'mega', 'm', 'x', 'y',
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
 * composer doesn't attempt), a real image-worthy card, not already on the page, each
 * (name, set) print at most once across the result — and, when `pool` is given ("fill from my
 * collection"), only cards the user owns.
 */
function filterAndDedupe(
  candidates: CatalogCard[],
  page: DemoPage,
  pool?: ReadonlySet<string> | null,
): CatalogCard[] {
  const onPage = idsOnPage(page);
  const seenPrint = new Set<string>();
  const out: CatalogCard[] = [];
  for (const c of candidates) {
    if (c.kind !== 'standard') continue;
    if (pool && !pool.has(c.id)) continue;
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
  /** "Fill from my collection": when given, every card candidate must be one of these ids
   *  (the user's `user_cards`). Artwork slices and tonal inserts aren't cards — unaffected. */
  pool?: ReadonlySet<string> | null,
): Promise<ComposePlacement[]> {
  const cells = method === 'evolutionLine' ? emptyCellsColMajor(page) : emptyCellsRowMajor(page);
  if (cells.length === 0) return [];

  if (method === 'moreLikeThis') {
    // Ask for extra hits: some resolve to jumbo/V-UNION or cards already placed and get
    // filtered. A pool run casts a much wider net — the owned subset of a global ranking is
    // sparse, so rank deep and keep whichever owned cards surface.
    const hits = await findSimilar(seed.id, pool ? 200 : cells.length * 3 + 8);
    const cards = hits
      .map((h) => catalog.getCard(h.id))
      .filter((c): c is CatalogCard => !!c);
    return place(cells, filterAndDedupe(cards, page, pool).slice(0, cells.length));
  }

  if (method === 'fullPageSpread') {
    // One of our OWNED procedural "color sheets" (themeBackgrounds — 3 palettes × 18 families)
    // flows across EVERY empty pocket: each pocket shows its window of the one image (the crop
    // math), so the placed cards read as accents on the sheet. The family comes from the seed's
    // energy type; the palette + arrangement are seeded by the card id (deterministic, so a binder
    // renders identically every time). No external art, no licensing.
    const seedNum = hashStr(seed.id);
    const family = TYPE_TO_FAMILY[seed.types[0] ?? ''] ?? 'normal';
    const sheets = THEME_BACKGROUNDS.filter((t) => t.family === family);
    const sheet = (sheets.length ? sheets : THEME_BACKGROUNDS)[seedNum % (sheets.length || THEME_BACKGROUNDS.length)];
    // Render the sheet at the page's overall shape (each cell a 250×350 card pocket) so the motifs
    // scatter true-to-aspect across the whole spread.
    const imageUrl = themeBackgroundDataUri(sheet.id, {
      w: page.cols * 250,
      h: page.rows * 350,
      seed: seedNum,
    });
    return cells.map((cell) => ({
      ...cell,
      imageUrl,
      imageCrop: {
        x: cell.col / page.cols,
        y: cell.row / page.rows,
        w: 1 / page.cols,
        h: 1 / page.rows,
      },
    }));
  }

  if (method === 'colorTheme') {
    // Cards whose PALETTE is closest to the seed — the Tri-Color Search (findSimilarByColor, hybrid
    // on-device/server, fails soft to []). Nearest-first, so we KEEP that order (no variety re-rank,
    // which would scramble the colour ranking). A few pockets become tonal inserts (the seed's type
    // tones) for the michi negative-space look; a card shortfall falls back to inserts too.
    const ids = await findSimilarByColor(seed.id, 'noborder', { limit: cells.length * 3 + 8 });
    const cards = filterAndDedupe(
      ids.map((id) => catalog.getCard(id)).filter((c): c is CatalogCard => !!c),
      page,
      pool,
    );
    if (cards.length === 0) return [];
    const style = TYPE_STYLES[seed.types[0] ?? ''];
    // No type (item/trainer seed) → no tonal palette; just lay the colour-matched cards in.
    if (!style) return place(cells, cards.slice(0, cells.length));
    // Deliberate tonal inserts: ~1 per 4 pockets, scattered (never the first pocket, which
    // usually neighbours the seed).
    const insertCount = Math.min(3, Math.floor(cells.length / 4));
    const insertAt = new Set<number>();
    for (let k = 1; k <= insertCount; k += 1) {
      insertAt.add(Math.round((k * cells.length) / (insertCount + 1)));
    }
    const placements: ComposePlacement[] = [];
    let cardIdx = 0;
    let tone = 0;
    for (let i = 0; i < cells.length; i += 1) {
      if (insertAt.has(i) || cardIdx >= cards.length) {
        placements.push({ ...cells[i], insertColor: style.tones[tone % style.tones.length] });
        tone += 1;
      } else {
        placements.push({ ...cells[i], cardId: cards[cardIdx].id });
        cardIdx += 1;
      }
    }
    // All inserts and no cards would be an empty-looking page — bail to "nothing found".
    return cardIdx > 0 ? placements : [];
  }

  if (method === 'sameArtist') {
    const artist = seed.illustrator.trim().toLowerCase();
    if (!artist) return [];
    const cards = catalog.listAll().filter((c) => c.illustrator.trim().toLowerCase() === artist);
    return place(cells, varietyRank(filterAndDedupe(cards, page, pool)).slice(0, cells.length));
  }

  if (method === 'samePokemon') {
    const species = speciesOf(seed);
    if (!species) return [];
    const cards = catalog.listAll().filter((c) => c.name.toLowerCase().includes(species));
    return place(cells, varietyRank(filterAndDedupe(cards, page, pool)).slice(0, cells.length));
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
      pool,
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
    for (const c of filterAndDedupe(catalog.listAll(), page, pool)) {
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
  const deduped = filterAndDedupe(members, page, pool);
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
