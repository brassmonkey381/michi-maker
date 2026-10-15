/**
 * The CSV importer's pure half: the parser, which columns a header offers, and the shape record
 * the `csv.analyzed` analytics event carries. No imports, so `node --test` can load it; the
 * catalog-matching half is csvImport.ts.
 */
/** RFC4180-ish CSV parse: quoted fields, escaped quotes, CR/LF. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export interface ImportMatch {
  cardId: string;
  quantity: number;
  name: string;
  via: 'id' | 'name';
}
/** Why a row was skipped, as a bucket the shape record can count (the `reason` is for people). */
export type UnmatchedKind = 'not_an_id' | 'id_not_in_catalog' | 'no_id_or_name' | 'name_not_found';
export interface ImportAnalysis {
  matches: ImportMatch[];
  /** 1-based CSV line + why it couldn't be resolved. */
  unmatched: { line: number; reason: string; kind: UnmatchedKind }[];
  totalCopies: number;
  /** How the header was read: which column answered for each thing, -1 for none. */
  columns: CsvColumns;
}

export interface CsvColumns {
  id: number;
  qty: number;
  name: number;
  set: number;
  number: number;
  /** No id and no name column: every line is read as `productId[,quantity]`. */
  headerless: boolean;
}

const findCol = (header: string[], patterns: RegExp[]): number => {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

/** Which columns the importer will read, from the first row. Exported so the shape record and
 *  the sheet's column guide say the same thing the import does. */
export function detectColumns(firstRow: string[]): CsvColumns {
  const header = firstRow.map((h) => h.trim().toLowerCase());
  const id = findCol(header, [/product.?id/, /tcgplayer/, /^id$/]);
  const qty = findCol(header, [/^(qty|quantity|count|total.?quantity)$/]);
  const name = findCol(header, [/^simple.?name$/, /^(card.?)?name$/, /name/]);
  const set = findCol(header, [/^set(\s?name)?$/, /product.?line/]);
  const number = findCol(header, [/(card.?)?number/]);
  return { id, qty, name, set, number, headerless: id < 0 && name < 0 };
}

/**
 * THE SHAPE OF WHAT WAS TRIED (owner, 2026-10-15), for the `csv.analyzed` analytics event: the
 * header as the person brought it, which columns we read, how many rows landed and why the rest
 * did not. Column names and counts only: no cell values, no card names, so a collection stays
 * the owner's. Header names are clipped so a stray data row pasted as a header cannot carry much.
 */
export function csvShape(rows: string[][], analysis: ImportAnalysis, bytes: number): Record<string, unknown> {
  const header = analysis.columns.headerless ? [] : rows[0] ?? [];
  const skipped: Record<string, number> = {};
  for (const u of analysis.unmatched) skipped[u.kind] = (skipped[u.kind] ?? 0) + 1;
  const via = { id: 0, name: 0 };
  for (const m of analysis.matches) via[m.via] += 1;
  return {
    bytes,
    rows: rows.length,
    cols: rows[0]?.length ?? 0,
    headerless: analysis.columns.headerless,
    header: header.slice(0, 30).map((h) => h.trim().toLowerCase().slice(0, 40)),
    columns: {
      id: analysis.columns.id,
      qty: analysis.columns.qty,
      name: analysis.columns.name,
      set: analysis.columns.set,
      number: analysis.columns.number,
    },
    matched: analysis.matches.length,
    copies: analysis.totalCopies,
    matched_via: via,
    unmatched: analysis.unmatched.length,
    skipped,
  };
}
