/**
 * CSV collection import — parse a pasted CSV, resolve rows to catalog card ids, and land the
 * result as a REAL tcgscan portfolio (`collections` + `portfolio_entries`, owner-inserted under
 * RLS). The database trigger rolls the entries into `user_cards`, so the import shows up
 * everywhere at once: tcgscan-app sees a new portfolio, michi's My-collection updates live
 * (realtime), and the Portfolios view gains a group. Deleting the portfolio in either app
 * unwinds the whole import.
 *
 * Format support:
 *  - TCGPlayer collection exports (the "Product ID" column is the catalog id — exact match).
 *  - Any CSV with a product-id column, or name (+ set / number) columns — resolved against
 *    the catalog by name, preferring the given set/number, else the newest print.
 *  - Headerless one/two-column lists: `productId[,quantity]` per line.
 */
import type { Catalog, CatalogCard } from '@/lib/catalog';
import { uuidv4 } from '@/data/binderTypes';
import { type CsvOverrides, detectColumns, type ImportAnalysis, type ImportMatch, normCardName, normCardNumber, normProductId, sameCardNumber, sameSetName } from '@/data/csvShape';
import { requireSupabase } from '@/lib/supabase';
import { getPriceSummary, type PriceSummary } from '@/lib/prices';

// The parser, the column detection and the shape record have no dependencies and live in
// csvShape.ts so they can be unit-tested; re-exported here so callers keep one import.
export { CSV_ROLE_INFO, CSV_ROLES, csvShape, detectColumns, parseCsv, roleOfColumn } from '@/data/csvShape';
export type { CsvColumns, CsvOverrides, CsvRole, ImportAnalysis, ImportMatch, UnmatchedKind } from '@/data/csvShape';

/**
 * Resolve parsed CSV rows against the catalog. `overrides` are the column roles a person assigned
 * by tapping a column in the preview (owner, 2026-10-15); see detectColumns.
 *
 * One loop for every shape. A headerless paste is the same walk with the first line as data and
 * column 0 as the id, so a hand-assigned role behaves the same whether or not there is a header.
 */
export function analyzeCsv(rows: string[][], catalog: Catalog, overrides?: CsvOverrides): ImportAnalysis {
  const unmatched: ImportAnalysis['unmatched'] = [];
  const byId = new Map<string, ImportMatch>();
  const add = (card: CatalogCard, quantity: number, via: 'id' | 'name') => {
    const existing = byId.get(card.id);
    if (existing) existing.quantity += quantity;
    else byId.set(card.id, { cardId: card.id, quantity, name: card.name, via });
  };

  const columns = detectColumns(rows[0] ?? [], overrides);
  if (rows.length === 0) return { matches: [], unmatched: [], totalCopies: 0, columns };
  const { id: idCol, qty: qtyCol, name: nameCol, set: setCol, number: numberCol } = columns;

  // Name index built lazily: only when some row actually needs name matching.
  let nameIndex: Map<string, CatalogCard[]> | null = null;
  const namesFor = (name: string): CatalogCard[] => {
    if (!nameIndex) {
      nameIndex = new Map();
      for (const c of catalog.listAll()) {
        // Keyed by the family name: "Rayquaza V (Alternate Full Art)" files under "rayquaza v",
        // and the set and number pick the print (csvShape.ts).
        const k = normCardName(c.name);
        const list = nameIndex.get(k) ?? [];
        list.push(c);
        nameIndex.set(k, list);
      }
    }
    return nameIndex.get(name) ?? [];
  };

  // What sits at a set and number, for the hint on a row whose name is not there: built once,
  // lazily, the way the name index is.
  let placeIndex: Map<string, CatalogCard> | null = null;
  const cardAt = (setName: string, number: string): CatalogCard | undefined => {
    if (!placeIndex) {
      placeIndex = new Map();
      for (const c of catalog.listAll()) placeIndex.set(`${normCardName(c.setName)}|${normCardNumber(c.number)}`, c);
    }
    return placeIndex.get(`${normCardName(setName)}|${normCardNumber(number)}`);
  };
  const listOf = (xs: string[], max = 3) => {
    const u = [...new Set(xs)];
    return u.slice(0, max).join(', ') + (u.length > max ? ` and ${u.length - max} more` : '');
  };

  const first = columns.headerless ? 0 : 1;
  // Loose equality for a cell against the catalog: case, spacing and punctuation do not count.
  const norm = (v: string) => normCardName(v);
  // "Evolving Skies" is "SWSH07: Evolving Skies" is "SWSH07" (csvShape.ts).
  const sameSet = (c: CatalogCard, raw: string) => sameSetName(c.setName, c.setCode, raw);
  // Zero padding and the set total do not count: "058" is "58" is "58/102" (csvShape.ts).
  const sameNumber = (c: CatalogCard, raw: string) => sameCardNumber(c.number, raw);

  rows.slice(first).forEach((r, i) => {
    const line = i + first + 1;
    const quantity = qtyCol >= 0 ? Math.max(1, parseInt(r[qtyCol] ?? '1', 10) || 1) : 1;
    const rawId = idCol >= 0 ? normProductId(r[idCol] ?? '') : '';
    const rawName = nameCol >= 0 ? (r[nameCol]?.trim() ?? '') : '';
    const rawSet = setCol >= 0 ? (r[setCol]?.trim() ?? '') : '';
    const rawNumber = numberCol >= 0 ? (r[numberCol]?.trim() ?? '') : '';

    // A PRODUCT ID IS A CLAIM, NOT A HINT (owner, 2026-10-15). A made-up id with a real name
    // used to land the card by name as if the id had never been there. Now an id has to be real,
    // and whatever else the row says about the card has to agree with it; a wrong id skips the
    // row rather than quietly importing something else.
    if (rawId) {
      if (!/^\d+$/.test(rawId)) {
        unmatched.push({ line, reason: `"${rawId.slice(0, 30)}" isn't a product id`, kind: 'not_an_id' });
        return;
      }
      const card = catalog.getCard(rawId);
      if (!card) {
        unmatched.push({ line, reason: `product id ${rawId} isn't in the catalog`, kind: 'id_not_in_catalog' });
        return;
      }
      if (rawName && norm(rawName) !== norm(card.name)) {
        unmatched.push({ line, reason: `product id ${rawId} is ${card.name}, not "${rawName.slice(0, 40)}"`, kind: 'id_mismatch' });
        return;
      }
      if (rawSet && !sameSet(card, rawSet)) {
        unmatched.push({ line, reason: `product id ${rawId} is from ${card.setName}, not "${rawSet.slice(0, 40)}"`, kind: 'id_mismatch' });
        return;
      }
      if (rawNumber && !sameNumber(card, rawNumber)) {
        unmatched.push({ line, reason: `product id ${rawId} is number ${card.number}, not "${rawNumber.slice(0, 20)}"`, kind: 'id_mismatch' });
        return;
      }
      add(card, quantity, 'id');
      return;
    }

    // WITHOUT AN ID, THE NAME ALONE IS NOT ENOUGH (owner, 2026-10-15). A name has many prints;
    // picking the newest was a guess dressed as a match. Name, set and number together name one
    // card, so all three are required and all three have to agree.
    if (!rawName) {
      unmatched.push({ line, reason: 'no product id or name', kind: 'no_id_or_name' });
      return;
    }
    if (!rawSet || !rawNumber) {
      unmatched.push({ line, reason: `"${rawName.slice(0, 40)}" needs a set and a number without a product id`, kind: 'needs_set_and_number' });
      return;
    }
    const byName = namesFor(normCardName(rawName));
    if (byName.length === 0) {
      unmatched.push({ line, reason: `no card named "${rawName.slice(0, 40)}"`, kind: 'name_not_found' });
      return;
    }
    // THE SKIP SAYS WHAT IS TRUE (owner, 2026-10-15). A row can be wrong three ways from here,
    // and each message names the person's own words, then what the catalog has instead: the sets
    // this card is in, or the card that sits at that number in that set.
    const shown = rawName.slice(0, 40);
    const inSet = byName.filter((c) => sameSet(c, rawSet));
    if (inSet.length === 0) {
      const at = cardAt(rawSet, rawNumber);
      const where = at ? `${rawNumber} in that set is ${at.name}` : `it is in ${listOf(byName.map((c) => c.setName))}`;
      unmatched.push({ line, reason: `no ${shown} in "${rawSet.slice(0, 40)}"; ${where}`, kind: 'set_not_found' });
      return;
    }
    const byNumber = inSet.filter((c) => sameNumber(c, rawNumber));
    if (byNumber.length === 0) {
      const at = cardAt(inSet[0].setName, rawNumber);
      const where = at ? `that number is ${at.name}` : `its numbers there are ${listOf(inSet.map((c) => c.number))}`;
      unmatched.push({ line, reason: `no ${shown} number ${rawNumber.slice(0, 20)} in ${inSet[0].setName}; ${where}`, kind: 'number_not_found' });
      return;
    }
    // Several prints can share a name, set and number (a reverse holo of the same card); the
    // newest is the likeliest thing a collector owns.
    const pick = [...byNumber].sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))[0];
    add(pick, quantity, 'name');
  });

  const matches = [...byId.values()];
  return {
    matches,
    unmatched,
    totalCopies: matches.reduce((n, m) => n + m.quantity, 0),
    columns,
  };
}

/**
 * Land the matches as a new tcgscan portfolio. Ids follow the tcgscan client's `col-…`/`lot-…`
 * convention; the collection row goes first (FK), entries in chunks. On a mid-way failure the
 * collection is deleted, which cascades the inserted entries (and the trigger unwinds the
 * user_cards rollup) — no half-imports.
 */
export async function importAsPortfolio(name: string, matches: ImportMatch[]): Promise<void> {
  const supabase = requireSupabase();
  // WHAT FINISH WAS IT? A CSV of card names does not say, and stamping every row 'Normal' is a
  // guess that is wrong for nearly half the catalogue — many cards were never printed as Normal at
  // all. Where a card has exactly ONE published finish there is no guessing to do, and that covers
  // most of the catalogue; anything genuinely ambiguous still falls back to 'Normal', which is what
  // the user can then correct from the pocket's finish chip.
  //
  // Best-effort: the price summary is a few megabytes and an import must not fail for want of it.
  const priced = await getPriceSummary().catch(() => ({}) as PriceSummary);
  const soleVariant = (cardId: string): string => {
    const names = Object.keys(priced[cardId]?.variants ?? {});
    return names.length === 1 ? names[0] : 'Normal';
  };
  const collectionId = `col-${uuidv4()}`;
  const { error: colErr } = await supabase
    .from('collections')
    .insert({ id: collectionId, name });
  if (colErr) throw new Error(`create portfolio: ${colErr.message}`);

  try {
    for (let i = 0; i < matches.length; i += 400) {
      const chunk = matches.slice(i, i + 400).map((m) => ({
        id: `lot-${uuidv4()}`,
        collection_id: collectionId,
        card_id: m.cardId,
        variant: soleVariant(m.cardId),
        condition: 'NM',
        quantity: m.quantity,
      }));
      const { error } = await supabase.from('portfolio_entries').insert(chunk);
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    await supabase.from('collections').delete().eq('id', collectionId);
    throw new Error(`import entries: ${(e as Error).message}`);
  }
}
