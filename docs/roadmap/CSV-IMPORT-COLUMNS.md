# CSV import: keep the columns we do not read yet

Owner's note, 2026-10-15. Status: open, not started.

## The idea

The importer reads five columns (Product ID, Quantity, Name, Set, Number) and leaves every
other column alone. Many collectors' files carry more that we could use later: PSA or CGC
grade and cert number, card condition (NM, LP, MP), printing or finish (Holofoil, Reverse
Holofoil, 1st Edition), language, purchase price and date, and personal notes. Today that
data is read once in the browser and thrown away. The owner wants it kept, so it can be
parsed and surfaced later without asking anyone to import again.

## What we know

- `csv.analyzed` events (`src/data/csvShape.ts`) record the header words people bring, so
  the columns worth parsing first can be read off the analytics table rather than guessed:
  `select props->'header' from analytics_events where name = 'csv.analyzed'`.
- `portfolio_entries` already has `condition` (tcgscan-app syncs it; every import writes
  `'NM'`) and `variant` (the finish, guessed from the price summary when a card has one
  published finish). A Printing column maps straight onto `variant`; a Condition column onto
  `condition`. Read `../tcgscan-app/src/lib/sync.ts` and `sync-merge.ts` before writing either
  from here (AGENTS.md: these are tcgscan-owned tables, and `updated_at` is the merge key).
- Grades and cert numbers have no home yet in the shared tables. Adding a column there means
  the phone app's merge rules too, so a grade is more likely to start as a michi-side field.

## Suggested shape

1. **Store the leftovers.** Per imported collection, keep the header and, per entry, the cells
   from columns we did not read, as one `jsonb` (`{ "Grade": "PSA 10", "Cert": "12345678" }`),
   keyed by the header word as the person wrote it. Either a michi-side table
   (`import_extras`, owner-scoped RLS, `entry_id` text FK to the `lot-…` id) or a column on
   `portfolio_entries` if tcgscan agrees to carry it. Nothing parses it at import time.
2. **Parse on demand later.** A migration or a client-side pass reads the leftovers for the
   header words we decide to support (grade, cert, condition, printing, language) and writes
   the typed columns. Because the raw cells are kept verbatim, every later improvement to the
   parser can re-run over old imports.
3. **Say so in the importer.** The "Not used" badge can read "Kept for later" once this is
   in, and the `?` guide can list the columns we keep but do not parse yet.

## Privacy

Leftover columns can hold purchase prices and notes. They are the owner's own data in their
own portfolio, under the same RLS as the entries, and never go into analytics (the shape
record carries header words only). The privacy page already covers "card inventory you import
by CSV"; a note that extra columns are kept with the import would make it explicit.
