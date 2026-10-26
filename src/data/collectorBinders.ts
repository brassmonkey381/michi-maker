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
import pokedex from './pokedex.json' with { type: 'json' };

export type CollectorKind = 'complete' | 'master' | 'species' | 'line' | 'dex';

export const COLLECTOR_KINDS: readonly { id: CollectorKind; label: string; blurb: string; needs: 'set' | 'pokemon' | 'none' }[] = [
  { id: 'complete', label: 'Complete set', blurb: 'Every numbered card in a set, in order, secret rares at the end.', needs: 'set' },
  { id: 'master', label: 'Master set', blurb: 'The complete set, then a reverse holo pocket for every card printed that way.', needs: 'set' },
  { id: 'species', label: 'One Pokémon', blurb: 'Every card of one Pokémon, oldest print first.', needs: 'pokemon' },
  { id: 'line', label: 'Evolution line', blurb: 'Every card of a Pokémon and the Pokémon it evolves from and into.', needs: 'pokemon' },
  { id: 'dex', label: 'Living Pokédex', blurb: 'One card for each of the 1025 Pokémon, in National Pokédex order.', needs: 'none' },
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
}

/** One pocket of the result: the card, and the finish the pocket shows when it is not Normal. */
export interface CollectorPocket {
  cardId: string;
  finish?: 'Reverse Holofoil';
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

/** Standard-footprint cards only: a jumbo or a V-UNION piece has no pocket in a 3x3 binder. */
const standard = (c: CollectorCard) => !c.kind || c.kind === 'standard';

/** The complete set: every card in the set in collector-number order. */
export function completeSet(setCards: readonly CollectorCard[]): CollectorResult {
  const pockets = setCards.filter(standard).slice().sort(byNumber).map((c) => ({ cardId: c.id }));
  return { pockets, missing: [] };
}

/**
 * The master set: the complete run, then a reverse holo pocket for every card `hasReverse` says
 * was printed that way (the price summary knows: a card with a 'Reverse Holofoil' variant).
 */
export function masterSet(setCards: readonly CollectorCard[], hasReverse: (cardId: string) => boolean): CollectorResult {
  const run = setCards.filter(standard).slice().sort(byNumber);
  const pockets: CollectorPocket[] = run.map((c) => ({ cardId: c.id }));
  for (const c of run) if (hasReverse(c.id)) pockets.push({ cardId: c.id, finish: 'Reverse Holofoil' });
  return { pockets, missing: [] };
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
 * The evolution line: every card of each species in the family, family order (Pichu, Pikachu,
 * Raichu), each species oldest print first. The family comes from any card of the species that
 * knows its line; a species no card places in a line is a line of one.
 */
export function evolutionLineSet(cards: Iterable<CollectorCard>, species: string): CollectorResult {
  const all = Array.from(cards);
  const want = speciesKey(species);
  let line: string[] = [];
  for (const c of all) {
    if (speciesKey(speciesOf(c.name)) === want && c.evolutionLine.length > line.length) line = c.evolutionLine;
  }
  const family = line.length ? line : [species];
  const pockets: CollectorPocket[] = [];
  for (const member of family) pockets.push(...speciesSet(all, member).pockets);
  return { pockets, missing: [] };
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
