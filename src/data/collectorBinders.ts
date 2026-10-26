/**
 * COLLECTOR BINDERS (owner, 2026-10-26): the binders serious collectors keep, built from the
 * catalogue by rule rather than by hand. A complete set in number order; a master set, which adds
 * a reverse-holo pocket for every card that was printed that way; every card of one Pokémon; an
 * evolution line; and the living Pokédex, one card per species from 1 to 1025.
 *
 * Pure: these functions take the catalogue (and, for master sets, a "was it printed reverse holo"
 * answer) and return ordered card ids plus the pocket finish to show. The page turns those into a
 * free placeholder print or a binder (pagesForCards).
 *
 * Research notes behind the shapes (2026-10-26): collectors keep the numbered run first and the
 * reverse holos after it ("regular set, then reverse holo set"); secret rares sit at the end of
 * the numbered run because their numbers run past the printed total; promos are a grand master
 * set and are left out here.
 */
import { ART_TEMPLATES, type ArtTemplate, reservedCells, templateArtSlots } from './artTemplates.ts';
import type { DemoPage, DemoSlot } from './binderTypes.ts';
import pokedex from './pokedex.json' with { type: 'json' };
import { seededRandom } from './seededRandom.ts';

export type CollectorKind = 'complete' | 'master' | 'species' | 'line' | 'dex';

export const COLLECTOR_KINDS: readonly { id: CollectorKind; label: string; blurb: string; needs: 'set' | 'pokemon' | 'none' }[] = [
  { id: 'complete', label: 'Complete set', blurb: 'Every card in a set, in number order.', needs: 'set' },
  { id: 'master', label: 'Master set', blurb: 'The complete set plus every reverse holo.', needs: 'set' },
  { id: 'species', label: 'One Pokémon', blurb: 'Every card of one Pokémon, oldest first.', needs: 'pokemon' },
  { id: 'line', label: 'Evolution line', blurb: 'Every card of a Pokémon and its family.', needs: 'pokemon' },
  { id: 'dex', label: 'Living Pokédex', blurb: 'One card for each of the 1025 Pokémon.', needs: 'none' },
];

/** What the builders need from a card: a slice of the kit's CatalogCard. */
export interface CollectorCard {
  id: string;
  name: string;
  number: string;
  setId: string;
  releaseDate: string;
  rarity: string;
  evolutionLine: string[];
  kind?: string;
  /** Printing language; absent means English. */
  language?: 'en' | 'ja';
  illustrator?: string;
  /** The species this card evolves from, as the card prints it ("Charmeleon"). */
  evolvesFrom?: string;
}

/**
 * How a species or line result is ordered. Sets and the dex keep their own order. A key and a
 * direction: tapping the active chip flips the direction (owner, 2026-10-26).
 */
export type CollectorSortKey = 'release' | 'rarity' | 'value' | 'artist' | 'name';
export type SortDir = 'asc' | 'desc';
export interface CollectorSort {
  key: CollectorSortKey;
  dir: SortDir;
}

export const COLLECTOR_SORT_KEYS: readonly { id: CollectorSortKey; label: string; blurb: string }[] = [
  { id: 'release', label: 'Release', blurb: 'By release date.' },
  { id: 'rarity', label: 'Rarity', blurb: 'By rarity.' },
  { id: 'value', label: 'Value', blurb: 'By market value.' },
  { id: 'artist', label: 'Artist', blurb: 'By illustrator, A to Z.' },
  { id: 'name', label: 'Name', blurb: 'By card name, A to Z.' },
];

/** The direction a key reads best in first: newest, rarest and priciest first; names A to Z. */
export const DEFAULT_DIR: Record<CollectorSortKey, SortDir> = { release: 'desc', rarity: 'desc', value: 'desc', artist: 'asc', name: 'asc' };

/**
 * Rarity names from the catalogue, plainest to rarest. A name not listed sorts with the plain
 * rares. Secret-tier names (Hyper, Rainbow, Special Illustration) lead the rarest end.
 */
export const RARITY_RANK: readonly string[] = [
  'None', 'Unconfirmed', 'Common', 'Uncommon', 'Promo', 'Classic Collection', 'Rare', 'Holo Rare', 'Rare Ace', 'Rare BREAK',
  'Prism Rare', 'Radiant Rare', 'Amazing Rare', 'Double Rare', 'Shiny Rare', 'Shiny Holo Rare', 'ACE SPEC Rare', 'Ultra Rare',
  'Shiny Ultra Rare', 'Illustration Rare', 'Mega Attack Rare', 'Black White Rare', 'Futuristic Rare', 'Secret Rare',
  'Special Illustration Rare', 'Rainbow Rare', 'Hyper Rare', 'Mega Hyper Rare',
];
const RARITY_INDEX: ReadonlyMap<string, number> = new Map(RARITY_RANK.map((r, i) => [r.toLowerCase(), i]));

/** Position on the rarity ladder; unknown names sit with the plain rares. */
export function rarityRank(rarity: string): number {
  return RARITY_INDEX.get((rarity || '').toLowerCase()) ?? RARITY_INDEX.get('rare')!;
}

/** One pocket of the result: the card, and the finish the pocket shows when it is not Normal. */
export interface CollectorPocket {
  cardId: string;
  finish?: 'Reverse Holofoil';
  /** The Pokémon appears in this card's art but is not the card's subject. */
  cameo?: true;
}

/** The language bound a collector binder is built under. */
export type CollectorLanguage = 'en' | 'ja' | 'both';

/** Cards in the asked-for language; 'both' keeps every card. */
export function inLanguage<T extends { language?: 'en' | 'ja' }>(cards: readonly T[], lang: CollectorLanguage): T[] {
  if (lang === 'both') return cards.slice();
  return cards.filter((c) => (c.language ?? 'en') === lang);
}

/** "200/165" is a secret rare: a number past the set's printed total. "TG05/TG30" is not. */
export function isSecretRare(number: string): boolean {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(number);
  return !!m && Number(m[1]) > Number(m[2]);
}

export interface SetOptions {
  /** Keep the cards numbered past the printed total. Default true. */
  secrets?: boolean;
  /** Master sets: the reverse holos after the run, or each beside its card. Default 'after'. */
  reverse?: 'after' | 'beside';
}

export interface CollectorResult {
  pockets: CollectorPocket[];
  /** For the dex: species with no card in the catalogue, by dex number. */
  missing: number[];
}

/** The National Pokédex, index 0 = #001. */
export const POKEDEX: readonly string[] = pokedex as string[];

/** "mr-mime", "Mr. Mime" and "MR MIME" are one species. */
export function speciesKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9♀♂]/g, '');
}

const DEX_BY_KEY: ReadonlyMap<string, number> = new Map(POKEDEX.map((n, i) => [speciesKey(n), i + 1]));

/** The dex number of a species name, or 0. */
export function dexNumber(species: string): number {
  return DEX_BY_KEY.get(speciesKey(species)) ?? 0;
}

// What a card name wears around the species: regional and form prefixes, owner prefixes
// ("Team Rocket's", "Misty's"), and the mechanic suffixes. Stripped before the species lookup.
const PREFIXES = /^(?:(?:alolan|galarian|hisuian|paldean|mega|m|dark|light|shining|radiant|shadow|crystal|origin forme|origin form|altered forme|single strike|rapid strike|fusion strike|ancient|future|terastal|tera|detective|surfing|flying|birthday|erika's|misty's|brock's|lt\. surge's|sabrina's|koga's|blaine's|giovanni's|rocket's|team rocket's|team magma's|team aqua's|team plasma's|team galactic's|n's|iono's|lillie's|hop's|marnie's|ethan's|lance's|cynthia's|steven's|arven's|lady's|[a-z]+'s)\s+)+/i;
const SUFFIXES = /(?:\s*(?:-?gx|-?ex|v-union|vmax|vstar|v|lv\.?\s*x|break|prism star|◇|★|δ|star|legend|[a-z]+ forme?|\(.*?\)))+$/i;

/**
 * The species a card is a card OF: "Mega Charizard X ex" is Charizard, "Pikachu & Zekrom-GX" is
 * Pikachu, "Galarian Mr. Mime" is Mr. Mime. Returns '' for trainers, energies and anything the
 * dex does not know, which is what keeps a "Pikachu" species binder free of Lt. Surge.
 */
export function speciesOf(cardName: string): string {
  let n = cardName.split(/\s*&\s*/)[0].trim();
  n = n.replace(PREFIXES, '');
  // Peel suffixes until the name stops changing: "Charizard VMAX" → "Charizard"; "Pikachu V" → "Pikachu".
  for (let i = 0; i < 4; i += 1) {
    const next = n.replace(SUFFIXES, '').trim();
    if (next === n) break;
    n = next;
  }
  // "Charizard X" (a Mega form) and "Zygarde 10%": drop a trailing form token once.
  const candidates = [n, n.replace(/\s+(?:x|y|z|\d+%|complete|10% forme|50% forme)$/i, '').trim()];
  for (const c of candidates) {
    const k = speciesKey(c);
    if (DEX_BY_KEY.has(k)) return POKEDEX[DEX_BY_KEY.get(k)! - 1];
  }
  // Last resort: the longest species name the card name starts with ("Pikachu on the Ball").
  const k = speciesKey(n);
  let best = '';
  for (const [key, dex] of DEX_BY_KEY) {
    if (k.startsWith(key) && key.length > speciesKey(best).length) best = POKEDEX[dex - 1];
  }
  // A one-letter or two-letter "species" ("Mew" is fine, "Mu" would be a prefix accident): need
  // the match to be the whole first word's worth.
  return best && speciesKey(best).length >= 3 ? best : '';
}

/** Collector number as a sortable value: "065/102" → 65, "TG12/TG30" → 1000012, "" → last. */
export function numberKey(number: string): number {
  const head = number.split('/')[0].trim();
  const m = /^([A-Za-z]*)\s*(\d+)/.exec(head);
  if (!m) return Number.MAX_SAFE_INTEGER;
  // A lettered run (TG, GG, SV, RC, H) sorts after the plain run, as it does in the binder.
  return (m[1] ? 1_000_000 : 0) + Number(m[2]);
}

const byNumber = (a: CollectorCard, b: CollectorCard) => numberKey(a.number) - numberKey(b.number) || a.name.localeCompare(b.name);
const byRelease = (a: CollectorCard, b: CollectorCard) =>
  (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999') || a.setId.localeCompare(b.setId) || byNumber(a, b);

/**
 * Re-order a result's pockets by the chosen sort. `cardOf` finds the card behind a pocket; a
 * pocket whose card is unknown keeps its place at the end. Finishes and cameo marks ride along.
 * Ties break on release, oldest first, then set and number, so the order is total and stable.
 * `valueOf` is the card's headline market value (the price summary's `cur`); unpriced cards
 * count as 0.
 */
export function sortPockets(
  result: CollectorResult,
  cardOf: (id: string) => CollectorCard | undefined,
  sort: CollectorSort,
  valueOf: (id: string) => number = () => 0,
): CollectorResult {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const key = (p: CollectorPocket, c: CollectorCard): number | string => {
    switch (sort.key) {
      case 'release': return c.releaseDate || '9999';
      case 'rarity': return rarityRank(c.rarity);
      case 'value': return valueOf(p.cardId);
      case 'artist': return (c.illustrator || '\uffff').toLowerCase();
      default: return c.name.toLowerCase();
    }
  };
  const known = result.pockets.filter((p) => cardOf(p.cardId));
  const unknown = result.pockets.filter((p) => !cardOf(p.cardId));
  known.sort((a, b) => {
    const ca = cardOf(a.cardId)!;
    const cb = cardOf(b.cardId)!;
    const ka = key(a, ca);
    const kb = key(b, cb);
    const d = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb));
    return sign * d || byRelease(ca, cb);
  });
  return { ...result, pockets: [...known, ...unknown] };
}

/** How many pockets each species takes in a result, in first-seen order ("62 Charmander"). */
export function speciesCounts(result: CollectorResult, cardOf: (id: string) => CollectorCard | undefined): { species: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of result.pockets) {
    const c = cardOf(p.cardId);
    const sp = c ? speciesOf(c.name) || 'Other' : 'Other';
    counts.set(sp, (counts.get(sp) ?? 0) + 1);
  }
  return [...counts.entries()].map(([species, count]) => ({ species, count }));
}

/** Standard-footprint cards only: a jumbo or a V-UNION piece has no pocket in a 3x3 binder. */
const standard = (c: CollectorCard) => !c.kind || c.kind === 'standard';

/** The complete set: every card in the set in collector-number order. */
export function completeSet(setCards: readonly CollectorCard[], opts: SetOptions = {}): CollectorResult {
  const pockets = setRun(setCards, opts).map((c) => ({ cardId: c.id }));
  return { pockets, missing: [] };
}

const setRun = (setCards: readonly CollectorCard[], opts: SetOptions) =>
  setCards.filter(standard).filter((c) => opts.secrets !== false || !isSecretRare(c.number)).slice().sort(byNumber);

/**
 * The master set: the complete run, then a reverse holo pocket for every card `hasReverse` says
 * was printed that way (the price summary knows: a card with a 'Reverse Holofoil' variant).
 */
export function masterSet(setCards: readonly CollectorCard[], hasReverse: (cardId: string) => boolean, opts: SetOptions = {}): CollectorResult {
  const run = setRun(setCards, opts);
  const pockets: CollectorPocket[] = [];
  if (opts.reverse === 'beside') {
    for (const c of run) {
      pockets.push({ cardId: c.id });
      if (hasReverse(c.id)) pockets.push({ cardId: c.id, finish: 'Reverse Holofoil' });
    }
    return { pockets, missing: [] };
  }
  for (const c of run) pockets.push({ cardId: c.id });
  for (const c of run) if (hasReverse(c.id)) pockets.push({ cardId: c.id, finish: 'Reverse Holofoil' });
  return { pockets, missing: [] };
}

/**
 * Cameo cards after a species or line result: cards whose art shows the Pokémon without being a
 * card of it. The ids come from the data server's cameo tags (the `cameo:<species>` query);
 * cards already in the result are skipped, the rest ride in release order, marked `cameo`.
 */
export function withCameos(result: CollectorResult, cameoCards: readonly CollectorCard[]): CollectorResult {
  const have = new Set(result.pockets.map((p) => p.cardId));
  const extra = cameoCards.filter((c) => standard(c) && !have.has(c.id)).sort(byRelease);
  return { ...result, pockets: [...result.pockets, ...extra.map((c) => ({ cardId: c.id, cameo: true as const }))] };
}

/** Every card of one species, oldest print first. */
export function speciesSet(cards: Iterable<CollectorCard>, species: string): CollectorResult {
  const want = speciesKey(species);
  const hits: CollectorCard[] = [];
  for (const c of cards) if (standard(c) && speciesKey(speciesOf(c.name)) === want) hits.push(c);
  hits.sort(byRelease);
  return { pockets: hits.map((c) => ({ cardId: c.id })), missing: [] };
}

/**
 * The evolution line: every card of each species in the family (Charmander, Charmeleon,
 * Charizard), kept TOGETHER BY ERA: release date first, then the family's own order inside a set,
 * then number. A Base Set page shows the three stages side by side; the next era follows. The
 * family comes from any card of the species that knows its line; a species no card places in a
 * line is a line of one. (The first version listed every Charmander before the first Charmeleon,
 * which read as "nothing was added"; owner, 2026-10-26.)
 */
export function evolutionLineSet(cards: Iterable<CollectorCard>, species: string): CollectorResult {
  const all = Array.from(cards);
  const want = speciesKey(species);
  let line: string[] = [];
  for (const c of all) {
    if (speciesKey(speciesOf(c.name)) === want && c.evolutionLine.length > line.length) line = c.evolutionLine;
  }
  const family = (line.length ? line.map(speciesKey) : familyFromEvolvesFrom(all, want));
  const stageOf = (c: CollectorCard) => family.indexOf(speciesKey(speciesOf(c.name)));
  const hits = all.filter((c) => standard(c) && stageOf(c) >= 0);
  hits.sort((a, b) =>
    (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999') || a.setId.localeCompare(b.setId) || stageOf(a) - stageOf(b) || byNumber(a, b));
  return { pockets: hits.map((c) => ({ cardId: c.id })), missing: [] };
}

/**
 * The family from the cards' own "evolves from" lines, for a catalogue that carries no
 * `evolution_line` (the gated catalogue the live app downloads has none; found 2026-10-26 when a
 * Charmander line came back as 74 Charmanders). Walk up through ancestors to the root, then down
 * through every descendant, breadth first, so Charmander reads Charmander, Charmeleon, Charizard
 * and Eevee reads Eevee then its evolutions. A species no card links is a family of one.
 */
export function familyFromEvolvesFrom(cards: readonly CollectorCard[], speciesKeyWanted: string): string[] {
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, Set<string>>();
  for (const c of cards) {
    if (!c.evolvesFrom) continue;
    const child = speciesKey(speciesOf(c.name));
    const parent = speciesKey(speciesOf(c.evolvesFrom));
    if (!child || !parent || child === parent) continue;
    parentOf.set(child, parent);
    if (!childrenOf.has(parent)) childrenOf.set(parent, new Set());
    childrenOf.get(parent)!.add(child);
  }
  let root = speciesKeyWanted;
  for (let i = 0; i < 6 && parentOf.has(root); i += 1) root = parentOf.get(root)!;
  const family: string[] = [];
  const queue = [root];
  while (queue.length) {
    const k = queue.shift()!;
    if (family.includes(k)) continue;
    family.push(k);
    for (const child of childrenOf.get(k) ?? []) queue.push(child);
  }
  return family;
}

/**
 * The living Pokédex: one card per species, #001 to #1025. `pick` chooses which print stands for
 * the species: the newest keeps the binder current, the oldest makes it a history. Species the
 * catalogue has no card for are reported, not skipped silently.
 */
export function livingDex(cards: Iterable<CollectorCard>, pick: 'newest' | 'oldest' = 'newest'): CollectorResult {
  const best = new Map<number, CollectorCard>();
  for (const c of cards) {
    if (!standard(c)) continue;
    const dex = dexNumber(speciesOf(c.name));
    if (!dex) continue;
    // A plain print over an ex / V / full art when it comes to standing for the species: the
    // plainest name is the shortest one.
    const cur = best.get(dex);
    if (!cur) {
      best.set(dex, c);
      continue;
    }
    const newer = (c.releaseDate || '') > (cur.releaseDate || '');
    const plainer = c.name.length < cur.name.length;
    const take = pick === 'newest' ? newer || ((c.releaseDate || '') === (cur.releaseDate || '') && plainer) : !newer && c.releaseDate !== cur.releaseDate ? true : plainer && c.releaseDate === cur.releaseDate;
    if (take) best.set(dex, c);
  }
  const pockets: CollectorPocket[] = [];
  const missing: number[] = [];
  for (let dex = 1; dex <= POKEDEX.length; dex += 1) {
    const c = best.get(dex);
    if (c) pockets.push({ cardId: c.id });
    else missing.push(dex);
  }
  return { pockets, missing };
}

/**
 * MICHI PAGES: the pockets laid into the single-page michi layouts, one layout drawn at random per
 * page from `src/data/artTemplates.ts` (the 3x3 compositions that keep five to seven card pockets:
 * Corner Post, Wall Text, Cornerstone, Diagonal Channel), so a built binder has art panels on every
 * page without anyone arranging it by hand. The cards keep their order, reading left to right, top
 * to bottom, around the art. The same seed draws the same layouts, so a page count shown before
 * the build is the page count built. No two neighbouring pages share a layout while a choice
 * exists; the last page takes the smallest layout that still seats what is left.
 */
export const MICHI_PAGE_TEMPLATES: readonly ArtTemplate[] = ART_TEMPLATES.filter(
  (t) => t.rows === 3 && t.cols === 3 && !t.spread && t.cardPockets >= 5 && t.cardPockets <= 7,
);

export function michiPages(pockets: readonly CollectorPocket[], mkId: () => string, seed: string | number): DemoPage[] {
  const rng = seededRandom(`collect:${seed}`);
  const pages: DemoPage[] = [];
  let i = 0;
  let lastId: string | null = null;
  while (i < pockets.length) {
    const left = pockets.length - i;
    let pool = MICHI_PAGE_TEMPLATES.filter((t) => t.id !== lastId);
    if (!pool.length) pool = MICHI_PAGE_TEMPLATES.slice();
    const fitting = pool.filter((t) => t.cardPockets >= left);
    const t = fitting.length
      ? fitting.sort((a, b) => a.cardPockets - b.cardPockets || a.id.localeCompare(b.id))[0]
      : (rng.pick(pool) ?? pool[0]);
    const reserved = reservedCells(t);
    const cells: { row: number; col: number }[] = [];
    for (let r = 0; r < t.rows; r += 1) for (let c = 0; c < t.cols; c += 1) if (!reserved.has(`${r},${c}`)) cells.push({ row: r, col: c });
    const chunk = pockets.slice(i, i + cells.length);
    const slots: DemoSlot[] = chunk.map((p, j) => ({
      id: mkId(),
      row: cells[j].row,
      col: cells[j].col,
      rowSpan: 1,
      colSpan: 1,
      type: 'card' as const,
      cardId: p.cardId,
      ...(p.finish ? { finish: p.finish } : {}),
    }));
    pages.push({ id: mkId(), rows: t.rows, cols: t.cols, slots: [...slots, ...templateArtSlots(t, mkId)] });
    i += chunk.length;
    lastId = t.id;
  }
  return pages;
}

/** Pages a result needs at `perPage` pockets (9 for a 3x3 page, 8 when one pocket is kept for art). */
export function pagesNeeded(pockets: number, perPage: number): number {
  return Math.ceil(pockets / Math.max(1, perPage));
}

/** Species names the dex knows that match a typed query, best first (prefix matches lead). */
export function searchSpecies(query: string, limit = 8): string[] {
  const q = speciesKey(query);
  if (!q) return [];
  const starts: string[] = [];
  const within: string[] = [];
  for (const name of POKEDEX) {
    const k = speciesKey(name);
    if (k.startsWith(q)) starts.push(name);
    else if (k.includes(q)) within.push(name);
    if (starts.length >= limit) break;
  }
  return [...starts, ...within].slice(0, limit);
}
