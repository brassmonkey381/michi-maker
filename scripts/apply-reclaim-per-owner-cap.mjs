/**
 * Apply supabase/migrations/20260920120000_reclaim_per_owner_cap.sql: the over-cap reclaim reads
 * each owner's Free cap instead of one table-wide number.
 *
 * THE MIGRATION CLAIMS TO BE BEHAVIOUR-PRESERVING, SO THE CHECKS PROVE THAT:
 *   1. BEFORE: how many binders and collections the nightly jobs WOULD archive right now, computed
 *      with the old single-number rule in a plain SELECT (nothing is archived by this script).
 *   2. Apply the migration (create-or-replace only; safe to re-run).
 *   3. AFTER: the same count, computed with the new per-owner helper. It must equal BEFORE.
 *   4. All four reclaim functions now reference the per-owner helper and none still calls the
 *      table-wide one. The function bodies are read back from the catalog.
 *   5. THE NEW FUNCTIONS PLAN. plpgsql plans lazily, so a bad reference hides until the cron
 *      fires; each nightly function is executed inside a DO block that raises at the end (the
 *      repo's probe pattern), which forces the plan and rolls back anything it archived. The user-initiated pair is called the
 *      same way and must refuse with 'not signed in' (no JWT here), which is them working.
 *
 * Run through apply-reclaim-per-owner-cap.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260920120000_reclaim_per_owner_cap.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
function fail(msg) {
  console.log(`FAILED: ${msg}`);
  process.exitCode = 2;
  throw new Error(msg);
}
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

/** What the nightly jobs would archive, as a SELECT. `binderCap` / `collCap` are SQL expressions. */
const wouldArchive = (binderCap, collCap) => `
  with lapsed_m as (
    select e.user_id from public.entitlements e where e.product in ('tier_pro','tier_vip')
     group by e.user_id
    having bool_and(e.expires_at is not null and e.expires_at <= now())
       and max(e.expires_at) + interval '3 days' < now()
  ), rb as (
    select b.owner_id, row_number() over (partition by b.owner_id order by b.updated_at desc) rn
      from public.binders b join lapsed_m l on l.user_id = b.owner_id
     where b.archived_at is null and coalesce(b.is_demo, false) = false
  ), lapsed_t as (
    select e.user_id from public.entitlements e where e.product in ('tcgscan_pro','tcgscan_vip')
     group by e.user_id
    having bool_and(e.expires_at is not null and e.expires_at <= now())
       and max(e.expires_at) + interval '3 days' < now()
  ), rc as (
    select c.user_id as owner_id, row_number() over (partition by c.user_id order by c.updated_at desc) rn
      from public.collections c join lapsed_t l on l.user_id = c.user_id
     where c.archived_at is null
  )
  select (select count(*) from rb where rn > ${binderCap}) as binders,
         (select count(*) from rc where rn > ${collCap})   as collections;`;

try {
  console.log('[1/5] BEFORE: what the nightly jobs would archive under the single-number rule...');
  const [before] = await sql(wouldArchive('public.free_binder_cap()', 'public.free_collection_cap()'));
  console.log(`      binders ${before.binders}, collections ${before.collections}`);

  console.log('[2/5] Applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('      applied');

  console.log('[3/5] AFTER: the same count under the per-owner rule (must match)...');
  const [after] = await sql(wouldArchive('public.free_binder_cap_for(owner_id)', 'public.free_collection_cap_for(owner_id)'));
  console.log(`      binders ${after.binders}, collections ${after.collections}`);
  if (String(after.binders) !== String(before.binders) || String(after.collections) !== String(before.collections)) {
    fail('the per-owner rule would archive a different number than before; this migration must not change behaviour');
  }

  console.log('[4/5] The four reclaim functions read the per-owner helper...');
  const defs = await sql(`
    select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('reclaim_over_cap','reclaim_all_over_cap','reclaim_over_cap_collections','reclaim_all_over_cap_collections');`);
  if (defs.length !== 4) fail(`expected 4 reclaim functions, found ${defs.length}`);
  for (const d of defs) {
    const per = /free_(binder|collection)_cap_for\(/.test(d.def);
    const old = /free_(binder|collection)_cap\(\)/.test(d.def);
    console.log(`      ${d.proname.padEnd(36)} per-owner: ${per ? 'yes' : 'NO'}   table-wide: ${old ? 'STILL' : 'no'}`);
    if (!per || old) fail(`${d.proname} is not on the per-owner helper`);
  }

  console.log('[5/5] Forcing the plans, with every write rolled back...');
  // The repo's probe pattern: a DO block that RAISES at the end. The exception aborts the block's
  // transaction, so whatever the functions archived is undone, and the message carries the result.
  try {
    await sql(`do $$ declare b integer; c integer; begin
      b := public.reclaim_all_over_cap();
      c := public.reclaim_all_over_cap_collections();
      raise exception 'PROBE-OK binders=% collections=%', b, c;
    end $$;`);
    fail('the probe block returned without raising; its writes may have been kept');
  } catch (e) {
    const m = /PROBE-OK binders=(\d+) collections=(\d+)/.exec(String(e.message));
    if (!m) throw e;
    console.log(`      both nightly functions planned and ran; rolled back (would archive ${m[1]} binders, ${m[2]} collections)`);
    if (m[1] !== String(before.binders) || m[2] !== String(before.collections)) {
      fail('the functions would archive a different number than the BEFORE count');
    }
  }
  for (const call of ["perform public.reclaim_over_cap('{}'::uuid[])", "perform public.reclaim_over_cap_collections('{}'::text[])"]) {
    try {
      await sql(`do $$ begin ${call}; raise exception 'PROBE-UNEXPECTED'; end $$;`);
      fail(`${call} returned without raising`);
    } catch (e) {
      if (!/not signed in/.test(String(e.message))) throw e;
    }
  }
  console.log("      both user-initiated functions refuse with 'not signed in', as they should here");

  console.log('');
  console.log('DONE. Reclaim now holds each account to its own Free cap. Nothing was archived by this script.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${String(e.message).slice(0, 600)}`);
    process.exitCode = 3;
  }
}
