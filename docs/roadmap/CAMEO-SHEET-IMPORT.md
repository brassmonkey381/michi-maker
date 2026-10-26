# Cameo tags from the community sheet (triage note, 2026-10-26)

**Status:** open, not started. Owner's ask on 2026-10-26.

## The ask

A community Google Sheet lists Pokémon TCG cameo cards, generation 1 through 9 plus trainer
cameos: cards where a Pokémon (or a trainer) other than the one named on the card appears in the
art. We want those cameos in the tagging dataset on the data project, so theme search answers
"cards with a Pikachu cameo" from curated data rather than from the vision pass alone.

Sheet: https://docs.google.com/spreadsheets/d/18nIkOgqQrHZTz0TrH_gL1e1nL1RcHiCmPF5finAjToY/edit?gid=1923267969#gid=1923267969

The sheet could not be read from this machine without signing in (the CSV export redirects to a
400). Before any of the below: open it in a browser, File, Download, CSV per tab, and drop the
files in `state/cameos/` (gitignored working files), or share the sheet as "anyone with the link".

## Rules the owner set

1. **Find the exact card** each line refers to. Match on set + collector number first, then name
   + set, then name + year as a last resort; a line that resolves to more than one printing is
   ambiguous and goes to a review list, never guessed.
2. **Ignore cards we do not have.** A line whose card is not in the tcgscan-data catalog is
   dropped and counted, not invented.
3. **Add the cameos to the tagging dataset**, one tag per cameo species or trainer, the same
   vocabulary theme search already uses for cameos (`theme_search` has a cameos category).
4. **Label the source.** Every tag written this way carries a provenance label naming the sheet
   (a `source` value such as `community-cameo-sheet-2026-10`), so it can be audited, re-imported
   or removed as one batch.

## Where the work lives

- Catalog and tags are on the **tcgscan-data** project (`bmhjizcmwtmcrstadqto`), owned by the
  data session; michi-maker is a consumer (`docs/DATA-SERVER.md`). The import is a data-side
  script, not app code. Hand this note to that session, or run it from `tcgscan-data-science`.
- michi reads the result through theme search, unchanged. Cameo binders (see the 2026-10-26
  binder-types research in this session's log: PokéCameos, Staiz, WoahPoke, Elite Fourum list)
  become possible once per-set cameo tags exist.

## Suggested approach

1. Parse every tab; normalise set names against the catalog's `setName` / `setCode`, numbers
   against `number` (strip leading zeros, keep the `/total` suffix out of the match).
2. Resolve each line to one catalog id; write three outputs: matched (id, cameo tags, sheet row),
   unmatched (not in catalog), ambiguous (several printings).
3. Dry run first: print counts per tab and twenty random matches with their images for an eyeball
   check. Only then write tags, with the source label, in one batch.
4. Verify: a theme search for a known cameo (Pikachu on Lucky Stadium) returns the sheet's cards.

## Verification

- Counts: lines in, matched, unmatched, ambiguous, per tab.
- Spot check 20 random matches by picture.
- Re-running the import is a no-op (idempotent on card id + tag + source).
