/**
 * MIC-070: search_binders' page-title branch must match only pages visitors can see.
 * Migration: supabase/migrations/20261125120000_search_page_titles_public_only.sql
 *
 *   node scripts/apply-search-public-pages.mjs           rolled-back check (changes nothing)
 *   node scripts/apply-search-public-pages.mjs --apply   applies it, then re-runs the probe
 *
 * THE PROBE: up to 150 public binders that hold a hidden page (private, or under moderation hold)
 * with a title of 4+ characters. Each hidden title is typed into search_binders. A "leak" is the
 * binder coming back when nothing visible explains it (its own title, description, the owner's
 * username, or a visible page's title). A "legit" hit is one that something visible explains.
 * Expected: leaks before > 0 (the bug), leaks after = 0, legit hits unchanged.
 *
 * The check runs inside one DO block that ends by raising an exception carrying the counts, so
 * Postgres rolls back the redefined function with it. No titles are printed, only counts.
 *
 * Run through state/apply-search-public-pages.ps1, which loads SUPABASE_ACCESS_TOKEN.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261125120000_search_page_titles_public_only.sql');
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
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const file = readFileSync(MIGRATION, 'utf8');
const fnDef = file.slice(file.indexOf('create or replace function public.search_binders('));
if (!fnDef.startsWith('create or replace function') || !fnDef.includes('pg.is_public and not pg.moderation_hold')) {
  fail('the migration file does not hold the expected search_binders definition');
}
if (fnDef.includes('$mig$')) fail('the function text contains $mig$, which this check uses as its quote');

const COUNT = (label) => `
  for r in select * from _p loop
    hit := exists (select 1 from public.search_binders(r.q, 100) s where s.binder_id = r.binder_id);
    legit := exists (
               select 1 from public.binders b join public.profiles p on p.id = b.owner_id
                where b.id = r.binder_id
                  and (b.title ilike public.like_pattern(r.q) or b.description ilike public.like_pattern(r.q)
                       or p.username ilike public.like_pattern(r.q)))
          or exists (
               select 1 from public.binder_pages v
                where v.binder_id = r.binder_id and v.is_public and not v.moderation_hold
                  and v.title ilike public.like_pattern(r.q));
    if hit and not legit then ${label}_leak := ${label}_leak + 1;
    elsif hit then ${label}_legit := ${label}_legit + 1; end if;
  end loop;`;

const probe = (withRedefine) => `
do $chk$
declare
  r record; hit boolean; legit boolean; probes int;
  before_leak int := 0; before_legit int := 0; after_leak int := 0; after_legit int := 0;
begin
  create temp table _p on commit drop as
    select distinct on (pg.binder_id) pg.binder_id, btrim(pg.title) as q
      from public.binder_pages pg
      join public.binders b on b.id = pg.binder_id
     where b.is_public and b.removed_at is null and b.archived_at is null
       and (not pg.is_public or pg.moderation_hold)
       and length(btrim(coalesce(pg.title, ''))) >= 4
     order by pg.binder_id, pg.id
     limit 150;
  select count(*) into probes from _p;
  ${COUNT('before')}
  ${withRedefine ? `execute $mig$${fnDef}$mig$;` : ''}
  ${COUNT('after')}
  raise exception 'MIC070_RESULT probes=% before_leak=% before_legit=% after_leak=% after_legit=%',
    probes, before_leak, before_legit, after_leak, after_legit;
end $chk$;`;

async function runProbe(withRedefine) {
  const r = await sql(probe(withRedefine));
  const m = r.text.match(/MIC070_RESULT probes=(\d+) before_leak=(\d+) before_legit=(\d+) after_leak=(\d+) after_legit=(\d+)/);
  if (!m) fail(`the probe did not report (HTTP ${r.status}): ${r.text.slice(0, 300)}`);
  const [probes, beforeLeak, beforeLegit, afterLeak, afterLegit] = m.slice(1).map(Number);
  return { probes, beforeLeak, beforeLegit, afterLeak, afterLegit };
}

try {
  if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

  console.log('Step 1: rolled-back check (redefine inside a transaction, probe, roll back)...');
  const c = await runProbe(true);
  console.log(`  hidden titled pages probed: ${c.probes}`);
  console.log(`  before: ${c.beforeLeak} leak(s), ${c.beforeLegit} legit hit(s)`);
  console.log(`  after:  ${c.afterLeak} leak(s), ${c.afterLegit} legit hit(s)`);
  if (c.afterLeak !== 0) fail('the fixed function still lets a hidden page title match');
  if (c.afterLegit !== c.beforeLegit) fail('the fix changed legit hits, which it must not');
  console.log('  ok: no leaks after, legit hits unchanged. Nothing was kept.');

  if (!APPLY) {
    console.log('DONE (check only). Re-run with -Apply to apply the migration.');
  } else {
    console.log('Step 2: applying the migration...');
    const a = await sql(file);
    if (!a.ok) fail(`apply returned ${a.status}: ${a.text.slice(0, 300)}`);
    console.log('  applied');

    console.log('Step 3: the live function has the gate...');
    const d = await sql(`select position('pg.is_public and not pg.moderation_hold' in pg_get_functiondef(p.oid)) > 0 as gated
                           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'search_binders';`);
    if (!d.ok || !/"gated":\s*true/.test(d.text)) fail(`search_binders is not gated: ${d.text.slice(0, 200)}`);
    console.log('  ok');

    console.log('Step 4: probe against the live function...');
    const l = await runProbe(false);
    console.log(`  ${l.afterLeak} leak(s), ${l.afterLegit} legit hit(s) over ${l.probes} probe(s)`);
    if (l.afterLeak !== 0) fail('a hidden page title still matches live');
    console.log('DONE: MIC-070 applied. Private and held page titles no longer match in Discover search.');
  }
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}
