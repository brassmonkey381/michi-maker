# Copy deck

One editable page with every piece of on-screen text in michi-maker, a tab per page of the app,
a Phone box and a Desktop box per row. The owner edits there; Claude writes the edits back.

- Editor: https://claude.ai/artifact/CXkB8PsJCmPxB8CN9Tqsum (private; edits are saved as
  `edits/<id>` documents in the artifact's database).
- michi ships web only, so **Phone means a narrow screen** (the code's `phone` / `narrow` /
  `compact` branches), not a native build. A row given different wording on the two becomes
  `isPhoneWidth() ? phone : desktop` (`src/lib/phoneWidth.ts`).
- Rows from the `tcgscan-browse` kit are listed but refused by apply: change them in the kit's
  repo and re-pin (AGENTS.md).

## Refresh the page after the code changes

    node scripts/copy-deck/extract.mjs <scratch>/catalog-full.json <scratch>/catalog.json

Publish `catalog.json` alongside the page (Artifact `files`); keep `catalog-full.json` for apply.

## "apply copy edits"

1. Read the `edits` collection from the artifact database into `edits.json` as
   `[{ id, phone, web }]`.
2. `node scripts/copy-deck/apply.mjs <scratch>/catalog-full.json edits.json --dry`, read the
   `! CHECK` lines (text also used as a value in code), then run it without `--dry`.
3. `npx tsc --noEmit`, `npm run lint`, commit by file name, delete the applied `edits/<id>` docs,
   re-extract and republish the catalog.
