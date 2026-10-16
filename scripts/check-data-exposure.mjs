/**
 * IS THE BOUNDARY STILL THERE? — run: `npm run check:exposure`
 *
 * The data project serves the catalog to an anonymous caller holding the publishable key that
 * ships in our own web bundle. On 2026-09-11 that stopped being a blanket grant: `public.cards`
 * went definer, the relation grant was replaced with nineteen named columns, and twenty functions
 * were re-specced as SECURITY DEFINER so their bodies keep reading the columns their callers no
 * longer can. This script watches both halves of that, because BOTH can fail silently:
 *
 *   the MOAT reopens   — one `grant select on public.cards to anon` inside the next view respec,
 *                        or a create-or-replace that drops a function's security clause (Postgres
 *                        assigns all unspecified properties on replace, so an ALTER-applied
 *                        clause expires on the next unrelated migration).
 *   the CLIENTS break  — a column dropped from the grant yields an EMPTY GRID, not an error,
 *                        because tcgscan-browse maps rows with `?? ''` on every field and every
 *                        fetcher returns [] on a non-2xx.
 *
 * THE RULE THIS SCRIPT IS BUILT ON: ASSERT A ROW SHAPE, NEVER A STATUS CODE. Every silent failure
 * found during the lock-down week was an HTTP 200 — the empty grid, the [] swallowed client-side
 * from a timing-out RPC, the 200-with-null from card_alternates. A detector that checked status
 * codes would have caught none of them. So a read passes only when it is 200 AND has rows AND
 * carries every column the client's mapper destructures.
 *
 * IT ALSO REFUSES TO PASS WHEN IT CANNOT TELL. The previous version treated every non-2xx as
 * "protected", so a 429 from the rate limiter, a statement timeout or a total outage scored a
 * perfect run. There is a positive control now: if the nineteen contract columns do not come back
 * with a row, the run is VOID and exits non-zero without judging anything else.
 *
 * Read-only. Remediation lives in the DATA project; this only detects.
 * Exit 0 = boundary intact and clients working. Exit 1 = a leak, a break, or an inconclusive run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1';

/** The nineteen columns anon is granted, derived from shipped client code and verified live.
 *  See docs/CLIENT-COLUMN-CONTRACT.md. `browse_visible` is FILTER-ONLY and never selected, which
 *  is why it has its own check: a contract read off `select=` lists misses it, and a WHERE on a
 *  column you cannot select is 42501, which takes out the set drill-down and both feeds. */
const CARD_COLS = [
  'id', 'name', 'number', 'rarity', 'card_type', 'set_id', 'set_name', 'series', 'release_date',
  'illustrator', 'types', 'stage', 'hp', 'evolution_stage_index', 'evolves_from', 'evolution_line',
  'jumbo', 'language',
];

/** Column → what an outsider gets from it. Must be refused on every relation below. */
const CLOSED = {
  scene_caption: 'the artwork descriptions themselves',
  scene_tags: 'the theme vocabulary and every card it applies to — all of theme search',
  art_text: 'captions and tags concatenated — reproduces theme search by itself, and a GENERATED '
    + 'column carries its own grant, so revoking its sources does nothing for it',
  embedding: 'the artwork similarity vectors — Find Similar, rebuilt offline',
  color_art: 'the palette vectors behind colour search',
  color_noborder: 'the palette vectors, full-card region',
  full_art_score: 'the full-art scoring',
};
const CARD_RELATIONS = ['cards', 'cards_en', 'cards_jp'];

/** Functions that WRITE. Anon must not hold EXECUTE on any of them. Checked by NAME rather than
 *  by convention, because "looks like a writer" is a convention and not a guarantee: five of the
 *  eleven found open on 2026-09-11 had been revoked from anon/authenticated but never from
 *  PUBLIC, so anon still held EXECUTE by default. set_browse_visible could hide the catalog. */
const WRITERS = [
  'set_browse_visible', 'update_card_colors', 'update_card_colors_jp', 'update_card_color_neighbors',
  'update_card_embeddings_jp', 'set_scan_flow', 'promote_scan_flow', 'set_similarity_live',
];

/**
 * Functions to probe WITH THEIR REAL ARGUMENTS, so the refusal is proved rather than assumed.
 *
 * THE FIRST VERSION OF THIS SCRIPT CHECKED EVERY WRITER WITH `{}` AND PASSED ALL OF THEM, and it
 * was proving nothing: PostgREST answers an argument list it cannot resolve with 404 PGRST202
 * BEFORE any privilege check runs, so a writer wide open to anon looks identical to one revoked.
 * Six of the eight scored a vacuous pass. Same lesson as everywhere else this week — a 404 is
 * unproven, and only a 42501 is a measurement — and it is worth noting the detector caught it in
 * itself only because two helper functions happened to be checked with real arguments.
 *
 * Anything without a signature here is still probed, but a 404 is now reported as INCONCLUSIVE
 * rather than counted as protected. Fill these in as signatures are confirmed.
 */
const SIGNED = {
  tag_rank_weights: { p_tags: ['scene:snow', 'mood:cold'] },
  rarity_boost: { p_rarity: 'Illustration Rare' },
  // The writers, from pg_proc. Values are deliberately harmless — empty arrays and objects, a mode
  // that matches nothing — because the privilege check fires BEFORE the body runs. If any of these
  // ever answers anything but 401/42501, that is a real finding and not a probe artefact.
  set_browse_visible: { p_ids: [] },
  update_card_colors: { p: {} },
  update_card_colors_jp: { p: {} },
  update_card_color_neighbors: { p: {} },
  update_card_embeddings_jp: { p: {} },
  set_scan_flow: { p_mode: '__probe__', p_channel: '__probe__', p_flow: {}, p_note: 'exposure probe' },
  promote_scan_flow: { p_mode: '__probe__', p_note: 'exposure probe' },
  set_similarity_live: { p_model_version: '__probe__' },
  upsert_candidate_embeddings: { p_model_version: '__probe__', p: {}, p_language: 'en' },
  ensure_candidate_embedding_index: { p_model_version: '__probe__' },
};

/**
 * SCORING PARITY, WITHOUT HOLDING A SINGLE TAG.
 *
 * The theme scoring moved into the database on 2026-09-11, and with it went the only copy of the
 * arithmetic this repo could test. So the gap is real: someone edits the SQL, nothing on this side
 * notices, and binders quietly change composition. The data session offered a golden fixture of 20
 * cards' real tags to close it, committed to both repos.
 *
 * THIS IS THE SAME CHECK WITHOUT THE TAGS. A fixture needs tags only if this side recomputes the
 * score; it does not, and should not — a second implementation kept in sync by hand is the drift
 * risk rather than the mitigation. What it needs is (card, theme) -> the numbers the server
 * produced, and those pin the arithmetic just as tightly: the three rows of the first case share
 * the same two hits and differ only in tag RANK, so a change to the rank curve moves them.
 *
 * THE ONE FALSE POSITIVE is a tag republish or a change to the rank rule, both of which move these
 * legitimately. That is why the failure text says so rather than claiming drift: re-bless from a
 * run once you know which, do not edit a number to make a red run green.
 *
 * RE-BLESSED 2026-09-12 for tcgscan-data c11a9ae, which widened the rank rule to count EVERY
 * namespaced tag rather than six of them. Worth reading before assuming the old numbers were fine:
 * the previous rule skipped a non-matching tag WITHOUT advancing the rank counter, so a scoreable
 * tag sitting behind skipped ones was promoted to a weight the publisher never gave it. On 2,245
 * of 2,248 cards the weights were not the published ranking at all. These five moved because the
 * arithmetic was corrected, not because it broke: 509987 and 117892 did not move, and the two
 * properties each case exists to pin still hold.
 *
 * RE-BLESSED 2026-10-16 for the Pokemon tag publish of 2026-10-15 (20,498 tag records, tags
 * reordered on republish): 567424 went 1.90 -> 1.83 with the same two hits. No SQL changed:
 * score_cards_by_theme is untouched by migrations 77-81. The three ranks still differ (2.28 > 1.83 > 1.74).
 */
const PARITY = [
  {
    label: 'rank weighting (same two hits, three different ranks)',
    want: ['scene:forest', 'object:tree'], bonus: [], avoid: [],
    expect: [
      { id: '509987', score: 2.28, hits: ['scene:forest', 'object:tree'], qualifies: true },
      { id: '567424', score: 1.83, hits: ['object:tree', 'scene:forest'], qualifies: true },
      { id: '654525', score: 1.74, hits: ['object:tree', 'scene:forest'], qualifies: true },
    ],
  },
  {
    label: 'the bonus rule: two soft signals qualify nothing on their own',
    want: ['object:cannon'], bonus: ['scene:water', 'mood:calm'], avoid: [],
    expect: [
      { id: '117892', score: 1.30, hits: ['object:cannon'], qualifies: true },
      // 542892 IS THE SHARPEST PIN IN THE SET, so do not drop it for being the odd one. It has no
      // want hit at all, which makes `qualifies` false — and it is still RETURNED, because both
      // bonus tags matched and the rule only discards a hitless card when fewer than two did. A
      // scorer that returned null here, or that derived `qualifies` from "did we return it" rather
      // than from the hits, would pass every other assertion in this file and fail only this one.
      { id: '542892', score: 1.19, hits: [], qualifies: false },
    ],
  },
];

/**
 * THE OTHER GAMES' THEME SEARCH (tcgscan-data migrations 78 and 79). The registry is public and
 * tag-free BY DESIGN, so its shape is pinned exactly: any column added to it is readable by anon the
 * moment it exists, and is a LEAK here until someone has reviewed it and added it to this list.
 */
const REGISTRY_COLS = [
  'game', 'label', 'type_label', 'type_groups', 'enabled', 'tools', 'cards', 'rules_version',
  'published_at', 'updated_at',
];
/** theme_search's five contract columns: ids and rank fields, never a tag, caption or score. */
const THEME_SEARCH_COLS = ['id', 'art_band', 'full_art', 'type_group', 'total_count'];
const THEME_FACET_COLS = ['facet', 'value', 'n'];
const THEME_FACETS = ['frame', 'type'];
/** Tried in order until one has more hits than the free depth, so the clamp can be seen working. */
const GAME_THEMES = ['forest', 'water', 'sky'];

/**
 * search_cards' 21 output columns (`RETURNS TABLE`, tcgscan-data migration 70; unchanged by the
 * Pokemon parity cut-over, migration 81). After 81 a THEMED call joins `card_themes` for its rank
 * facts (`ct_band`, `ct_scene`, `ct_full`, `ct_fap`, `ct_rank`, `ct_type_order`); those order the
 * rows and must never leave. Any other key on a themed row is a LEAK until it is reviewed here.
 */
const SEARCH_CARDS_COLS = [
  'id', 'name', 'number', 'rarity', 'card_type', 'set_id', 'set_name', 'series', 'release_date',
  'illustrator', 'types', 'stage', 'hp', 'evolution_stage_index', 'evolves_from', 'evolution_line',
  'jumbo', 'language', 'cur', 'score', 'total_count',
];
/** Pokemon's toolbar chip used by the 3d probe when the registry row is not readable. */
const POKEMON_TOOLBAR_TYPE = 'Fire';

/** Dropped on 2026-09-11. A 200 here means something was put back. */
const DROPPED = ['find_similar_by_color', 'get_scanner_rollout', 'set_scanner_rollout'];

function publishableKey() {
  const file = path.join(ROOT, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.startsWith('EXPO_PUBLIC_CATALOG_API_KEY=')) return line.slice(line.indexOf('=') + 1).trim();
    }
  }
  return process.env.EXPO_PUBLIC_CATALOG_API_KEY ?? '';
}

const key = publishableKey();
if (!key) {
  console.error('FAILED: EXPO_PUBLIC_CATALOG_API_KEY not in .env or the environment (exit 1)');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
const leaks_broken_unsure_count = () => problems.filter((p) => p.kind !== 'HEADROOM').length;
const notes = [];
let checks = 0;

function fail(kind, what, detail) { problems.push({ kind, what, detail }); }
function ok(what, detail) { checks++; notes.push(`  ok   ${what}${detail ? `   ${detail}` : ''}`); }

async function get(pathAndQuery) {
  const res = await fetch(`${API}/${pathAndQuery}`, { headers });
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body, rows: Array.isArray(body) ? body : null };
}
async function rpc(fn, payload) {
  const res = await fetch(`${API}/rpc/${fn}`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body, rows: Array.isArray(body) ? body : null };
}

/** A client read passes only if 200 AND rows AND every named column present on row 0. */
function expectShape(res, what, cols) {
  checks++;
  if (res.status !== 200) return fail('BROKEN', what, `HTTP ${res.status} ${String(res.body?.message ?? '').slice(0, 70)}`);
  if (!res.rows?.length) return fail('BROKEN', what, '200 with ZERO ROWS — the silent failure this script exists for');
  const missing = cols.filter((c) => !(c in res.rows[0]));
  if (missing.length) return fail('BROKEN', what, `missing column(s): ${missing.join(', ')}`);
  notes.push(`  ok   ${what}   ${res.rows.length} row(s)`);
}

/**
 * The same check, for a call that is known to fail COLD and pass warm.
 *
 * The two colour RPCs sit close to the 3s statement timeout: measured 780 to 2084ms warm, and
 * 3.1 to 3.5s on a first call, where they are killed with SQLSTATE 57014. A single attempt makes
 * this script flaky and a silent retry hides a real user-facing fault, so it does neither: a
 * retry that succeeds is reported as HEADROOM, which is a warning about the margin rather than a
 * claim that the grant is broken. Two failures in a row is a genuine break.
 */
async function expectShapeWarm(call, what, cols) {
  const first = await call();
  if (first.status === 200 && first.rows?.length) return expectShape(first, what, cols);
  const second = await call();
  if (second.status === 200 && second.rows?.length) {
    checks++;
    const detail = String(first.body?.message ?? `HTTP ${first.status}`).slice(0, 60);
    fail('HEADROOM', what, `failed cold, passed warm — ${detail}`);
    return;
  }
  expectShape(second, what, cols);
}

// ---------------------------------------------------------------- 0. POSITIVE CONTROL
// Without this a total outage scores a perfect run: every leak check would "refuse" and pass.
console.log('0. positive control');
const control = await get(`cards?select=${CARD_COLS.join(',')}&limit=1`);
if (control.status !== 200 || !control.rows?.length) {
  console.error(`\nVOID: the contract columns did not come back (HTTP ${control.status}, `
    + `${control.rows?.length ?? 0} rows). The server is unreachable, rate-limiting, or the grant `
    + `is broken — either way NOTHING below can be trusted, so no result is reported.`);
  console.error('\nFAILED: inconclusive run (exit 1)');
  process.exit(1);
}
const missingContract = CARD_COLS.filter((c) => !(c in control.rows[0]));
if (missingContract.length) {
  fail('BROKEN', 'the client column contract', `anon lost: ${missingContract.join(', ')}`);
} else {
  ok('all 19 contract columns readable', `${CARD_COLS.length} selected + browse_visible below`);
}

// ---------------------------------------------------------------- 1. CLIENTS STILL WORK
console.log('1. the clients still work');
// browse_visible is filter-only. This is the check that would have caught the drill-down break.
expectShape(await get(`cards?select=id,name&browse_visible=is.true&limit=2`),
  'browse_visible as a FILTER (set drill-down, both feeds)', ['id', 'name']);
expectShape(await get('sets?select=id,name,series,card_count,logo_url&limit=1'), 'sets (kit)', ['id', 'name', 'series', 'card_count', 'logo_url']);
expectShape(await get('sets?select=name,code,symbol_url&limit=1'), 'sets (app set symbols)', ['name', 'code', 'symbol_url']);
expectShape(await get('prices?select=date,variant,market_price,avg_sales_price,quantity&limit=1'), 'prices', ['date', 'variant', 'market_price']);
expectShape(await get('model_versions?select=public_version,published_at,dataset_version&limit=1'), 'model_versions', ['public_version']);
expectShape(await get('pokemon_partner_groups?select=members&order=id&limit=1'), 'pokemon_partner_groups (ordered by id)', ['members']);
expectShape(await get('trainer_partners?select=name,signature,pokemon,associates,tokens&limit=1'), 'trainer_partners', ['name', 'signature', 'tokens']);
expectShape(await get('search_config?select=free_theme_depth&limit=1'), 'search_config', ['free_theme_depth']);

// ---------------------------------------------------------------- 2. THE DEFINER FLIP HELD
// These functions read columns their caller cannot. A row back means the security clause is still
// on; 42501 means a create-or-replace dropped it, which is the failure that expires silently.
console.log('2. the definer flip held (these read what the caller cannot)');
const plain = await rpc('search_cards', { p_words: ['pikachu'], p_fields: [], p_compares: [], p_facets: {}, p_limit: 5, p_offset: 0 });
expectShape(plain, 'search_cards', ['id', 'name', 'cur', 'total_count']);
expectShape(await rpc('search_facets', { p_words: ['pikachu'], p_fields: [], p_compares: [], p_facets: {} }), 'search_facets', ['facet', 'value', 'n']);
expectShape(await rpc('card_detail', { p_ids: ['219233'] }), 'card_detail', ['id', 'evolves_from', 'evolution_line']);
expectShape(await rpc('find_similar', { p_card_id: '219233', p_limit: 5 }), 'find_similar (reads embedding)', ['id', 'name', 'image_url', 'similarity']);
expectShape(await rpc('find_similar_weighted', { p_card_ids: ['219233'], p_weights: [1.0], p_limit: 5 }), 'find_similar_weighted', ['id', 'similarity']);
await expectShapeWarm(() => rpc('search_by_color', { p_region: 'art', p_l: 50, p_a: 10, p_b: 10, p_limit: 5, p_lambda: 0.5, p_lang: ['en', 'ja'] }), 'search_by_color (reads color_art)', ['product_id']);
await expectShapeWarm(() => rpc('search_by_colors', { p_region: 'art', p_colors: [[50, 10, 10, 1]], p_limit: 5, p_lang: ['en', 'ja'] }), 'search_by_colors', ['product_id']);
expectShape(await rpc('get_scan_flows', {}), 'get_scan_flows', ['mode', 'channel', 'flow']);
// The theme scoring that replaced the corpus download (michi's Story Binder and the two binder
// sheets). It must WORK, and it must not hand back a tag the caller did not send.
const WANT = ['scene:forest', 'object:tree'];
const themeScored = await rpc('score_cards_by_theme', { p_want: WANT, p_bonus: [], p_avoid: [], p_limit: 5 });
expectShape(themeScored, 'score_cards_by_theme', ['id', 'name', 'rarity', 'score', 'hits', 'qualifies']);
checks++;
{
  const extra = [...new Set((themeScored.rows ?? []).flatMap((r) => r.hits ?? []))].filter((t) => !WANT.includes(t));
  if (extra.length) fail('LEAK', 'score_cards_by_theme returned unsent tags', `${extra.slice(0, 4).join(', ')} — the corpus is walking out through hits`);
  else notes.push('  ok   score_cards_by_theme returns no tag the caller did not send');
}
expectShape(await rpc('similar_by_tags', { p_card_id: '124115', p_limit: 5 }), 'similar_by_tags', ['id', 'score']);

// The correction flow: card_alternates is the ONLY way to look-alikes now that the table is
// revoked and the bulk file is deleted. Checked from a MEMBER id, because a scan can land on one
// and a member lookup returning null was a live hole on 2026-09-11.
const altCanonical = await rpc('card_alternates', { p_card_id: '107055' });
expectShape(altCanonical, 'card_alternates by canonical id', ['id', 'name', 'number', 'set_name', 'source', 'hint']);
const altMember = await rpc('card_alternates', { p_card_id: '123634' });
expectShape(altMember, 'card_alternates by MEMBER id', ['id', 'name', 'hint']);
checks++;
if (altCanonical.rows?.length && altMember.rows?.length) {
  // The invariant: two group-mates must resolve to the same set of cards. This is enforced inside
  // a database function no test on this side can see, so if it regresses this is the only notice.
  const a = new Set([...altCanonical.rows.map((r) => String(r.id)), '107055']);
  const b = new Set([...altMember.rows.map((r) => String(r.id)), '123634']);
  const same = a.size === b.size && [...a].every((x) => b.has(x));
  if (!same) fail('BROKEN', 'group-mates resolve to the same group', `canonical [${[...a].sort()}] vs member [${[...b].sort()}]`);
  else if (altCanonical.rows.some((r) => String(r.id) === '107055')) fail('BROKEN', 'card_alternates excludes the card itself', 'the picker would offer the card as a printing of itself');
  else notes.push('  ok   group-mates resolve to the same group, self excluded');
}

// ---------------------------------------------------------------- 3. THE METER STILL METERS
console.log('3. the meter still meters');
const depthRow = await get('search_config?select=free_theme_depth&limit=1');
const depth = Number(depthRow.rows?.[0]?.free_theme_depth ?? 0);
const themed = await rpc('search_cards', { p_words: [], p_fields: [{ key: 'theme', value: 'fire' }], p_compares: [], p_facets: {}, p_limit: 50, p_offset: 0 });
checks++;
if (themed.status !== 200 || !themed.rows?.length) {
  fail('BROKEN', 'themed search', `HTTP ${themed.status}, ${themed.rows?.length ?? 0} rows`);
} else if (!depth) {
  fail('INCONCLUSIVE', 'free_theme_depth', 'could not be read, so the clamp cannot be judged');
} else if (themed.rows.length !== depth) {
  // MORE than depth is the one that costs money: the meter has inverted and theme search is free.
  fail(themed.rows.length > depth ? 'LEAK' : 'BROKEN', 'the themed clamp',
    `asked for 50, got ${themed.rows.length}, free_theme_depth is ${depth}`);
} else if (!(Number(themed.rows[0].total_count) > depth)) {
  fail('BROKEN', 'the upsell', `total_count ${themed.rows[0].total_count} does not exceed the ${depth} shown, so "+N more" disappears`);
} else {
  ok('themed search clamps and still reports the true total', `${themed.rows.length} of ${themed.rows[0].total_count}`);
}
if (themed.rows?.length) {
  checks++;
  const extraThemed = [...new Set(themed.rows.flatMap((r) => Object.keys(r)))].filter((k) => !SEARCH_CARDS_COLS.includes(k));
  if (extraThemed.length) fail('LEAK', 'themed search_cards returned an unreviewed column', `${extraThemed.join(', ')}: only the ${SEARCH_CARDS_COLS.length} search_cards columns may leave`);
  else notes.push(`  ok   themed search_cards returns its ${SEARCH_CARDS_COLS.length} columns only`);
}

// ---------------------------------------------------------------- 3b. THE SCORING HAS NOT DRIFTED
console.log('3b. the scoring matches what it produced when it was written');
for (const c of PARITY) {
  const res = await rpc('score_cards_by_theme', { p_want: c.want, p_bonus: c.bonus, p_avoid: c.avoid, p_limit: 200 });
  checks++;
  if (res.status !== 200 || !res.rows?.length) {
    fail('BROKEN', `parity: ${c.label}`, `HTTP ${res.status}, ${res.rows?.length ?? 0} rows`);
    continue;
  }
  const byId = new Map(res.rows.map((r) => [String(r.id), r]));
  const bad = [];
  for (const e of c.expect) {
    const got = byId.get(e.id);
    if (!got) { bad.push(`${e.id} absent`); continue; }
    if (Math.abs(Number(got.score) - e.score) > 0.0005) bad.push(`${e.id} score ${Number(got.score).toFixed(4)} != ${e.score}`);
    if ((got.hits ?? []).join('|') !== e.hits.join('|')) bad.push(`${e.id} hits [${(got.hits ?? []).join(',')}] != [${e.hits.join(',')}]`);
    if (Boolean(got.qualifies) !== e.qualifies) bad.push(`${e.id} qualifies ${got.qualifies} != ${e.qualifies}`);
  }
  // THE INPUTS GO IN THE FAILURE, not just in this file. The moment this fails is the moment
  // someone has to decide whether the SQL regressed or the tagging was republished, and they
  // cannot re-derive the number without the arrays that produced it. Making them open the source
  // to find out is how a red run gets edited green.
  const inputs = `want [${c.want.join(', ')}]`
    + (c.bonus.length ? ` bonus [${c.bonus.join(', ')}]` : '')
    + (c.avoid.length ? ` avoid [${c.avoid.join(', ')}]` : '');
  if (bad.length) fail('DRIFT', `parity: ${c.label}`, `${bad.slice(0, 3).join('; ')}\n      inputs: ${inputs}`);
  else notes.push(`  ok   parity: ${c.label}`);
  await pause(250);
}

// ---------------------------------------------------------------- 3c. THE GAME METER METERS
// The other games' theme search: `theme_search` / `theme_facets` for each game the registry has
// enabled. Called as anon, so the clamp must hold whatever the theme (the free forest is free on
// michi's edge function, never on the bare RPC).
console.log("3c. the other games' theme search meters, and returns ids only");
const registry = await get('theme_search_games?select=*');
// Until migration 78 is live the registry is not in the API at all. That is a state, not a fault:
// nothing is enabled, so there is nothing to meter. Section 4 reads the same flag for card_themes.
const registryLive = !(registry.status === 404 && registry.body?.code === 'PGRST205');
checks++;
if (!registryLive) {
  notes.push('  ok   theme_search_games not deployed yet (78 not live): none enabled');
  console.log('    none enabled: theme_search_games is not deployed yet (78 not live)');
} else if (registry.status !== 200 || !registry.rows) {
  fail('INCONCLUSIVE', 'theme_search_games', `HTTP ${registry.status} ${String(registry.body?.message ?? '').slice(0, 70)}`);
} else {
  if (!registry.rows.length) {
    notes.push('  ok   theme_search_games is empty: none enabled (row shape unprovable until a row exists)');
  } else {
    const keys = Object.keys(registry.rows[0]);
    const extra = keys.filter((k) => !REGISTRY_COLS.includes(k));
    const missing = REGISTRY_COLS.filter((k) => !keys.includes(k));
    if (extra.length) fail('LEAK', 'theme_search_games has an unreviewed column', `${extra.join(', ')}: anon reads it; review it, then add it to REGISTRY_COLS`);
    else if (missing.length) fail('BROKEN', 'theme_search_games lost a column', missing.join(', '));
    else notes.push(`  ok   theme_search_games has exactly its ${REGISTRY_COLS.length} public columns`);
  }
  const enabled = registry.rows.filter((r) => r.enabled === true).map((r) => String(r.game));
  // Said on the section line as well: notes are printed only on a clean run.
  console.log(`    ${enabled.length ? `enabled: ${enabled.join(', ')}` : 'none enabled'} (${registry.rows.length} registry row(s))`);
  if (!enabled.length && registry.rows.length) notes.push(`  ok   theme_search_games: none enabled (${registry.rows.length} row(s))`);
  for (const game of enabled) {
    checks++;
    if (!depth) {
      fail('INCONCLUSIVE', `theme_search ${game}`, 'free_theme_depth could not be read, so the clamp cannot be judged');
      continue;
    }
    let hit = null;
    let last = null;
    for (const theme of GAME_THEMES) {
      const res = await rpc('theme_search', { p_game: game, p_fields: [{ key: 'theme', value: theme }], p_limit: 50, p_offset: 0 });
      last = res;
      await pause(250);
      if (res.status === 200 && res.rows?.length && Number(res.rows[0].total_count) > depth) { hit = { theme, res }; break; }
    }
    if (!hit) {
      fail('BROKEN', `theme_search ${game}`, `no theme of ${GAME_THEMES.join('/')} has more than ${depth} hits `
        + `(last: HTTP ${last?.status}, ${last?.rows?.length ?? 0} rows), so the meter has nothing to clamp`);
      continue;
    }
    const { theme, res } = hit;
    const extraCols = [...new Set(res.rows.flatMap((r) => Object.keys(r)))].filter((k) => !THEME_SEARCH_COLS.includes(k));
    if (extraCols.length) fail('LEAK', `theme_search ${game} returned more than ids`, `${extraCols.join(', ')}: only ${THEME_SEARCH_COLS.join(', ')} may leave`);
    else if (res.rows.length > depth) fail('LEAK', `theme_search ${game} clamp`, `theme:${theme} asked for 50, got ${res.rows.length}, free_theme_depth is ${depth}`);
    else if (res.rows.length < depth) fail('BROKEN', `theme_search ${game} clamp`, `theme:${theme} got ${res.rows.length} of ${res.rows[0].total_count}, free_theme_depth is ${depth}`);
    else ok(`theme_search ${game} clamps and reports the true total`, `theme:${theme} ${res.rows.length} of ${res.rows[0].total_count}`);

    const facets = await rpc('theme_facets', { p_game: game, p_fields: [{ key: 'theme', value: theme }] });
    await pause(250);
    checks++;
    if (facets.status !== 200 || !facets.rows?.length) {
      fail('BROKEN', `theme_facets ${game}`, `HTTP ${facets.status}, ${facets.rows?.length ?? 0} rows`);
    } else {
      const extraF = [...new Set(facets.rows.flatMap((r) => Object.keys(r)))].filter((k) => !THEME_FACET_COLS.includes(k));
      const oddFacet = [...new Set(facets.rows.map((r) => String(r.facet)))].filter((f) => !THEME_FACETS.includes(f));
      if (extraF.length) fail('LEAK', `theme_facets ${game} returned more than counts`, extraF.join(', '));
      else if (oddFacet.length) fail('LEAK', `theme_facets ${game} returned an unknown facet`, `${oddFacet.join(', ')}: only ${THEME_FACETS.join(', ')} are reviewed`);
      else ok(`theme_facets ${game} returns facet, value, n only`, `${facets.rows.length} row(s)`);
    }
  }
}

// ---------------------------------------------------------------- 3d. POKEMON'S TOOLBAR
// Kit 0.9.29 `themeTools`: the toolbar rides on search_cards as extra p_fields of a THEMED query
// (`frame`, `tgroup` per chip, `group`=`type`). Before migration 81 search_cards ignores those keys;
// after it they filter on card_themes. Either way, as anon: 200, rows, the clamp holds (grouping is
// for privileged callers only, CP-2) and no rank fact leaves the database. Runs whatever the
// registry's `tools` flag says: the RPC answers these fields for anyone who sends them.
console.log("3d. Pokemon's theme toolbar on search_cards clamps and returns its columns only");
{
  const pokeRow = registryLive && registry.rows ? registry.rows.find((r) => r.game === 'pokemon') : undefined;
  const pokeGroups = Array.isArray(pokeRow?.type_groups) ? pokeRow.type_groups.map((g) => String(g?.key ?? '')) : [];
  const chip = pokeGroups.includes(POKEMON_TOOLBAR_TYPE) || !pokeGroups.length ? POKEMON_TOOLBAR_TYPE : pokeGroups[0];
  console.log(`    pokemon registry row: ${pokeRow ? `tools ${pokeRow.tools === true ? 'on' : 'off'}` : 'absent'}; probing frame:full tgroup:${chip} group:type`);
  const tool = await rpc('search_cards', {
    p_words: [],
    p_fields: [{ key: 'theme', value: 'fire' }, { key: 'frame', value: 'full' }, { key: 'tgroup', value: chip }, { key: 'group', value: 'type' }],
    p_compares: [], p_facets: {}, p_limit: 50, p_offset: 0,
  });
  await pause(250);
  checks++;
  if (tool.status !== 200 || !tool.rows?.length) {
    fail('BROKEN', 'themed search_cards with the toolbar fields', `HTTP ${tool.status} ${String(tool.body?.message ?? '').slice(0, 60)}, ${tool.rows?.length ?? 0} rows`);
  } else {
    const extraTool = [...new Set(tool.rows.flatMap((r) => Object.keys(r)))].filter((k) => !SEARCH_CARDS_COLS.includes(k));
    if (extraTool.length) fail('LEAK', 'search_cards with the toolbar fields returned an unreviewed column', `${extraTool.join(', ')}: only the ${SEARCH_CARDS_COLS.length} search_cards columns may leave`);
    else if (!depth) fail('INCONCLUSIVE', 'the toolbar clamp', 'free_theme_depth could not be read, so the clamp cannot be judged');
    else if (tool.rows.length > depth) fail('LEAK', 'the toolbar clamp', `theme:fire frame:full tgroup:${chip} group:type asked for 50, got ${tool.rows.length}, free_theme_depth is ${depth}`);
    else ok('the Pokemon toolbar fields keep the clamp and the 21 columns', `${tool.rows.length} of ${tool.rows[0].total_count}`);
  }
}

// ---------------------------------------------------------------- 4. THE MOAT IS CLOSED
console.log('4. the moat is closed');
for (const relation of CARD_RELATIONS) {
  for (const column of Object.keys(CLOSED)) {
    const res = await get(`${relation}?select=${column}&limit=1`);
    checks++;
    if (res.status === 200 && res.rows?.length && column in res.rows[0]) {
      fail('LEAK', `${relation}.${column}`, CLOSED[column]);
    } else if (res.status === 200) {
      // 200 with no rows tells us nothing about the grant. Do not score it as protected.
      fail('INCONCLUSIVE', `${relation}.${column}`, '200 with no rows — cannot tell closed from empty');
    }
    await pause(350); // the data server rate-limits; this is not a race
  }
}
const altTable = await get('alternates?select=reason,difficulty,hint,max_distance&limit=1');
checks++;
if (altTable.status === 200 && altTable.rows?.length) fail('LEAK', 'public.alternates', 'the confusability map: which cards the recognizer cannot tell apart, with its reasons');
else ok('public.alternates refused');
// Private tcgcsv tables: the shadow price table (tcgscan-data migration 67), the One Piece catalog
// (migration 68), Disney Lorcana (72), Riftbound (73) and Digimon (74). ANY grant to anon is wrong,
// including one RLS happens to hide: a 200 with zero rows means the grant exists and only a missing
// policy is holding. Only a 401/403 proves it is closed.
for (const [table, column] of [
  ['prices_tcgcsv', 'product_id'],
  ...['onepiece', 'lorcana', 'riftbound', 'digimon'].flatMap((g) => [[`${g}_sets`, 'id'], [`${g}_cards`, 'id'], [`${g}_sealed`, 'id']]),
  // The other games' theme rows, captions and tags included (tcgscan-data migration 78). No client
  // grant at all: theme_search reads it as definer and returns ids only.
  ['card_themes', 'product_id'],
]) {
  const res = await get(`${table}?select=${column}&limit=1`);
  checks++;
  if (table === 'card_themes' && !registryLive && res.status === 404) ok('card_themes not deployed yet (78 not live)');
  else if (res.status === 401 || res.status === 403) ok(`${table} refused (private table)`);
  else if (res.status === 200) fail('LEAK', `${table} is readable by anon`, 'a private table answered 200; the revoke did not hold');
  else fail('INCONCLUSIVE', `${table} could not be probed`, `HTTP ${res.status}: if 404, the table is not in the API schema cache yet`);
  await pause(250);
}

// ---------------------------------------------------------------- 5. NOBODY CAN WRITE
console.log('5. nobody anonymous can write');
let proved = 0;
for (const fn of [...new Set([...WRITERS, ...Object.keys(SIGNED)])]) {
  const res = await rpc(fn, SIGNED[fn] ?? {});
  checks++;
  if (res.status === 200) fail('LEAK', `${fn} RAN for an anonymous caller`, 'this writes');
  else if (res.status === 400) fail('LEAK', `${fn} is executable by anon`, 'it parsed our arguments, so only the argument list is stopping a caller');
  else if (res.status === 401 || res.status === 403) proved++;   // 42501, the real refusal
  else if (res.body?.code === 'PGRST202') {
    // Resolved before privileges are checked, so this says nothing about the grant.
    fail('INCONCLUSIVE', `${fn} could not be probed`, 'no signature known: add one to SIGNED, a 404 proves nothing');
  }
  await pause(250);
}
ok(`${proved} function(s) PROVED to refuse an anonymous caller (42501)`);
for (const fn of DROPPED) {
  const res = await rpc(fn, {});
  checks++;
  if (res.status === 200 || res.status === 400) fail('LEAK', `${fn} is back`, 'it was dropped on 2026-09-11');
  await pause(250);
}
ok(`${DROPPED.length} dropped functions are still gone`);

// ---------------------------------------------------------------- report
const leaks = problems.filter((p) => p.kind === 'LEAK');
const broken = problems.filter((p) => p.kind === 'BROKEN');
const unsure = problems.filter((p) => p.kind === 'INCONCLUSIVE');
const headroom = problems.filter((p) => p.kind === 'HEADROOM');
const drift = problems.filter((p) => p.kind === 'DRIFT');

if (!leaks_broken_unsure_count()) {
  if (headroom.length) {
    console.error('\nHEADROOM (not a failure, but the margin is thin):');
    for (const p of headroom) console.error(`  ${p.what}`.padEnd(52) + p.detail);
    console.error('  These sit near the 3s statement timeout. A user hitting one cold gets an empty');
    console.error('  result, because the client returns [] on any non-2xx.\n');
  }
  console.log(`\n${notes.join('\n')}`);
  console.log(`\nOK: ${checks} checks. The boundary holds and every shipped client read works.`);
  process.exit(0);
}
console.error('');
for (const [label, list] of [['LEAK', leaks], ['BROKEN', broken], ['DRIFT', drift], ['INCONCLUSIVE', unsure], ['HEADROOM', headroom]]) {
  if (!list.length) continue;
  console.error(`${label}:`);
  // A long label wraps rather than running into its detail, which is what made the first DRIFT
  // report read as "...three different ranks)509987 score 2.2800".
  for (const p of list) {
    const label2 = `  ${p.what}`;
    console.error(label2.length > 50 ? `${label2}\n      ${p.detail}` : label2.padEnd(52) + p.detail);
  }
  console.error('');
}
if (leaks.length) {
  console.error('A LEAK is fixed in the DATA project, not here. Read docs/CLIENT-COLUMN-CONTRACT.md');
  console.error('first: a bare revoke blanks browse and search for every user of BOTH apps, because');
  console.error('neither app holds a user session there and anon is the role every catalog request');
  console.error('arrives as. The view must stay definer and the twenty functions must keep their');
  console.error('security clause in the SAME migration that carries any grant change.\n');
}
if (drift.length) {
  console.error('DRIFT means score_cards_by_theme no longer returns what it did when these numbers');
  console.error('were recorded. Two causes, and they need opposite responses: the SQL changed, which');
  console.error('is a bug unless it was deliberate — binder composition moves with it; or the tagging');
  console.error('was republished, which is legitimate and means re-blessing the PARITY block from a');
  console.error('fresh run. Do NOT edit a number to make a red run green without knowing which.');
  console.error('');
}
if (broken.length) {
  console.error('A BREAK means a shipped client is reading nothing and showing an empty grid rather');
  console.error('than an error. Restoring the four relation grants and setting the view back to');
  console.error('security_invoker = true undoes the boundary; it is written out at the bottom of');
  console.error('tcgscan-data migration 59. The definer flips are harmless to leave in place.\n');
}
console.error(`FAILED: ${leaks.length} leak(s), ${broken.length} break(s), ${drift.length} drift, ${unsure.length} inconclusive (exit 1)`);
process.exit(1);
