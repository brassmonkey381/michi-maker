# Guest Fill page plan

Status: scoped 2026-10-30, built and verified the same day (desktop and phone, headless guest run: scripts/lab/zz-guest-fill-run.mjs); the Guests section of docs/FILL-METHODS.md is the living description. Planned by a 9-agent workflow (3 readers, 3 designs, 2 judges, 1 synthesis); both judges ranked this approach first.

Owner decisions, 2026-10-30: guest pages may lack the full-art flag; guests get 1 fill (and 1 Find similar), free accounts 3; Fill page and Complete page are the same feature and share one taste cap (`fillPage`).

## 1. Decision

Ship the guest Fill page taste from michi-maker alone, as a web OTA, with no tcgscan-data or tcgscan-browse change in week 1. Guests never load the catalog. The seed, the cards already on the page and every candidate come from the anon `public.cards` view through the kit's existing `fetchCardsByIds` (`node_modules/tcgscan-browse/src/search.ts:766-795`) and plain PostgREST filters on columns that are already anon-selectable (`tcgscan-data/supabase/migrations/20260911_59_grant_boundary.sql:1344-1346`: name, illustrator, types, evolution_line, set_id, series, release_date, jumbo, language). The ranked methods keep their RPCs (`find_similar`, `similar_by_tags`), which are anon today. `composePage` (`src/data/pageComposer.ts:613`) only ever calls `catalog.getCard` and `catalog.listAll`, so a Map-backed stub Catalog built from those rows runs the unchanged composer. This gives a first-visit guest a real Same Pokemon or Evolution line page, which is the "game changer" part, without waiting on a cross-repo migration whose apply cadence is slow (theme_fill 85/86 headers still read NOT YET APPLIED while `tcgscan-data/docs/THEME-SEARCH.md:29` says live). The `compose_candidates` RPC is filed as an optional later upgrade: it buys `full_art_kind` per row (Only row, art promotion) and an `rl_check` meter, nothing the first taste needs. The guest-slice design is not built: server work for a worse page.

## 2. What the guest sees

1. Guest taps a pocket, then Fill page in the pocket bar (`src/components/binder/BinderScreen.tsx:2388-2391`, tracks `autofill.open {guest:true}`).
2. Sheet opens. One GET resolves the seed plus page ids (~200 ms). Header is unchanged: "Curate this page around Charizard: fills the 8 empty pockets".
3. Method rows, wow first: Same Pokemon, Evolution line (when the seed has one), Same artist, Same type, Trainer page (when `trainerFor` matches), More like this, Same scene (when tagged). No Only row, no Fill from my collection, no language chips, no lock pills, no PRO word. One folded line under the list: "Create a free account to unlock 3 more ways to fill" (count computed from the hidden methods).
4. First tap: `taste.use('fillPage','fill_sheet')`, the page fills, toast "Fill page is yours free for this visit. Create a free account to keep using it." then "Filled 8 pockets · Same Pokemon". Undo reverses the fill as today.
5. One fill per guest, ever on this device (`TASTE_CAP guest 1`); a free account gets 3 and sees "(2 samples remaining)". A second Fill or Complete tap as a guest replaces the list with the existing wall component: "Create a free account to keep using Fill page." and a Create account button (`src/components/auth/SignInPerk.tsx:32-61`, surface `fill_wall`, same `returnTo`).
6. Create account: Google sign-up via `linkIdentity` keeps the uid (`src/store/auth.tsx:363`), the binder survives, `?fill=<page>.<pocket>` reopens the sheet (`BinderScreen.tsx:327-331, 393-401`) now with the catalog and all 10 methods.
7. Empty result or 404/429 from the server: existing "nothing found this time" line. Never a wall on a server error.

## 3. tcgscan-data work (handoff item, optional, not a week 1 blocker)

Add to `docs/DATA-SERVER.md` "Pending items" as item 000 (2026-10-30), marked "optional upgrade, michi ships without it":

**compose_candidates**. Replaces michi's per-method PostgREST GETs with one metered call and adds the two private art columns to guest rows.

- Signature (frozen, no overload, PGRST203): `public.compose_candidates(p_method text, p_seed_id text, p_limit integer default 60, p_exclude text[] default '{}', p_lang text[] default null, p_full_art boolean default null)`.
- Returns `table (id text, name text, number text, rarity text, card_type text[], set_id integer, set_name text, series text, release_date date, illustrator text, types text[], stage text, hp integer, evolution_stage_index integer, evolves_from text, evolution_line text[], jumbo boolean, language text, full_art boolean, full_art_kind text, score double precision)`. First 18 columns equal the kit's `CARD_COLS` (`search.ts:672-674`) so one row mapper serves both. `full_art`/`full_art_kind` are returned as DEFINER output for the returned rows only, never a relation grant (pattern `20261029_87_card_frame.sql:19-22`).
- p_method: `similar` (join `find_similar`), `scene` (join `similar_by_tags`), `artist`, `type`, `species`, `evolution`, `trainer` (join `trainer_partners`), `friends` (curated `pokemon_partner_groups` only). Unknown method returns empty 200. Common filter: jumbo false, browse_visible, p_lang, id not in p_exclude or seed, distinct on (lower(name), set_id). Scan methods ordered era-stratified: `row_number() over (partition by series order by random())`, then release_date.
- Shape: plpgsql VOLATILE SECURITY DEFINER, `set search_path = public, pg_temp`, first statement `perform public.rl_check(60, 10)`, p_limit clamped 0..200, p_exclude capped 64, query_canceled -> 500 (template `20261021_85_theme_fill.sql:87-124, 252-260`).
- Grants: revoke from public, anon, authenticated; grant execute to anon, authenticated, service_role.
- Tests: VERIFY block expecting VERIFY_OK (exists, prosecdef, provolatile 'v', anon execute, anon still lacks column privilege on cards_en.full_art_kind); anon REST probes: `artist` with a known seed returns 21-key rows, `nope` returns `[]`, 61st call in 10 s returns 429. 10-seed parity check against michi's PostgREST results in the header.
- Apply: `orchestration/scripts/apply_compose_candidates.ps1` cloned from `apply_theme_fill.ps1`, ledger row, status line in `docs/THEME-SEARCH.md` style. Migration header cites "WHO ASKED. michi-maker docs/DATA-SERVER.md item 000".
- Hours: 9 (RPC 5, SQL ports and parity 2, apply script and docs 1, EXPLAIN and optional trigram index 1).

michi wires it the day it lands in `src/lib/composeServer.ts` by swapping the candidate source; nothing else changes.

## 4. michi-maker work (build order)

1. `src/data/tastes.ts` (0.5 h): add `fillPage` to `TASTE_FEATURES` (:35), `TASTE_LABEL` `fillPage: 'Fill page'` (:38), `GUEST_TASTE_FEATURES = ['findSimilar','fillPage']` (:59). `src/data/tastes.test.ts` covers the key automatically; add one label assertion.
2. `src/data/pageComposer.ts` (3 h): export `catalogFromCards(cards): Catalog` stub (getCard/listAll over a Map, cast). In moreLikeThis (:673-692) and sameScene (:651-671) replace `hits.map(h => catalog.getCard(h.id))` with `resolveHits(ids, catalog)`: catalog first, `fetchCardsByIds` for misses. Unit test: a full stub never calls `fetchCardsByIds`, so PRO fills are untouched.
3. `src/data/guestFill.ts` (4 h, new): `guestSeed(seedId, page)` = `fetchCardsByIds([seedId, ...idsOnPage(page)])`; read `evolution_line` from the row, fall back to `fetchCardDetail` only when empty (replaces `AutoFillSheet.tsx:168-191` for guests). `guestCandidates(method, seed, pageIds, languages)` = one GET `/cards?select=CARD_COLS&jumbo=is.false&browse_visible=is.true&id=not.in.(...)&limit=200` plus the method predicate: `illustrator=ilike.<x>`, `types=cs.{<type>}`, `name=ilike.*<species>*` (species from `speciesOf`, :326-337), `or=(name.ilike.*A*,name.ilike.*B*)` for evolution line and trainer tokens (`src/data/trainerPartners.ts:43-46`), curated partners from `src/data/pokemonPartners.ts` (`curatedPartners`, no catalog). Two windows per scan (`order=release_date.desc` limit 120 and `.asc` limit 80) approximate variety for `varietyRank`/`varied` (:434-457, 598-601). Fails soft to `[]` on !ok including 404/429. Returns `catalogFromCards(seedRows + candidates)` so `composePage` runs unchanged with `idsOnPage` exclusion (:395-399) working. `GUEST_FILL_METHODS` ordered wow first; colorTheme, pokemonFriends parsed partners and fullPageSpread excluded for guests. Fetch on method press, not on sheet open.
4. `src/components/binder/AutoFillSheet.tsx` (5 h): three-state guest branch at :254 keyed on `store.tier === 'guest'`: (a) `taste.offer('fillPage') || taste.active('fillPage')`: normal body with `guestSeed`, `ready = !!guestSeed`, methods from `GUEST_FILL_METHODS` filtered by `availableMethods` with the stub, locked computation at :360-361 bypassed (no pills), Only row and pool toggle hidden, `loadPartnerData` (:124) skipped except trainer tokens, folded unlock line; (b) taste spent or runs exhausted: `<SignInPerk surface="fill_wall" message={guestTasteWall('fillPage')} returnTo={returnTo}/>`; (c) seed unresolved: existing :262-265 line. First run calls `taste.use` then `run`; `BinderScreen.tsx:688` `showTasteToast` prints the guest copy.
5. `src/lib/analytics.ts` and the sheet (1 h): events in section 6; document surfaces at :1005-1008.
6. `src/data/tiers.ts` (0.25 h): reword the `composerPagesPerMonth 0` comment at :90 and :200 ("guest fills run under the fillPage taste"); nothing else reads it (grep confirmed).
7. Docs (1.5 h): `docs/FILL-METHODS.md` rewrite of the data-source table (stale tonal inserts :31-32, missing sameScene and Only row) with a Guests column; `docs/DATA-SERVER.md` item 000 from section 3; memory note update to guest-tastes-rules.
8. Verification (2.5 h): Playwright guest run on the local export (`scripts/screenshots.mjs` pattern): fresh guest, Fill page, Same Pokemon, toast, three fills, wall, reload, wall. Then `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run check:kit` (no kit pin moves).

Total michi: about 18 h; 22 h with slippage. Phase 2 Complete page: +4 h (`src/data/pageCompleter.ts:38-41` accepts the stub; theme and similar resolve via `resolveHits`; `src/components/binder/CompletePageSheet.tsx:106` gets the same three-state branch, same `fillPage` label and wall).

## 5. Phasing

- Week 1 (michi only, OTA): Fill page taste with Same Pokemon, Evolution line, Same artist, Same type, Trainer page, More like this, Same scene (when tagged). Hidden for guests: Color theme (on-device blob, paid triColor), Friends (parsed partners need the catalog), Color sheet (an SVG sheet is not the card page a visitor came for). Complete page shares the `fillPage` taste from day one (owner: "Fill is the same as complete").
- Week 1 also: Complete page theme and similar for guests under the same label; owner probe that `theme_fill` 85/86 is live on prod (michi fails soft to "nothing found" on 404, `src/lib/themeFill.ts:21-36`).
- Later, only if the metric in section 6 clears: `compose_candidates` in tcgscan-data (section 3), then a michi edge function cloned from `supabase/functions/theme-search/index.ts:84-195` (APP JWT, anonymous allowed, `x-rl-identity user:<uid>`) if guest `find_similar` and `/cards` traffic outgrows the device-local cap.

## 6. Analytics and success metric

Add in `AutoFillSheet.run`: `autofill.run {method, placed, guest, taste: boolean, source: 'catalog'|'server'}` (the sheet has no `track()` today) and `autofill.more_tap {guest}` on the folded line. Existing events close the funnel: `autofill.open` (`BinderScreen.tsx:2389`), `taste.used {feature:'fillPage', surface:'fill_sheet'}` (`src/hooks/use-tastes.ts:87`), `card.add via:'fill'`, `signin.perk_shown/perk_click {surface:'fill_wall'}`, `account.created {via:'guest_upgrade'}` (`auth.tsx:415`).

Success metric, read after 14 days of Reddit-ad traffic: guest `autofill.run` to `account.created` within 7 days at or above 2x the current `fill_sheet` perk_click to account rate. Secondary: `autofill.more_tap` on 30% or more of guest fill opens means demand for the hidden methods. Watch server cost weekly: `find_similar` calls in pg_stat_statements and anon `/cards` GET count against `autofill.run {guest:true}`; above roughly 10x fills, build the edge-function hop.

## 7. Risks and open questions (ranked)

1. Decided: 1 fill for guests, 3 for free accounts, no in-sheet run counter beyond the taste record.
2. Guest pages lack `full_art_kind` (`CARD_COLS` omits it), so the Only row, `promoteArtCards` and Complete art ordering are hidden or degraded for guests. Decided: accepted; `compose_candidates` stays optional.
3. No server meter exists on `find_similar` or `/cards` GETs (pre_request dropped, `20260912_68:1519`); the per-guest cap is device-local and a cleared browser is a new guest. Same posture Find similar has had since 2026-09-11. Escalation is the michi edge function, not the data project, which cannot see michi users (`20260907_43:49-52`).
4. The `resolveHits` change touches moreLikeThis and sameScene for paying users. Guard: the unit test that a full stub never reaches the network, plus a signed-in Playwright fill before deploy.
5. Decided: Complete page joins the `fillPage` taste now, one label, one wall.

Next: owner answers 1 and 2; michi starts step 1 of section 4.
