/**
 * MIC-068: page search tags. Migration: supabase/migrations/20261125130000_page_search_tags.sql
 *
 *   node scripts/apply-page-tags.mjs           rolled-back check (changes nothing)
 *   node scripts/apply-page-tags.mjs --apply   applies it, then checks what is live
 *
 * THE CHECK runs the whole migration (without its own begin/commit and without the cron block)
 * inside one transaction, exercises it, and ends by raising an exception that carries the results,
 * so Postgres rolls everything back. It proves:
 *   upd     a slot update puts its page on page_tag_queue
 *   del     a slot delete puts its page on page_tag_queue (what updated_at alone would miss)
 *   hit     a tag row makes search_binders find the binder by that tag
 *   hidden  the same tag stops matching once the page is private (MIC-070's gate holds)
 *   swept   page_tags_sweep() runs (how many visible pages it would queue on day one)
 * No page or binder content is printed, only booleans and counts.
 *
 * Nothing here calls Claude or spends anything. The schedule is not set by this script: the cron
 * block skips itself until the deploy script adds the vault secret.
 *
 * Run through state/apply-page-tags.ps1, which loads SUPABASE_ACCESS_TOKEN.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const NAME = '20261125130000_page_search_tags.sql';
const MIGRATION = existsSync(join(here, NAME)) ? join(here, NAME) : join(here, '..', 'supabase', 'migrations', NAME);
const APPLY = process.argv.includes('--apply');
const token = process.env.SUPABASE_ACCESS_TOKEN;

function fail(msg) {
  console.log(`FAILED: ${msg}`);
  process.exitCode = 2;
  throw new Error(msg);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

const file = readFileSync(MIGRATION, 'utf8');
const body = file.slice(0, file.indexOf('-- CRON BEGIN'));
const lines = body.split('\n');
const beginAt = lines.findIndex((l) => l.trim() === 'begin;');
const commitAt = lines.findLastIndex((l) => l.trim() === 'commit;');
if (beginAt < 0 || commitAt < beginAt) fail('the migration does not have the expected begin; ... commit; shape');
const inner = lines.slice(beginAt + 1, commitAt).join('\n');

const PROBE = `
do $probe$
declare
  pid uuid; bid uuid; pid2 uuid; sid uuid;
  ok_upd boolean; ok_del boolean; s_hit boolean; s_hidden boolean; swept integer;
begin
  select pg.id, pg.binder_id into pid, bid
    from public.binder_pages pg join public.binders b on b.id = pg.binder_id
   where b.is_public and b.removed_at is null and b.archived_at is null
     and not coalesce(b.is_demo, false) and not coalesce(b.hidden_from_feeds, false)
     and pg.is_public and not pg.moderation_hold
     and exists (select 1 from public.binder_slots s where s.page_id = pg.id)
   order by pg.id limit 1;
  if pid is null then raise exception 'MIC068_RESULT no visible page with slots to test'; end if;

  delete from public.page_tag_queue;
  update public.binder_slots set notes = notes where id = (select id from public.binder_slots where page_id = pid order by id limit 1);
  ok_upd := exists (select 1 from public.page_tag_queue where page_id = pid);

  select s.page_id, s.id into pid2, sid from public.binder_slots s
   where s.page_id is not null and s.page_id <> pid order by s.id limit 1;
  delete from public.page_tag_queue;
  delete from public.binder_slots where id = sid;
  ok_del := exists (select 1 from public.page_tag_queue where page_id = pid2);

  insert into public.page_search_tags (page_id, binder_id, terms, description, source_hash, model)
  values (pid, bid, array['zzmic068probe'], '', 'probe', 'probe');
  s_hit := exists (select 1 from public.search_binders('zzmic068probe', 100) r where r.binder_id = bid);
  update public.binder_pages set is_public = false where id = pid;
  s_hidden := not exists (select 1 from public.search_binders('zzmic068probe', 100) r where r.binder_id = bid);

  delete from public.page_tag_queue;
  swept := public.page_tags_sweep();
  raise exception 'MIC068_RESULT upd=% del=% hit=% hidden=% swept=%', ok_upd, ok_del, s_hit, s_hidden, swept;
end $probe$;`;

try {
  if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

  console.log('Step 1: rolled-back check (migration + probe in one transaction, then rolled back)...');
  const c = await sql(`begin;\n${inner}\n${PROBE}\nrollback;`);
  const m = c.text.match(/MIC068_RESULT ([^"\\]*)/);
  if (!m) fail(`the check did not report (HTTP ${c.status}): ${c.text.slice(0, 400)}`);
  console.log(`  ${m[1]}`);
  const r = Object.fromEntries(m[1].trim().split(/\s+/).map((kv) => kv.split('=')));
  for (const k of ['upd', 'del', 'hit', 'hidden']) if (r[k] !== 't') fail(`check "${k}" did not hold (${r[k] ?? 'missing'})`);
  console.log(`  ok: queue on update and delete, search by tag, hidden page gated. Day one would queue ${r.swept} page(s). Nothing was kept.`);

  const left = await sql(`select to_regclass('public.page_search_tags') is not null as t;`);
  if (!APPLY && /"t":\s*true/.test(left.text)) console.log('  note: page_search_tags already exists (applied before).');

  if (!APPLY) {
    console.log('DONE (check only). Re-run with -Apply to apply the migration.');
  } else {
    console.log('Step 2: applying the migration...');
    const a = await sql(file);
    if (!a.ok) fail(`apply returned ${a.status}: ${a.text.slice(0, 400)}`);
    console.log('  applied');

    console.log('Step 3: what is live...');
    const v = await sql(`
      select (select count(*) from pg_class where relname in ('page_search_tags','page_tag_queue','page_tag_runs') and relnamespace = 'public'::regnamespace)::int as tables,
             (select count(*) from pg_trigger where tgname like 'page_tags_%' and not tgisinternal)::int as triggers,
             (select position('page_search_tags' in pg_get_functiondef('public.search_binders(text,integer,bigint,timestamp with time zone,uuid)'::regprocedure)) > 0) as search_reads_tags,
             (select position('pg.is_public and not pg.moderation_hold' in pg_get_functiondef('public.search_binders(text,integer,bigint,timestamp with time zone,uuid)'::regprocedure)) > 0) as gated;`);
    if (!v.ok) fail(`verify returned ${v.status}: ${v.text.slice(0, 300)}`);
    const row = JSON.parse(v.text)[0] ?? {};
    console.log(`  tables ${row.tables}/3, triggers ${row.triggers}/6, search reads tags: ${row.search_reads_tags}, gated: ${row.gated}`);
    if (row.tables !== 3 || row.triggers !== 6 || !row.search_reads_tags || !row.gated) fail('the live schema is not what the migration describes');
    console.log('DONE: MIC-068 tables, triggers and search branch are live. Nothing is tagged until the function is deployed.');
  }
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}
