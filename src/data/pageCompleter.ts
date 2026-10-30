/**
 * COMPLETE PAGE (owner, 2026-10-22): "clicked on an empty cell of the page and clicked a button
 * 'complete page'. It would show the output of completing the page, taking all the other already
 * existing slotted cards on the page into account, and doing a similarity fill, color palette
 * fill, theme fill, or other fill."
 *
 * Fill page (pageComposer) takes ONE seed card and fills around it. This takes the WHOLE PAGE as
 * the seed: every card already placed says what the empty pockets should hold. Placed cards never
 * move (the arranger is a separate tap, by the owner's decision), and only the empty pockets are
 * filled, in reading order.
 *
 * Fills:
 *   similar   the cards most like the page as a whole: the server averages the page's art vectors
 *             (find_similar_to_cards) and returns the nearest. PRO, like Find Similar.
 *   palette   the page's own palette, every placed card's colours weighted by coverage, against
 *             the on-device colour index. Free.
 *   type      more of the page's dominant energy type, newest first, one card per species.
 *   artist    more by the illustrator who drew most of the page.
 *   lines     the stages the page's evolution lines are missing, each from the set the line is
 *             already in when that set has it.
 *   theme     the scene words two or more of the page's cards share, into the data server's
 *             theme_fill (migration 85): cards sharing at least two of them. Ids only come back.
 *
 * Nothing already on the page is placed again, not even as another print of the same card, and
 * no species appears twice among the new cards.
 */
import type { CatalogCard } from 'tcgscan-browse';

import { artClassOf } from './arrange.ts';
import { occupiedCells, type DemoPage } from './binderTypes.ts';
import { rarityBoost } from './storyBinder.ts';

/**
 * PURE, like pageComposer's rules but without its imports: the kit's bundle does not load under
 * Node's test runner, so the two fills that need it (the server's similarity, the device's colour
 * index) arrive as providers the sheet passes in. The catalogue too is only what is read here.
 */
export interface CompleteCatalog {
  getCard(id: string): CatalogCard | undefined;
  listAll(): CatalogCard[];
}

/** One dominant colour as the colour index holds it. */
export interface PaletteColor {
  L: number;
  a: number;
  b: number;
  w: number;
}

export interface CompleteProviders {
  /** Find Similar for several seeds at once: the server averages their art vectors. */
  similar?: (ids: string[], limit: number) => Promise<{ id: string }[]>;
  /** theme_fill: the cards sharing the scene words the page's cards share; `fullArt` keeps a full-art page full art. */
  theme?: (ids: string[], limit: number, fullArt: boolean | undefined) => Promise<{ id: string }[]>;
  /** The on-device colour index, when loaded. */
  palette?: {
    has(id: string): boolean;
    colors(id: string, region: 'art'): PaletteColor[];
    searchByColors(query: PaletteColor[], region: 'art', topN: number): { id: string }[];
  };
}

/** A placement for an empty pocket, the shape the store's placeCards takes. */
export interface CompletePlacement {
  row: number;
  col: number;
  cardId: string;
}

const NAME_DECORATIONS = new Set(['ex', 'gx', 'v', 'vmax', 'vstar', 'v-union', 'break', 'prime', 'radiant', 'shining', 'dark', 'light', 'delta', 'star', 'lv.x', 'mega', 'm', 'x', 'y']);

/** The species a card is of: its line's member named in it, else the name without its decorations (pageComposer's rule). */
export function speciesOf(card: CatalogCard): string {
  const n = card.name.toLowerCase();
  if (card.evolutionLine.length > 0) {
    const hit = [...card.evolutionLine].sort((a, b) => b.length - a.length).find((s) => n.includes(s));
    if (hit) return hit;
  }
  return n.split(/\s+/).filter((t) => !NAME_DECORATIONS.has(t) && !/['’]s$/.test(t)).join(' ').trim();
}

export type CompleteMethod = 'theme' | 'similar' | 'palette' | 'type' | 'artist' | 'lines';

export const COMPLETE_METHODS: { key: CompleteMethod; label: string; description: string; paid?: 'similarity' }[] = [
  { key: 'theme', label: 'Same theme', description: 'Cards that share the scene this page already shows.' },
  { key: 'similar', label: '≈ Like the whole page', description: 'The cards that most look like what is here, taken together.', paid: 'similarity' },
  { key: 'palette', label: 'Same palette', description: 'Cards in the colours this page already has.' },
  { key: 'type', label: 'Same type', description: 'More of the type most of this page is.' },
  { key: 'artist', label: 'Same artist', description: 'More by the illustrator who drew most of this page.' },
  { key: 'lines', label: 'Finish the lines', description: 'The evolution stages this page is missing.' },
];

/** The page's cards as catalog records, in reading order. */
export function cardsOnPage(page: DemoPage, catalog: CompleteCatalog): CatalogCard[] {
  return [...page.slots]
    .filter((s) => s.cardId)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((s) => catalog.getCard(s.cardId!))
    .filter((c): c is CatalogCard => !!c);
}

/** Empty pockets in reading order. */
export function emptyPockets(page: DemoPage): { row: number; col: number }[] {
  const taken = occupiedCells(page);
  const out: { row: number; col: number }[] = [];
  for (let r = 0; r < page.rows; r += 1) for (let c = 0; c < page.cols; c += 1) if (!taken.has(`${r},${c}`)) out.push({ row: r, col: c });
  return out;
}

const mode = (xs: string[]): string | null => {
  const n = new Map<string, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  let best: string | null = null;
  for (const [k, v] of n) if (best === null || v > n.get(best)!) best = k;
  return best;
};

/** Which fills this page can take: at least one card to read and one pocket to fill. */
export function completeMethodsFor(page: DemoPage, catalog: CompleteCatalog): CompleteMethod[] {
  const cards = cardsOnPage(page, catalog);
  if (!cards.length || !emptyPockets(page).length) return [];
  const out: CompleteMethod[] = ['theme', 'similar'];
  if (cards.some((c) => c.id)) out.push('palette');
  if (mode(cards.map((c) => c.types[0] ?? ''))) out.push('type');
  if (mode(cards.map((c) => c.illustrator.trim()))) out.push('artist');
  if (missingStages(cards).length) out.push('lines');
  return out;
}

/** The (line, species) stages a page's lines are missing, with the set the line is in here. */
export function missingStages(cards: readonly CatalogCard[]): { species: string; setId: string }[] {
  const out: { species: string; setId: string }[] = [];
  const seenLine = new Set<string>();
  for (const c of cards) {
    const line = c.evolutionLine;
    if (line.length < 2) continue;
    const key = line.join('>');
    if (seenLine.has(key)) continue;
    seenLine.add(key);
    const present = new Set(cards.filter((x) => x.evolutionLine.join('>') === key).map((x) => speciesOf(x)));
    for (const species of line) if (!present.has(species)) out.push({ species, setId: c.setId });
  }
  return out;
}

const printKey = (c: CatalogCard): string => `${c.name.toLowerCase()}|${c.setId}`;
/** A stable spread across the catalogue: order by a hash of the id, so a fill is not one set's run. */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Candidates minus what the page has, one per species, standard footprints only. */
function dedupe(candidates: readonly CatalogCard[], page: DemoPage, catalog: CompleteCatalog): CatalogCard[] {
  const onPage = cardsOnPage(page, catalog);
  const ids = new Set(onPage.map((c) => c.id));
  const prints = new Set(onPage.map(printKey));
  const species = new Set(onPage.map((c) => speciesOf(c) || c.name.toLowerCase()));
  const out: CatalogCard[] = [];
  for (const c of candidates) {
    if (c.kind !== 'standard' || ids.has(c.id) || prints.has(printKey(c))) continue;
    const sp = speciesOf(c) || c.name.toLowerCase();
    if (species.has(sp)) continue;
    species.add(sp);
    out.push(c);
  }
  return out;
}

const place = (cells: readonly { row: number; col: number }[], cards: readonly CatalogCard[]): CompletePlacement[] =>
  cards.slice(0, cells.length).map((c, i) => ({ row: cells[i].row, col: cells[i].col, cardId: c.id }));

/**
 * THE PICTURE PRINTS FIRST (owner, 2026-10-30: "it would be better if complete filled in
 * illustration rares first"). TWO BANDS, not a ladder: the picture printings (Illustration Rare,
 * Special Illustration Rare, full arts, rarityBoost's upper bands) and then the plain prints. A
 * STABLE sort, so inside each band the method's own order holds: a theme fill's best scene match
 * still leads, an artist fill still runs newest first. A ladder (SIR over IR) was tried first and
 * put a weakly matching Special Illustration Rare ahead of the lava-scene Illustration Rares a
 * volcano page wanted. Exported so the test can pin the order.
 */
export const PICTURE_BAND = 0.45;
export function artFirst(cards: readonly CatalogCard[]): CatalogCard[] {
  const picture = (c: CatalogCard) => (rarityBoost(c.rarity ?? '') >= PICTURE_BAND ? 0 : 1);
  return [...cards].sort((a, b) => picture(a) - picture(b));
}

/** Fill the page's empty pockets by `method`. Returns nothing when the method has nothing to say. */
export async function completePage(
  method: CompleteMethod,
  page: DemoPage,
  catalog: CompleteCatalog,
  providers: CompleteProviders = {},
): Promise<CompletePlacement[]> {
  const cards = cardsOnPage(page, catalog);
  const cells = emptyPockets(page);
  if (!cards.length || !cells.length) return [];
  const want = cells.length;
  // The page's art class decides which prints are offered first: a windowed page gets windowed
  // cards, a full-art page full arts, so the page stays one class (docs/ARRANGE.md scope).
  // A GUEST'S CARDS CARRY NO ART FLAGS: the anonymous cards view exposes rarity but not full_art
  // or full_art_kind, so a cold-loaded Illustration Rare read as windowed, the theme fill was asked
  // for windowed prints, and a page of full arts filled with plain ones (owner, 2026-10-30: "same
  // theme is using windowed cards"). When the flags are absent the rarity decides: the picture
  // rarities (rarityBoost's top bands) are full art.
  const isFull = (c: CatalogCard) =>
    artClassOf(c.fullArtKind, c.fullArt) === 'full' || (!c.fullArtKind && c.fullArt == null && rarityBoost(c.rarity ?? '') >= PICTURE_BAND);
  const full = cards.filter(isFull).length * 2 > cards.length;
  const sameClass = (xs: CatalogCard[]) => [...xs.filter((c) => isFull(c) === full), ...xs.filter((c) => isFull(c) !== full)];

  if (method === 'theme') {
    if (!providers.theme) return [];
    // A page that is all one class asks for that class; a mixed page lets the server decide.
    const allFull = cards.every(isFull);
    const allWindowed = cards.every((c) => !isFull(c));
    const hits = await providers.theme(cards.map((c) => c.id), want * 6 + 24, allFull ? true : allWindowed ? false : undefined);
    const found = hits.map((h) => catalog.getCard(h.id)).filter((c): c is CatalogCard => !!c);
    return place(cells, artFirst(dedupe(found, page, catalog)));
  }
  if (method === 'similar') {
    if (!providers.similar) return [];
    const hits = await providers.similar(cards.map((c) => c.id), want * 6 + 24);
    const found = hits.map((h) => catalog.getCard(h.id)).filter((c): c is CatalogCard => !!c);
    return place(cells, artFirst(dedupe(found, page, catalog)));
  }
  if (method === 'palette') {
    const index = providers.palette;
    if (!index) return [];
    // Every placed card's colours, weights as they are: a colour the page repeats weighs more.
    const query: PaletteColor[] = cards.flatMap((c) => (index.has(c.id) ? index.colors(c.id, 'art') : []));
    if (!query.length) return [];
    const hits = index.searchByColors(query, 'art', want * 8 + 40);
    const found = hits.map((h) => catalog.getCard(h.id)).filter((c): c is CatalogCard => !!c);
    return place(cells, artFirst(dedupe(sameClass(found), page, catalog)));
  }
  if (method === 'type') {
    const t = mode(cards.map((c) => c.types[0] ?? ''));
    if (!t) return [];
    const found = catalog.listAll().filter((c) => c.types[0] === t).sort((a, b) => hash(a.id) - hash(b.id));
    return place(cells, artFirst(dedupe(sameClass(found), page, catalog)));
  }
  if (method === 'artist') {
    const who = mode(cards.map((c) => c.illustrator.trim()));
    if (!who) return [];
    const found = catalog.listAll().filter((c) => c.illustrator.trim() === who).sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
    return place(cells, artFirst(dedupe(sameClass(found), page, catalog)));
  }
  // lines: each missing stage, from the line's own set when it has one, else the newest print.
  const all = catalog.listAll();
  const picks: CatalogCard[] = [];
  for (const m of missingStages(cards)) {
    const prints = all.filter((c) => c.kind === 'standard' && speciesOf(c) === m.species);
    if (!prints.length) continue;
    const sameSet = prints.find((c) => c.setId === m.setId);
    // No print in the line's own set: the best picture print of the species, newest among equals.
    picks.push(sameSet ?? artFirst([...prints].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || '')))[0]);
  }
  return place(cells, dedupe(picks, page, catalog));
}
