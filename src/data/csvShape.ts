/**
 * The CSV importer's pure half: the parser, which columns a header offers, the column roles a
 * person can assign by hand, and the shape record the `csv.analyzed` analytics event carries.
 * No imports, so `node --test` can load it; the catalog-matching half is csvImport.ts.
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
export type UnmatchedKind =
  | 'not_an_id'
  | 'id_not_in_catalog'
  | 'id_mismatch'
  | 'no_id_or_name'
  | 'needs_set_and_number'
  | 'name_not_found'
  | 'set_not_found'
  | 'number_not_found';
export interface ImportAnalysis {
  matches: ImportMatch[];
  /** 1-based CSV line + why it couldn't be resolved. */
  unmatched: { line: number; reason: string; kind: UnmatchedKind }[];
  totalCopies: number;
  /** How the header was read: which column answered for each thing, -1 for none. */
  columns: CsvColumns;
}

/** The things the importer can read from a column. */
export type CsvRole = 'id' | 'qty' | 'name' | 'set' | 'number';
export const CSV_ROLES: readonly CsvRole[] = ['id', 'qty', 'name', 'set', 'number'];

/** What each role is, for the column badges and the "?" guide. `accepts` lists header words the
 *  importer recognises on its own; anything else can be assigned by tapping the column.
 *
 *  THE COLUMNS WE DO NOT READ ARE WORTH KEEPING (owner, 2026-10-15): grades, cert numbers,
 *  condition, printing, language, prices. The plan to store them with the import and parse them
 *  later is docs/roadmap/CSV-IMPORT-COLUMNS.md; until then "Not used" means dropped. */
export const CSV_ROLE_INFO: Record<CsvRole, { label: string; blurb: string; accepts: string }> = {
  id: {
    label: 'Product ID',
    blurb: 'The TCGPlayer product id. An exact match, the surest way to land a card. If the row also names the card, set or number, they have to agree with it.',
    accepts: 'Product ID, TCGPlayer ID, ID',
  },
  qty: {
    label: 'Quantity',
    blurb: 'How many copies. A row with no quantity counts as one.',
    accepts: 'Quantity, Qty, Count, Total Quantity',
  },
  name: {
    label: 'Name',
    blurb: 'The card name, matched against the catalog. Without a product id, the set and number are needed too.',
    accepts: 'Name, Card Name, Simple Name',
  },
  set: {
    label: 'Set',
    blurb: 'The set name or code. With the name and number, it names one card.',
    accepts: 'Set, Set Name, Product Line',
  },
  number: {
    label: 'Number',
    blurb: 'The card number in its set, like 58 or 58/102. With the name and set, it names one card.',
    accepts: 'Number, Card Number',
  },
};

export interface CsvColumns {
  id: number;
  qty: number;
  name: number;
  set: number;
  number: number;
  /** No header row: the first line is data, read as `productId[,quantity]`. */
  headerless: boolean;
}

/** Columns a person assigned by tapping a column: role -> column index, or -1 for "not used". */
export type CsvOverrides = Partial<Record<CsvRole, number>>;

const findCol = (header: string[], patterns: RegExp[]): number => {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

/** A first row made only of numbers (and blanks) is data, not a header: `123456,2`. */
export function looksHeaderless(firstRow: string[]): boolean {
  const cells = firstRow.map((c) => c.trim());
  return cells.some((c) => c !== '') && cells.every((c) => /^\d*$/.test(c));
}

/**
 * Which columns the importer will read, from the first row, then any assignments a person made
 * on top. Exported so the shape record, the preview grid and the import all say the same thing.
 *
 * A column answers for one role only: assigning "Quantity" to the column we had read as the
 * name takes it away from name, so two badges never claim one column.
 */
export function detectColumns(firstRow: string[], overrides?: CsvOverrides): CsvColumns {
  const headerless = looksHeaderless(firstRow);
  const header = headerless ? [] : firstRow.map((h) => h.trim().toLowerCase());
  const cols: CsvColumns = headerless
    ? { id: 0, qty: firstRow.length > 1 ? 1 : -1, name: -1, set: -1, number: -1, headerless }
    : {
        id: findCol(header, [/product.?id/, /tcgplayer/, /^id$/]),
        qty: findCol(header, [/^(qty|quantity|count|total.?quantity)$/]),
        name: findCol(header, [/^simple.?name$/, /^(card.?)?name$/, /name/]),
        set: findCol(header, [/^set(\s?name)?$/, /product.?line/]),
        number: findCol(header, [/(card.?)?number/]),
        headerless,
      };
  for (const role of CSV_ROLES) {
    const to = overrides?.[role];
    if (to === undefined) continue;
    if (to >= 0) for (const other of CSV_ROLES) if (other !== role && cols[other] === to) cols[other] = -1;
    cols[role] = to;
  }
  return cols;
}

/**
 * A card number as the catalog and a spreadsheet would both agree on it: lowercase, one space
 * between parts, and NO LEADING ZEROS in any run of digits (owner, 2026-10-15). A sheet pads
 * "58/102" to "058/102", a set list writes "TG05", and the catalog may hold either; stripping the
 * padding on both sides makes them the same card.
 */
export function normCardNumber(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\d+/g, (d) => String(Number(d)))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "58" matches "58/102", and so does "058/102" or "58/102" itself. */
export function sameCardNumber(catalogNumber: string, raw: string): boolean {
  const n = normCardNumber(catalogNumber);
  const r = normCardNumber(raw);
  return n === r || n.startsWith(`${r} `) || r.startsWith(`${n} `);
}

/** A product id as typed, less any zero padding a spreadsheet added; not a number if not digits. */
export function normProductId(raw: string): string {
  const t = raw.trim();
  return /^\d+$/.test(t) ? String(Number(t)) : t;
}

/** Lowercase, accents folded (Pokémon is pokemon), "&" read as "and", punctuation gone. */
function foldText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * A card name the way a collector writes it (owner, 2026-10-15): the catalog calls the alternate
 * art "Rayquaza V (Alternate Full Art)", a spreadsheet says "Rayquaza V" and lets the number say
 * which print. Trailing parenthetical tags are dropped on both sides, so the name finds the
 * family and the set and number pick the card.
 */
export function normCardName(raw: string): string {
  return foldText(raw.replace(/\s*\([^)]*\)\s*$/g, '').replace(/\s*\([^)]*\)/g, ' '));
}

/**
 * A set name as the catalog spells it, "SWSH07: Evolving Skies", matches what a collector writes:
 * "Evolving Skies", "SWSH07 Evolving Skies", "swsh07", "Sword and Shield Base Set" for
 * "Sword & Shield Base Set". Every spelling the catalog could be known by is tried.
 */
export function sameSetName(catalogName: string, catalogCode: string, raw: string): boolean {
  const r = foldText(raw);
  if (!r) return false;
  const afterColon = catalogName.includes(':') ? catalogName.slice(catalogName.indexOf(':') + 1) : '';
  const forms = [catalogName, afterColon, catalogCode].map(foldText).filter(Boolean);
  return forms.includes(r);
}

/** The role a column plays, if any. */
export function roleOfColumn(columns: CsvColumns, col: number): CsvRole | null {
  for (const role of CSV_ROLES) if (columns[role] === col) return role;
  return null;
}

/**
 * THE SHAPE OF WHAT WAS TRIED (owner, 2026-10-15), for the `csv.analyzed` analytics event: the
 * header as the person brought it, which columns we read, how many rows landed and why the rest
 * did not. Column names and counts only: no cell values, no card names, so a collection stays
 * the owner's. Header names are clipped so a stray data row pasted as a header cannot carry much.
 */
export function csvShape(
  rows: string[][],
  analysis: ImportAnalysis,
  bytes: number,
  overrides?: CsvOverrides,
): Record<string, unknown> {
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
    // Which roles the person assigned by hand, and to which column: the header words we should
    // learn to read on our own.
    remapped: overrides && Object.keys(overrides).length > 0 ? overrides : null,
    matched: analysis.matches.length,
    copies: analysis.totalCopies,
    matched_via: via,
    unmatched: analysis.unmatched.length,
    skipped,
  };
}
