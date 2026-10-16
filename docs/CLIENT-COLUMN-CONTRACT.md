# The client column contract

Track B deliverable for the data-access lock-down. First written 2026-09-11, **corrected the same
day after Track A challenged the coverage**; see section 6 for what changed and why, because the
way the first version was wrong is itself the argument for how to grant.

Every column list below was read off the shipped code and then confirmed against the production
data project with the publishable key, as anon. Nothing was changed.

This exists because `tcgscan-browse/src/search.ts:96` maps rows with `?? ''` on every field, so a
column dropped from a grant produces a blank field or an empty grid, never an error. A smoke test
passes. Only a column-by-column diff catches it.

---

## 1. `public.cards`

50 columns exist. Anon clients touch **19**, and only through `tcgscan-browse`. Neither app reads
the view directly.

| Need | Columns | Where |
| --- | --- | --- |
| **SELECTed** (18) | `id, name, number, rarity, card_type, set_id, set_name, series, release_date, illustrator, types, stage, hp, evolution_stage_index, evolves_from, evolution_line, jumbo, language` | `CARD_COLS`, `search.ts:266` |
| **FILTERed only** (1) | `browse_visible` | `search.ts:291`, `:445` |

`browse_visible` is the trap. It is never selected, so a contract derived from `select=` lists
misses it, and a WHERE clause on a column the caller lacks SELECT on is `42501`, not a silent
empty. Two of the three direct `/cards` reads carry `browse_visible=is.true`, so dropping it takes
out the cold-path set drill-down and the Recent and Upcoming feed while leaving warm search
working, which is the hardest possible failure to attribute.

Also filter or order columns, all already in the SELECT list: `set_id`, `id`, `release_date`
(`order=release_date.desc`), `language`.

---

## 2. Every other anon relation a client reads

Six, not three. The last three were missed on the first pass.

| Relation | Columns the client uses | Where |
| --- | --- | --- |
| `sets` | `id, name, series, card_count, logo_url` **+ `code`, `symbol_url`** = 7 of 11 | kit `search.ts:468`; app `set-scope.ts:108` |
| `prices` | `date, variant, market_price, avg_sales_price, quantity`, filtered on `product_id` | kit `prices.ts:146`; app `prices.ts:175` |
| `search_config` | `free_theme_depth` (of 3) | `search.ts:54` |
| `model_versions` | `public_version, published_at, dataset_version`, filtered on `id` (4 of 12) | app `model-info.ts:42` |
| `pokemon_partner_groups` | `members`, ordered by `id` | michi `pokemonPartners.ts:27` |
| `trainer_partners` | **`select=*`**: `name, signature, pokemon, associates, tokens` | michi `trainerPartners.ts:41` |

Three notes.

**`sets` is a union of two different call sites with different needs.** The kit wants
`id, name, series, card_count, logo_url`; tcgscan-app's set-symbol art wants `name, code,
symbol_url`. Either alone is wrong.

**`model_versions` is read by the app** for the scanner's model provenance display. `id` is
filter-only. The audit lists this relation as anon-open and worth closing; it has a live client.

**`trainer_partners` uses `select=*`**, so no column list can be derived from the code at all. The
five columns above were measured live, and this relation will silently break on any column rename,
not only on a revoke.

---

## 3. What the functions return, measured live

| Function | HTTP | Columns |
| --- | --- | --- |
| `search_cards` | 200 | 21: the 18 above plus `cur, score, total_count` |
| `search_facets` | 200 | 3: `facet, value, n` |
| `card_detail` | 200 | **15**: `id, language, evolution_line, evolves_from, evolution_line_length, dex, subtypes, regulation_mark, attacks, retreat_cost, weakness, resistance, card_text, card_type_b, attributes` |
| `find_similar`, `find_similar_to_cards` | 200 | **8**: `id, name, set_name, number, rarity, image_url, image_small_url, similarity` |
| `find_similar_weighted` | 200 | 2: `id, similarity` |
| `search_by_color`, `search_by_colors` | 200 | 2: `product_id, score` / `product_id, dist` |
| `find_similar_by_color` | **500** | never succeeds, see below |

**Correction, 2026-09-11.** The first version of this table said the whole `find_similar` family
returned `id, similarity`. That was read off the client's TypeScript annotation at `similar.ts:143`,
not off the wire, and printed in a table headed "measured live". A TS annotation that names two
fields of an eight-field row compiles perfectly and tells you nothing about what the server sent.
Track A caught it. `find_similar` and `find_similar_to_cards` return seven card columns plus the
score, so **`image_url` and `image_small_url` are in the boundary because they are RETURNED**, not
only because a body reads them.

`find_similar_weighted` really does return `id, similarity`, so the family is not uniform. Track A's
correction over-generalised by one function in the other direction.

**One colour function is broken, not three.** My first pass read three-out-of-three as broken and
recommended dropping all of them, which would have deleted two working features. A 6-trial run per
variant, with a deliberate signature-mismatch control:

| Call | Succeeded | ms |
| --- | --- | --- |
| `search_by_color` (client args) | 6/6 | 780 to 1090 |
| `search_by_color` (+`p_lang`) | 6/6 | 461 to 606 |
| `search_by_colors` (client args) | 6/6 | 1494 to 2084 |
| `search_by_colors` (+`p_lang`) | 6/6 | 796 to 870 |
| `find_similar_by_color` | **0/6** | 3102 to 3136, all `57014` |
| control: one bogus argument name | 0/6 | 91 to 246, `404 PGRST202` |

So `find_similar_by_color` is deterministically broken at the statement timeout, exactly as the
audit said, and the other two work. Drop the first, convert the other two.

**But the failures were real, not malformed calls.** Track A's proposed explanation was that my
500s were signature mismatches. The control row is the disproof: a mismatch is a **404 PGRST202 in
about 100ms**, because the function is never resolved and so never runs. A `57014` statement
timeout at 3.1 seconds is the function running and being killed. A mismatch also cannot return 200,
and one of my original calls did.

**What actually differed is worth keeping.** The same two payloads that fail nothing now failed on
first touch earlier in the day, at 3.1 to 3.5 seconds, right at the timeout boundary. I cannot
force a cold state to prove the mechanism, so treat the cause as unproven, but the observation
stands: a first-touch colour query failed and warm ones do not. Both functions sit close enough to
the 3s ceiling that this is a live user-facing risk rather than a curiosity.

**And `p_lang` roughly halves the runtime** (1090 to 538, 1535 to 859). `color.ts:71` omits it
whenever the language is unconstrained, which is the default, so the shipped client takes the slow
arm of both functions every time a user has not set a language filter.

**There are two detail functions and clients call only one.** `card_detail` and `get_card_detail`
both exist, both are anon-executable, and both return **the identical 15 columns**, measured.
Every client call site uses `card_detail` (six references, no dynamic construction outside
`similar.ts`). `get_card_detail` is dead surface from the client side: drop it rather than convert
it.

**`full_art_kind` confirmed absent from `search_cards`.** The audit was right and `DATA-SERVER.md`
overstates it. `rowToCard.fullArtKind` is permanently `''` on the cold path. It reaches the client
only through the catalog bundle (`catalog.ts:364`), built by the publisher as service_role. It does
not belong in the anon grant.

**`card_detail` over-returns by 13 columns.** Clients read exactly `evolves_from` and
`evolution_line`. Nothing reads `dex`, `subtypes`, `regulation_mark`, `attacks`, `retreat_cost`,
`weakness`, `resistance`, `card_text`, `card_type_b` or `attributes`. Not proprietary, so not
urgent, but it is 13 columns of surface with no consumer.

---

## 4. The definer list, and the part that is not grep-able

Every data-project function reachable from a client. **Six of these names exist nowhere in the
source as a literal**: `similar.ts:124` builds them as `` `${liveRpc}_candidate` `` and calls
`` `/rpc/${rpc}` ``, so any enumeration by grep misses them.

| Function | Returns card columns? | Reads card columns internally? |
| --- | --- | --- |
| `search_cards` | yes, 18 | yes |
| `search_facets` | no | yes |
| `card_detail` | yes, 15 | yes |
| `tagged_cards` | yes (service_role only) | yes |
| `find_similar`, `find_similar_to_cards` | **yes, 7** (`name, set_name, number, rarity, image_url, image_small_url` + `id`) | **yes: `embedding`** |
| `find_similar_weighted` | no, ids only | **yes: `embedding`** |
| `find_similar_candidate`, `find_similar_to_cards_candidate`, `find_similar_weighted_candidate` | no, ids only | **yes: `embedding`**, plus `card_embeddings_candidate` |
| `search_by_color`, `search_by_colors`, `find_similar_by_color` | no, ids only | **yes: `color_art` / `color_noborder`** |
| `list_candidate_models`, `get_similarity_model` | no | no |
| `get_scan_flows` | no | no |
| `get_scanner_rollout` | no | no (**being removed client-side**, see below) |

The right-hand column is the one that matters and it is the answer to "is `search_cards` the only
one". **No.** Nine functions return no card columns at all and would still break under a column
grant, because an invoker-security function body is checked against the CALLER's privileges. A
`find_similar` that reads `c.embedding` as anon is `42501` the moment `embedding` is outside the
grant, and `similar.ts:143` turns that into `return []`: the Find Similar button just stops
finding anything, with no error anywhere.

---

## 5. So: grant the 19, or the 47?

**Grant the 19, but only after `pg_proc.prosecdef` confirms every function in section 4 is
definer.** The two lists answer different questions and conflating them is how this fails.

- The **19** is the client contract: what a client selects or filters directly.
- The **47** additionally covers what invoker-security function BODIES read, which is a different
  set, and notably includes `embedding`, `color_art` and `color_noborder` — none of which any
  client selects, and all of which nine functions need.

So the safe orders are:

1. Dump `pg_proc`. Make every function in section 4 definer in the same transaction as the grant.
   Then 19 is correct and is 31 columns tighter than the audit's proposal.
2. Or grant the 47 and treat the definer flip as the follow-up. Wider, but nothing silently dies
   while the two steps are apart.

What must not happen in either order is dropping `browse_visible`, or granting the 19 while any
similarity or colour function is still invoker.

**Confidence statement, asked for explicitly.** I am confident about the six relations in section 2
and the 19 columns in section 1 for `tcgscan-browse`, `tcgscan-app` and `michi-maker` as they stand
at HEAD today. I am NOT confident that grep alone found everything, because on this document's
first pass it did not: see section 6. The residual risks are `select=*` (one known case), names
built by template (six known cases), and any path added after today.

---

## 6. What the first version got wrong

Recorded because the shape of the error is the case for the safer grant order.

**It said the tagged corpus fed one sheet. It feeds three.** The first pass grepped for
`loadTaggedCards`, `fetchTaggedCards` and `useTaggedCards`, and missed `useSceneTags`
(`taggedCards.ts:116`), which calls `loadTaggedCards` internally. `BuildBinderSheet.tsx:38` and
`AutoFillSheet.tsx:38` both import it, and `binderWizard.ts:19` and `pageComposer.ts:50` consume
the `SceneTagMap` it produces (`pageComposer.ts:127` scores from it). So the Story Binder, Build a
binder, and the fill sheet's "Same scene" method all depend on it, exactly as `taggedCards.ts`'s
own header says. Track A caught this.

**It listed three other anon relations. There are six.** `model_versions`,
`pokemon_partner_groups` and `trainer_partners` were all missed, and `sets` was under-reported by
two columns, because the first sweep searched the kit and then assumed the apps went through it.
Two of those three reads live in the apps directly.

**It missed six function names** for the reason in section 4.

Every one of these misses was a grep that looked for the symbol it expected rather than for the
module's full export surface or the call template. All four failures are silent at runtime.

**A fifth, of a different kind.** The function return table said "measured live" while two of its
rows were read off a TypeScript annotation instead. A client type that names a subset of the
returned fields is not wrong as TypeScript and gives no hint that it is a subset, so the only way
to know a row shape is to look at the row. Section 3 now distinguishes what was read from the wire
from what was read from source, and nothing is called measured unless it was.

---

## 7. Where the tier policy lands, for the two contested items

**The tagged corpus is not Track A's to gate, and already is not.** `execute` on `tagged_cards` is
granted to service_role alone; an anon call returns "permission denied for function tagged_cards",
confirmed live by Track A. The only path is michi's own `theme-search` edge function, which checks
the entitlement ledger and forwards with the data project's secret key. So the data project already
enforces the guest and free half of the policy. "PRO and VIP receive the whole corpus" is a decision
made in `supabase/functions/theme-search/index.ts` and `src/lib/taggedCards.ts`, both Track B.
Changing it is application work on this side and blocks on nothing in the database.

**Alternates is a client feature, not only a table.** `tcgscan-app/src/lib/alternates.ts:69`
fetches `alternates.json` from the public browse bucket with no key, and `printingGroup()` at `:112`
is what powers "Not it? Add the right card below" on a scan result. Removing public access to
alternates removes the correction affordance for a misrecognized printing, which is core scanning
rather than a browsing perk. The table revoke and the bucket removal are both right; the client
work is larger than it looks and needs a replacement path first.

---

## 8. Done on the Track B side

- `tcgscan-app/src/lib/model-rollout.ts` no longer calls `get_scanner_rollout`. tsc and eslint
  clean. Track A can drop the function whenever it likes; installs that never take the update land
  on `DEFAULT_MODEL_SET` because the old path already fell through cache-then-default on any error.

---

## 9. The other games' theme search (tcgscan-data migrations 78 and 79)

Added 2026-10-15 for Lorcana and One Piece theme search. **Read from source, not measured**: 78 and
79 are staged and not live when this was written, so nothing in this section is a wire reading
(section 6 is why that distinction is kept). `npm run check:exposure` section 3c measures it once
they are, and until then reports "none enabled".

| Relation / function | Who reads it | Columns |
| --- | --- | --- |
| `theme_search_games` (78), the registry | anon, `select=*` in the exposure check | **exactly 10**: `game, label, type_label, type_groups, enabled, tools, cards, rules_version, published_at, updated_at` |
| | michi `src/lib/themeGames.ts` (`themeGamesCore.ts` `REGISTRY_SELECT`) | 6: `game, label, type_label, type_groups, enabled, tools` |
| `rpc/theme_search` (79) | kit 0.9.28 `searchThemes`, via michi's `theme-search` edge function or anon | **5**: `id, art_band, full_art, type_group, total_count` |
| `rpc/theme_facets` (79) | kit 0.9.28 `themeFacets` | 3: `facet, value, n`, with `facet` in `frame`, `type` |
| `card_themes` (78) | nobody: no client grant, RLS on with no policy | none. Holds captions and tags; `theme_search` reads it as definer |

Four notes.

**The registry is public forever.** Any column added to `theme_search_games` is readable by anon the
moment it exists. The exposure check pins the 10 and calls an 11th a `LEAK` until it is reviewed and
added to `REGISTRY_COLS`. It must never hold a tag, caption, count per tag or any other private field.

**`theme_search` returns ids and rank fields, never a tag, caption, scene score or probability.** The
device maps the ids onto that game's public `catalog.json` and answers `rarity:`, `set:`, price and
`have:` itself. Anon is clamped to `free_theme_depth` rows at offset 0 with the true `total_count`,
whatever the theme; the free `theme:forest` is free only through michi's edge function.

**The edge function's `theme_search` branch (M1).** `supabase/functions/theme-search/index.ts`
forwards `{ rpc: 'theme_search', ... }` with the data project's secret key and `x-rl-identity`.
`supabase/functions/theme-search/rules.ts` (pure; tested by `src/lib/themeSearchRules.test.ts`)
decides what may be forwarded: only theme_search's nine parameters (`p_game, p_fields, p_words,
p_frame, p_types, p_group, p_limit, p_offset, p_lang`), a registry-shaped `p_game`, `p_limit`
clamped to 1000, at least one `theme` field. `isForestOnly` reads `theme` AND `art` fields, so an
`art` term cannot ride free beside a forest one. A disabled game answers `[]` on this path too: the
forwarded call carries `x-rl-identity`, so the registry row binds it.

**Which games are served is the registry's call, not michi's.** `CardBrowse` unlocks `themeSearch`,
passes `themeServer` and shows the `Theme: forest` button only for a game whose row is `enabled`.
Any read failure, an unknown game or a malformed row leaves the game locked (fail closed), and a
typed `theme:` there shows a "not available" line under the game picker rather than the plans page.

## 10. Pokemon's theme toolbar (tcgscan-data migrations 80 and 81, kit 0.9.29)

Added 2026-10-16. **Read from source, not measured**: 80 (the `_search_cards_v2` shadow) and 81
(the cut-over) are staged and not live when this was written. `npm run check:exposure` sections 3
and 3d measure it on every run, before and after 81.

| Relation / function | Who reads it | Columns |
| --- | --- | --- |
| `rpc/search_cards` (81), themed, with the toolbar fields | kit 0.9.29 `searchCards` (`themeTools`), via michi's `theme-search` edge function or anon | **21, unchanged**: the same `RETURNS TABLE` as 70 (section 3) |
| `rpc/_search_cards_v2` (80, dropped by 81) | nobody: EXECUTE is service_role only | the same 21 |
| `theme_search_games` row `pokemon` | michi `src/lib/themeGames.ts` | the 6 of section 9; `tools` is the toolbar switch |

Three notes.

**The rank facts never leave.** After 81 a themed `search_cards` joins `card_themes` for
`art_band`, `scene`, `full_art`, `full_art_prob`, `showcase_rank` and `type_order`, aliased `ct_*`.
They order and filter the rows inside the function; the output stays the 21 columns, so Pokemon
rows carry no `type_group`, `full_art` or `art_band` (the kit groups by the card's own types). The
exposure check pins the 21 (`SEARCH_CARDS_COLS`) on a themed call and on a call with every toolbar
field, and calls any extra key a `LEAK`. Returning `type_group` later is a DROP + CREATE migration
with its own review, and must add the column to `SEARCH_CARDS_COLS` in the same change.

**The toolbar is three more `p_fields` keys, nothing else.** `frame` (`full` / `window`), `tgroup`
(one per chip, a registry `type_groups` key) and `group` (`type`). Before 81 `search_cards` answers
them with `else true`, so they change nothing; the edge function forwards `p_fields` as it is, so
no edge change is needed. The clamp holds with them (section 3d), and `group` only orders a
privileged caller's rows; a free caller's best N are grouped on the device.

**`tools`, not `enabled`, turns it on.** `CardBrowse` passes `themeTools` to the Pokemon browser
only while the `pokemon` registry row has `tools = true` (`publish_theme.ps1 -Game pokemon -Tools
on|off`). `enabled` says whether `theme_search` serves a game, and Pokemon never uses
`theme_search`. A failed or missing registry read is Pokemon without the toolbar.
