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
 *  - colorType      → cards sharing the seed's ENERGY TYPE (the free, offline "Color by type" —
 *                     a simpler cousin of colorTheme)
 *  - colorTheme     → cards whose PALETTE is closest to the seed (the Tri-Color Search —
 *                     findSimilarByColor) (Color-Themed). PAID (PRO/VIP) — the premium
 *                     composer; free users see it locked with an upsell.
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
 *
 * On top of that every card method SPREADS BY SUBJECT (`spreadBySubject`): no page places a
 * second card of a Pokemon until every other subject its method found has had one, and then it
 * cycles. Nine pockets around an Eevee are nine different eeveelutions; four partners across
 * eight pockets are two cards each. What each method treats as a subject is the interesting
 * part — the species for most, the evolution family member for evolutionLine, the partner for
 * pokemonFriends, and the name variant (Eevee / Eevee ex / Eevee V) for samePokemon, where the
 * species is the whole point of the page.
 */
import {
  cardThumbUrl,
  colorSearchAvailable,
  effectiveLanguages,
  findSimilar,
  findSimilarByColor,
  imageManifestReady,
  similarAvailable,
  type CardLanguage,
} from 'tcgscan-browse';

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
  | 'colorType'
  | 'colorTheme'
  | 'fullPageSpread';

/**
 * One filled pocket: a card, or an artwork slice (Full-Page Spread). Exactly one of
 * cardId / imageUrl is set.
 *
 * No composer emits a tonal insert any more — see the note above COMPOSE_METHODS. A pocket can
 * still HOLD one (`DemoSlot.insertColor`); the user places those by hand from the card picker,
 * and binders that already contain them keep rendering unchanged.
 */
export interface ComposePlacement {
  row: number;
  col: number;
  cardId?: string;
  imageUrl?: string;
  /** Sub-rectangle of `imageUrl` this pocket shows (fractions 0–1 of the whole image). */
  imageCrop?: { x: number; y: number; w: number; h: number };
  /** Set by the caller on pool ("from my collection") fills: the pocket consumes an owned copy. */
  fromCollection?: boolean;
}

/**
 * NO TONAL INSERTS. `colorType` and `colorTheme` used to scatter ~1 flat coloured tile per 4
 * pockets, and to fall back to more of them whenever the candidate list ran short. They are gone
 * on purpose: a solid rectangle sitting between real card art doesn't read as deliberate
 * negative space, it reads as a pocket we couldn't fill — and the fallback meant the thinner the
 * results, the more of the page was blank colour. Every composer now fills pockets with cards or
 * with a slice of a real colour sheet, and simply places fewer when it finds fewer.
 *
 * This is about what the app GENERATES. A tonal insert is still a slot type a user can place by
 * hand from the card picker's Insert tab, and existing binders keep theirs.
 */
export const COMPOSE_METHODS: {
  key: ComposeMethod;
  label: string;
  description: string;
  /** Requires a paid (PRO/VIP) subscription. Free users see the method locked with an upsell. */
  paid?: boolean;
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
    key: 'colorType',
    label: 'Color by type',
    description: 'Cards sharing this one’s energy type, sampled across eras.',
  },
  {
    key: 'colorTheme',
    label: 'Color match · tri-color',
    description: 'Ranks every card by its actual palette (tri-color search) for a page that flows edge to edge.',
    paid: true,
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
  // Color BY TYPE (free): needs only the seed's energy type — pure catalog scan, works fully
  // offline. Offered whenever the seed has a type at all (an item/trainer seed has none).
  if (seed.types[0]) out.push('colorType');
  // Color MATCH / tri-color (paid): ranks by palette (findSimilarByColor) — offered whenever a
  // color path is usable (on-device index OR the server RPC), regardless of the seed's type. The
  // paid gate itself is applied in the UI (AutoFillSheet), not here — this stays tier-agnostic.
  if (colorSearchAvailable()) out.push('colorTheme');
  // Full-page spread now sources from our OWNED procedural color sheets (themeBackgrounds), so it
  // always works — no external art, no licensing.
  out.push('fullPageSpread');
  return out;
}

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

/** The (name, set) key a print is deduped on — one printing per page, whatever its product id. */
function printKey(c: CatalogCard): string {
  return `${c.name.toLowerCase()}|${c.setId}`;
}

/**
 * Base candidate filter: standard footprint only (jumbo/V-UNION need multi-pocket handling the
 * composer doesn't attempt), a card we can actually render, not already on the page, each
 * (name, set) print at most once across the result — and, when `pool` is given ("fill from my
 * collection"), only cards the user owns.
 */
function filterAndDedupe(
  candidates: CatalogCard[],
  page: DemoPage,
  pool?: ReadonlySet<string> | null,
  /** EN/JP bound (the EFFECTIVE list — undefined = unconstrained). Drops off-language prints. */
  languages?: CardLanguage[],
  /** Resolves the ids already on the page so their PRINTS can be excluded too (see below). */
  catalog?: Catalog,
): CatalogCard[] {
  const onPage = idsOnPage(page);
  const seenPrint = new Set<string>();
  // A card already on the page claims its (name, set) print as well as its id. TCGPlayer
  // carries some printings as SEVERAL products — this Eevee promo is both 610758 and 610757 —
  // and without this the sibling id is a legal candidate that lands next to the seed looking
  // like the identical card placed twice. It is also the similarity RPC's top hit (0.955), so
  // the anchor page opened on the duplicate every time.
  if (catalog) {
    for (const id of onPage) {
      const c = catalog.getCard(id);
      if (c) seenPrint.add(printKey(c));
    }
  }
  const out: CatalogCard[] = [];
  for (const c of candidates) {
    if (c.kind !== 'standard') continue;
    if (!isRenderable(c)) continue;
    if (languages && !languages.includes(c.language)) continue;
    if (pool && !pool.has(c.id)) continue;
    if (onPage.has(c.id)) continue;
    const print = printKey(c);
    if (seenPrint.has(print)) continue;
    seenPrint.add(print);
    out.push(c);
  }
  return out;
}

/**
 * Can the app actually show this card? `cardThumbUrl` resolves through the mirror manifest and
 * returns '' for a card we have no image for, so placing one leaves a visible hole in the page.
 * Eevee (JR East Stamp Rally) is exactly that: variety ranking put it second on the Same Pokémon
 * page, directly above the seed, because it was the only 1999 promo in its bucket.
 *
 * Only enforced once the manifest has actually loaded — before that `cardThumbUrl` returns ''
 * for EVERY card, and filtering on it would empty every method's candidate list.
 */
function isRenderable(c: CatalogCard): boolean {
  if (!imageManifestReady()) return true;
  return cardThumbUrl(c.id, 640) !== '';
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

/**
 * Round-robin across ordered lists: one card from each in turn, cycling until every list is
 * drained. Nothing is dropped, so slicing the result to the pocket count is what decides how
 * many of each get in — one of everything before two of anything.
 */
function roundRobin(lists: CatalogCard[][]): CatalogCard[] {
  const total = lists.reduce((n, l) => n + l.length, 0);
  const out: CatalogCard[] = [];
  for (let i = 0; out.length < total; i += 1) {
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

/** Round-robin across buckets keyed by `keyFn` (bucket order = first appearance). */
function interleaveBy(cards: CatalogCard[], keyFn: (c: CatalogCard) => string): CatalogCard[] {
  const buckets = new Map<string, CatalogCard[]>();
  for (const c of cards) {
    const k = keyFn(c);
    const list = buckets.get(k) ?? [];
    list.push(c);
    buckets.set(k, list);
  }
  return roundRobin([...buckets.values()]);
}

/** What a card is OF, for spreading purposes: its species, or its name when it has none. */
function subjectOf(c: CatalogCard): string {
  return speciesOf(c) || c.name.toLowerCase();
}

/**
 * Subject spreading — no page places a second card of the same Pokemon until every other
 * subject in the candidate list has had one, and then it keeps cycling. Four partners across
 * eight pockets is two cards of each, not eight of the first.
 *
 * This only decides HOW MANY of each subject get in, never WHICH ONE wins: buckets keep
 * first-appearance order and their contents keep the order they arrived in, so a palette- or
 * similarity-ranked list still leads with its nearest card of each subject, and a
 * variety-ranked one still leads with its oldest era.
 *
 * `demote` pushes one subject behind all the others (its cards become pure backfill). Pass the
 * seed's own species where the seed is already on the page and repeating it wastes a pocket:
 * an Eevee's evolution page should be its eight evolutions before it is ever a second Eevee.
 */
function spreadBySubject(cards: CatalogCard[], demote?: string): CatalogCard[] {
  if (!demote) return interleaveBy(cards, subjectOf);
  const own: CatalogCard[] = [];
  const rest: CatalogCard[] = [];
  for (const c of cards) (subjectOf(c) === demote ? own : rest).push(c);
  return [...interleaveBy(rest, subjectOf), ...own];
}

/**
 * Share `total` picks across ordered buckets, then backfill any shortfall from the leftovers —
 * so one huge bucket can't starve the others.
 *
 * `weights` biases the shares (default: even). Weighting a bucket by how many DISTINCT SUBJECTS
 * it can offer is what stops a group that only has one from claiming an even share and spending
 * it on repeats: a trainer's ace is usually a single species, and an even third of the page
 * bought three prints of Garchomp while Milotic and Lucario never got a pocket.
 *
 * Every non-empty bucket still keeps at least one pick while there are pockets to go round, so
 * a lopsided weight can't silence a group outright.
 */
function allocateAcross(buckets: CatalogCard[][], total: number, weights?: number[]): CatalogCard[] {
  const idx = buckets.map((_, i) => i).filter((i) => buckets[i].length > 0);
  if (idx.length === 0) return [];
  const w = idx.map((i) => Math.max(1, weights?.[i] ?? 1));
  const sum = w.reduce((a, b) => a + b, 0);
  // Largest-remainder apportionment: floor every share, then hand the spare pockets to the
  // biggest fractional claims. With even weights that is the old "earlier buckets absorb the
  // remainder" behaviour exactly, since every remainder ties and ties go to the earlier bucket.
  const exact = w.map((x) => (total * x) / sum);
  const quota = exact.map((e) => Math.floor(e));
  let spare = total - quota.reduce((a, b) => a + b, 0);
  const byClaim = quota
    .map((_, i) => i)
    .sort((a, b) => exact[b] - quota[b] - (exact[a] - quota[a]) || a - b);
  for (let k = 0; spare > 0 && quota.length; k += 1, spare -= 1) quota[byClaim[k % quota.length]] += 1;
  if (total >= idx.length) {
    for (let i = 0; i < quota.length; i += 1) {
      if (quota[i] > 0) continue;
      let big = 0;
      for (let j = 1; j < quota.length; j += 1) if (quota[j] > quota[big]) big = j;
      if (quota[big] > 1) {
        quota[big] -= 1;
        quota[i] = 1;
      }
    }
  }
  const picked: CatalogCard[] = [];
  const leftovers: CatalogCard[] = [];
  idx.forEach((b, i) => {
    picked.push(...buckets[b].slice(0, quota[i]));
    leftovers.push(...buckets[b].slice(quota[i]));
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
  /** EN/JP bound. Passed INTO the similarity/colour RPCs as p_lang (a pre-filter cut server-side
   *  before the top-N — never a post-filter of ranked results) and applied to the local catalog
   *  scans via filterAndDedupe. The SEED stays unbound: you can seed from a JP card and fill with
   *  EN neighbours. Omit / "both" languages = unconstrained, exactly as before. */
  languages?: CardLanguage[],
): Promise<ComposePlacement[]> {
  const cells = method === 'evolutionLine' ? emptyCellsColMajor(page) : emptyCellsRowMajor(page);
  if (cells.length === 0) return [];
  // Effective bound for the LOCAL scans (undefined when unconstrained). The RPCs take the raw list
  // and normalise it themselves, so they're handed `languages` directly.
  const langs = effectiveLanguages(languages);

  if (method === 'moreLikeThis') {
    // Ask for extra hits: some resolve to jumbo/V-UNION or cards already placed and get
    // filtered. A pool run casts a much wider net — the owned subset of a global ranking is
    // sparse, so rank deep and keep whichever owned cards surface.
    const hits = await findSimilar(seed.id, pool ? 200 : cells.length * 3 + 8, { languages });
    const cards = hits
      .map((h) => catalog.getCard(h.id))
      .filter((c): c is CatalogCard => !!c);
    // Spread by subject: the ranking is visual, so a distinctive card can have its five nearest
    // neighbours all be other prints of itself. Keep the nearest of each, and only come back for
    // a second of one once every other subject has had a pocket.
    const ranked = spreadBySubject(filterAndDedupe(cards, page, pool, langs, catalog));
    return place(cells, ranked.slice(0, cells.length));
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

  if (method === 'colorType') {
    // FREE: the seed's energy colour across eras — a simple type match (no palette ranking).
    // Pure catalog scan, works offline. Every pocket gets a CARD (see the note above
    // COMPOSE_METHODS on why the tonal inserts are gone).
    const type = seed.types[0] ?? '';
    if (!type) return [];
    const cards = spreadBySubject(
      varietyRank(
        filterAndDedupe(
          catalog.listAll().filter((c) => c.types.includes(type)),
          page,
          pool,
          langs,
          catalog,
        ),
      ),
    );
    return place(cells, cards.slice(0, cells.length));
  }

  if (method === 'colorTheme') {
    // Cards whose PALETTE is closest to the seed — the Tri-Color Search (findSimilarByColor, hybrid
    // on-device/server, fails soft to []). Nearest-first, so we KEEP that order (no variety re-rank,
    // which would scramble the colour ranking). Every pocket gets a CARD (see the note above
    // COMPOSE_METHODS on why the tonal inserts are gone).
    const ids = await findSimilarByColor(seed.id, 'noborder', { limit: cells.length * 3 + 8, languages });
    const cards = filterAndDedupe(
      ids.map((id) => catalog.getCard(id)).filter((c): c is CatalogCard => !!c),
      page,
      pool,
      langs,
      catalog,
    );
    if (cards.length === 0) return [];
    // Nearest-first is kept WITHIN each subject; across subjects the page takes the closest
    // match of each before doubling up, so a colour page is a palette, not one Pokemon five times.
    return place(cells, spreadBySubject(cards).slice(0, cells.length));
  }

  if (method === 'sameArtist') {
    const artist = seed.illustrator.trim().toLowerCase();
    if (!artist) return [];
    const cards = catalog.listAll().filter((c) => c.illustrator.trim().toLowerCase() === artist);
    // An illustrator gallery should show the range of what they drew: one Pokemon each before a
    // second of any, so a prolific Pikachu artist doesn't hand back a page of Pikachu.
    const ordered = spreadBySubject(varietyRank(filterAndDedupe(cards, page, pool, langs, catalog)));
    return place(cells, ordered.slice(0, cells.length));
  }

  if (method === 'samePokemon') {
    const species = speciesOf(seed);
    if (!species) return [];
    const cards = catalog.listAll().filter((c) => c.name.toLowerCase().includes(species));
    // One species by definition, so the spreading happens a level down — across the NAME
    // VARIANTS (Eevee, Eevee GX, Eevee ex, Eevee V, Radiant Eevee), one of each before a second
    // of any. The trailing disambiguator the catalog appends to same-named prints ("Eevee (62)")
    // is stripped first, or every variant would be its own bucket and this would do nothing.
    const ordered = interleaveBy(
      varietyRank(filterAndDedupe(cards, page, pool, langs, catalog)),
      (c) => c.name.toLowerCase().replace(/\s*\([^)]*\)\s*$/, ''),
    );
    return place(cells, ordered.slice(0, cells.length));
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
      langs,
    );
    // A tag-team print matches two partners, so de-duplicate ACROSS the buckets (first bucket
    // wins), then take one card per partner in turn and keep cycling: four partners over eight
    // pockets is two apiece, and a partner only gets a second card once all four have had a
    // first. Quota-based allocation was wrong twice over here — `allocateAcross` lays its
    // buckets end to end, so Eevee's friends page came back as eight Pikachu, and even with the
    // quotas honoured a partner with a thin bucket handed its unused pockets to whoever came
    // first rather than back to the cycle.
    const seen = new Set<string>();
    const buckets = partners.map((p) =>
      varietyRank(
        deduped.filter((c) => {
          if (!hasToken(c.name, p) || seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        }),
      ),
    );
    return place(cells, roundRobin(buckets).slice(0, cells.length));
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
    for (const c of filterAndDedupe(catalog.listAll(), page, pool, langs, catalog)) {
      // Owned prints like "Cynthia's Garchomp" count as signature/team — the Pokémon is the art.
      if (sigOf(c)) signature.push(c);
      else if (isTrainerCard(c)) trainerCards.push(c);
      else if (teamOf(c)) team.push(c);
    }
    // Each group cycles its own subjects (the ace's Pokemon, the trainer's card names, the team
    // members), and the groups share the pockets in proportion to how many subjects they have to
    // show. An ace is usually one species, so it takes about one pocket per cycle instead of an
    // even third of the page spent on prints of the same Pokemon.
    const groups = [
      interleaveBy(varietyRank(signature), (c) => sigOf(c) ?? ''),
      interleaveBy(varietyRank(trainerCards), subjectOf),
      interleaveBy(varietyRank(team), (c) => teamOf(c) ?? ''),
    ];
    const subjectCounts = [
      new Set(signature.map((c) => sigOf(c) ?? '')).size,
      new Set(trainerCards.map(subjectOf)).size,
      new Set(team.map((c) => teamOf(c) ?? '')).size,
    ];
    return place(cells, allocateAcross(groups, cells.length, subjectCounts));
  }

  // evolutionLine — family members ordered Basic → final; column-major cells make the page
  // read left → right through the stages. Within a stage, variety-ranked.
  const family = seed.evolutionLine;
  if (family.length < 2) return [];
  const members = catalog
    .listAll()
    .filter((c) => family.some((s) => c.name.toLowerCase().includes(s)));
  const deduped = filterAndDedupe(members, page, pool, langs, catalog);
  const speciesOfMember = (c: CatalogCard) => {
    const n = c.name.toLowerCase();
    return family.find((s) => n.includes(s)) ?? '';
  };

  // One bucket per FAMILY MEMBER, not per stage, and then one pocket to each in turn. Stages
  // were the wrong unit: Eevee's family is one basic and eight evolutions, so splitting the
  // pockets evenly between the two stages spent half the page on repeat Eevee prints and could
  // only fit four of the eight eeveelutions — which is how that page came back with Flareon
  // twice and no Vaporeon or Sylveon. Per species, an 8-pocket page is all eight evolutions.
  //
  // Buckets follow the family's own Basic → final order, so the column-major cells read through
  // the line. That order comes from the evolution chain itself, not from each card's printed
  // stage: a Sylveon V is a Basic, and ranking species by the lowest stage any of their cards
  // carries put Sylveon at the head of the line ahead of Vaporeon.
  //
  // The seed's own species sorts last: it is already sitting on the page, so its other prints
  // are backfill for a family too small to fill the pockets (Farfetch'd, a two-card line on a
  // 3x3), never the point of the page.
  const bySpecies = new Map<string, CatalogCard[]>();
  for (const c of deduped) {
    const s = speciesOfMember(c);
    const list = bySpecies.get(s) ?? [];
    list.push(c);
    bySpecies.set(s, list);
  }
  const own = speciesOf(seed);
  const order = [...bySpecies.keys()].sort((a, b) => {
    if ((a === own) !== (b === own)) return a === own ? 1 : -1;
    return family.indexOf(a) - family.indexOf(b);
  });
  const ordered = roundRobin(order.map((s) => varietyRank(bySpecies.get(s)!)));
  return place(cells, ordered.slice(0, cells.length));
}
