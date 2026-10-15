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
import { detectColumns, type ImportAnalysis, type ImportMatch } from '@/data/csvShape';
import { requireSupabase } from '@/lib/supabase';
import { getPriceSummary, type PriceSummary } from '@/lib/prices';

// The parser, the column detection and the shape record have no dependencies and live in
// csvShape.ts so they can be unit-tested; re-exported here so callers keep one import.
export { csvShape, detectColumns, parseCsv } from '@/data/csvShape';
export type { CsvColumns, ImportAnalysis, ImportMatch, UnmatchedKind } from '@/data/csvShape';

/** Resolve parsed CSV rows against the catalog. */
export function analyzeCsv(rows: string[][], catalog: Catalog): ImportAnalysis {
  const unmatched: ImportAnalysis['unmatched'] = [];
  const byId = new Map<string, ImportMatch>();
  const add = (card: CatalogCard, quantity: number, via: 'id' | 'name') => {
    const existing = byId.get(card.id);
    if (existing) existing.quantity += quantity;
    else byId.set(card.id, { cardId: card.id, quantity, name: card.name, via });
  };

  const columns = detectColumns(rows[0] ?? []);
  if (rows.length === 0) return { matches: [], unmatched: [], totalCopies: 0, columns };

  const { id: idCol, qty: qtyCol, name: nameCol, set: setCol, number: numberCol } = columns;

  // Headerless fallback: every line `productId[,quantity]`.
  if (columns.headerless) {
    rows.forEach((r, i) => {
      const id = r[0]?.trim();
      if (!/^\d+$/.test(id ?? '')) {
        unmatched.push({ line: i + 1, reason: `"${(id ?? '').slice(0, 30)}" isn't a product id`, kind: 'not_an_id' });
        return;
      }
      const card = catalog.getCard(id);
      if (!card) {
        unmatched.push({ line: i + 1, reason: `product id ${id} isn't in the catalog`, kind: 'id_not_in_catalog' });
        return;
      }
      add(card, Math.max(1, parseInt(r[1] ?? '1', 10) || 1), 'id');
    });
  } else {
    // Name index built lazily — only when some row actually needs name matching.
    let nameIndex: Map<string, CatalogCard[]> | null = null;
    const namesFor = (name: string): CatalogCard[] => {
      if (!nameIndex) {
        nameIndex = new Map();
        for (const c of catalog.listAll()) {
          const k = c.name.toLowerCase();
          const list = nameIndex.get(k) ?? [];
          list.push(c);
          nameIndex.set(k, list);
        }
      }
      return nameIndex.get(name) ?? [];
    };

    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const quantity = qtyCol >= 0 ? Math.max(1, parseInt(r[qtyCol] ?? '1', 10) || 1) : 1;

      const rawId = idCol >= 0 ? r[idCol]?.trim() : '';
      if (rawId && /^\d+$/.test(rawId)) {
        const card = catalog.getCard(rawId);
        if (card) {
          add(card, quantity, 'id');
          return;
        }
      }

      const rawName = nameCol >= 0 ? r[nameCol]?.trim() : '';
      if (!rawName) {
        unmatched.push(
          rawId
            ? { line, reason: `product id ${rawId} isn't in the catalog`, kind: 'id_not_in_catalog' }
            : { line, reason: 'no id or name', kind: 'no_id_or_name' },
        );
        return;
      }
      let candidates = namesFor(rawName.toLowerCase());
      if (candidates.length === 0) {
        unmatched.push({ line, reason: `no card named "${rawName.slice(0, 40)}"`, kind: 'name_not_found' });
        return;
      }
      const rawSet = setCol >= 0 ? r[setCol]?.trim().toLowerCase() : '';
      if (rawSet) {
        const inSet = candidates.filter(
          (c) => c.setName.toLowerCase() === rawSet || c.setCode.toLowerCase() === rawSet,
        );
        if (inSet.length > 0) candidates = inSet;
      }
      const rawNumber = numberCol >= 0 ? r[numberCol]?.trim().toLowerCase() : '';
      if (rawNumber) {
        const byNumber = candidates.filter((c) => c.number.toLowerCase().startsWith(rawNumber));
        if (byNumber.length > 0) candidates = byNumber;
      }
      // Ambiguity falls to the newest print — the likeliest thing a collector owns.
      const pick = [...candidates].sort((a, b) =>
        (b.releaseDate || '').localeCompare(a.releaseDate || ''),
      )[0];
      add(pick, quantity, 'name');
    });
  }

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
