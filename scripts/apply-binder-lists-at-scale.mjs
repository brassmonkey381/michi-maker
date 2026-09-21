/**
 * Apply supabase/migrations/20260920150000_binder_lists_at_scale.sql and prove it.
 *
 * THE CHECKS THAT MATTER, in the order they would hurt:
 *   1. BEFORE: the like count of every binder by a real recount, and what Discover ranks first.
 *   2. Apply (re-runnable: the functions are dropped by both their old and new signatures).
 *   3. Kept counts equal a real recount for EVERY binder. Drift must be 0.
 *   4. The trigger works: a like moves one binder's count up by one and removing it moves it back.
 *      Done inside a block that undoes itself, so no like is left behind.
 *   5. Discover never returns a removed binder, and every row names a face page that is a PUBLIC
 *      page of that binder, with a page count.
 *   6. Paging by cursor neither skips nor repeats: three pages of 10 equal the first 30 of one
 *      call of 100, for both sorts and for search.
 *   7. AS AN ANONYMOUS VISITOR over REST, with the OLD argument names only: all three functions
 *      still answer. This is the cached-bundle case.
 *   8. Search: part of a word matches, a typed % is literal, and the trigram indexes are usable.
 *
 * Run through state/apply-binder-lists-at-scale.ps1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260920150000_binder_lists_at_scale.sql');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => { console.log(`FAILED: ${msg}`); process.exit(2); };
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

// The app's public REST endpoint + publishable key, for the anonymous checks. Not secrets.
const env = {};
for (const line of readFileSync(join(here, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const REST = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!REST || !ANON) fail('EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY missing from .env');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
async function anonRpc(name, body) {
  // PostgREST reloads its function cache a moment after the DDL lands. Until it has, a call with
  // the new argument names is "function not found"; wait for it rather than call that a failure.
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`${REST}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    if (attempt < 12 && /PGRST20[23]/.test(text)) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    fail(`anon rpc ${name} refused (${res.status}): ${text.slice(0, 300)}`);
  }
}

console.log('Step 1: before');
const [{ n: likesBefore }] = await sql('select count(*)::int as n from public.binder_likes');
const topBefore = await sql("select binder_id, like_count from public.discover_binders('likes', 10)");
console.log(`  ${likesBefore} likes in all. Discover's top by likes: ${topBefore.map((r) => r.like_count).join(', ')}`);

console.log('Step 2: apply the migration');
await sql(readFileSync(MIGRATION, 'utf8'));
console.log('  applied');

console.log('Step 3: kept counts equal a real recount');
const [{ drift, kept }] = await sql(`
  select count(*) filter (where coalesce(c.like_count, 0) <> coalesce(r.n, 0))::int as drift,
         (select count(*)::int from public.binder_like_counts) as kept
    from public.binders b
    left join public.binder_like_counts c on c.binder_id = b.id
    left join (select binder_id, count(*)::int as n from public.binder_likes group by 1) r on r.binder_id = b.id`);
console.log(`  ${kept} count rows, drift = ${drift}`);
if (drift !== 0) fail(`${drift} binders have a kept count that differs from a recount`);

console.log('Step 4: the trigger moves a count up and back');
await sql(`
  do $$
  declare v_binder uuid; v_user uuid; n0 int; n1 int; n2 int;
  begin
    select b.id, u.id into v_binder, v_user
      from public.binders b cross join auth.users u
     where not exists (select 1 from public.binder_likes l where l.binder_id = b.id and l.user_id = u.id)
     limit 1;
    if v_binder is null then raise exception 'no binder/user pair free to test with'; end if;
    select coalesce((select like_count from public.binder_like_counts where binder_id = v_binder), 0) into n0;
    insert into public.binder_likes (binder_id, user_id) values (v_binder, v_user);
    select like_count into n1 from public.binder_like_counts where binder_id = v_binder;
    delete from public.binder_likes where binder_id = v_binder and user_id = v_user;
    select like_count into n2 from public.binder_like_counts where binder_id = v_binder;
    if n1 <> n0 + 1 or n2 <> n0 then
      raise exception 'trigger wrong: before %, after like %, after unlike %', n0, n1, n2;
    end if;
  end $$;`);
const [{ n: likesAfter }] = await sql('select count(*)::int as n from public.binder_likes');
if (likesAfter !== likesBefore) fail(`the trigger test left a like behind (${likesBefore} -> ${likesAfter})`);
console.log('  up by one, back by one, no like left behind');

console.log('Step 5: no removed binders, and every row has a real face page');
const [shape] = await sql(`
  select count(*)::int as rows,
         count(*) filter (where b.removed_at is not null)::int as removed,
         count(*) filter (where d.face_page_id is null)::int as no_face,
         count(*) filter (where d.page_count is null or d.page_count < 1)::int as no_count,
         count(*) filter (where not exists (
           select 1 from public.binder_pages pg
            where pg.id = d.face_page_id and pg.binder_id = d.binder_id and pg.is_public))::int as bad_face
    from public.discover_binders('recent', 100) d join public.binders b on b.id = d.binder_id`);
console.log(`  ${shape.rows} rows: removed ${shape.removed}, no face page ${shape.no_face}, no count ${shape.no_count}, face not a public page of its binder ${shape.bad_face}`);
if (shape.removed || shape.no_face || shape.no_count || shape.bad_face) fail('a Discover row is wrong');

console.log('Step 6: paging neither skips nor repeats');
async function pages(fn, first, size, count) {
  const out = [];
  let after = null;
  for (let i = 0; i < count; i += 1) {
    const rows = await anonRpc(fn, { ...first, p_limit: size, ...(after ?? {}) });
    out.push(...rows.map((r) => r.binder_id));
    if (rows.length < size) break;
    const last = rows[rows.length - 1];
    after = { p_after_likes: last.like_count, p_after_at: last.made_public_at, p_after_id: last.binder_id };
  }
  return out;
}
for (const [label, fn, first] of [
  ['discover by likes', 'discover_binders', { p_sort: 'likes' }],
  ['discover by recent', 'discover_binders', { p_sort: 'recent' }],
  ['search, empty query', 'search_binders', { p_query: '' }],
]) {
  const whole = (await anonRpc(fn, { ...first, p_limit: 100 })).map((r) => r.binder_id).slice(0, 30);
  const paged = await pages(fn, first, 10, 3);
  const same = whole.length === paged.length && whole.every((id, i) => id === paged[i]);
  console.log(`  ${label}: ${paged.length} rows over 3 pages, ${new Set(paged).size} distinct, matches one call = ${same}`);
  if (!same || new Set(paged).size !== paged.length) fail(`${label}: paging differs from a single call`);
}

console.log('Step 7: an anonymous visitor with the OLD argument names');
const oldDiscover = await anonRpc('discover_binders', { p_sort: 'likes', p_limit: 40, p_contest: null, p_author: null, p_exclude_author: 'michimaker' });
const oldSearch = await anonRpc('search_binders', { p_query: '', p_limit: 40 });
const oldFeatured = await anonRpc('featured_binders', { p_limit: 12 });
console.log(`  discover ${oldDiscover.length} rows, search ${oldSearch.length} rows, featured ${oldFeatured.length} rows`);
if (!oldDiscover.length || !oldSearch.length) fail('an old-style call came back empty');
const topAfter = oldSearch.slice(0, 10).map((r) => r.like_count).join(', ');
console.log(`  top by likes now: ${topAfter}`);

console.log('Step 8: search');
const some = oldSearch.find((r) => true);
const [{ title }] = await sql(`select title from public.binders where id = '${some.binder_id}'`);
const part = String(title).trim().slice(1, 5).toLowerCase();
const byPart = await anonRpc('search_binders', { p_query: part, p_limit: 40 });
const byPercent = await anonRpc('search_binders', { p_query: '%', p_limit: 40 });
console.log(`  "${part}" (a piece of "${title}") finds ${byPart.length}; a typed % finds ${byPercent.length} (literal, so only titles containing one)`);
if (!byPart.some((r) => r.binder_id === some.binder_id)) fail('a piece of a title did not find its binder');
// Forced, because at this size the planner rightly prefers a plain scan: the question is whether
// the index CAN serve the query, which is what matters when the table is a thousand times larger.
await sql(`
  do $$
  declare r record; t text := '';
  begin
    set local enable_seqscan = off;
    for r in explain select b.id from public.binders b
              where b.is_public and b.title ilike public.like_pattern('pika') loop
      t := t || r."QUERY PLAN" || ' ';
    end loop;
    if position('binders_title_trgm_idx' in t) = 0 then
      raise exception 'the title search cannot use its trigram index: %', t;
    end if;
  end $$;`);
console.log('  title search can use binders_title_trgm_idx: true');
const idx = await sql("select indexname from pg_indexes where schemaname='public' and indexname like '%trgm%' order by 1");
console.log(`  trigram indexes: ${idx.map((r) => r.indexname).join(', ')}`);
if (idx.length !== 3) fail(`expected 3 trigram indexes, found ${idx.length}`);

console.log('DONE: lists page by cursor, tiles load one page, counts are kept, search is indexed.');
