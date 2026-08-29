/**
 * Apply supabase/migrations/20260828160000_scan_feedback_variant.sql: scan_feedback records the
 * FINISH a scan was filed as, and who said so.
 *
 * THE CHECKS THAT MATTER:
 *   2. Both columns exist, are nullable, have no default, and join no constraint. This table is
 *      written fire-and-forget from the device; a rejected insert loses training data for a scan
 *      that already happened and cannot be repeated.
 *   3. An insert that names neither column still lands (every client older than today).
 *   4. CENSUS of what has accumulated: rows carrying a USER-chosen finish are the labels the
 *      finish classifier needs, rows carrying a pricing default are the app's own guess, and the
 *      two must never be counted together.
 *
 * Safe to re-run: idempotent DDL, read-only checks.
 *
 * Run through apply-scan-feedback-variant.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260828160000_scan_feedback_variant.sql',
);

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

try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2: both columns, and that neither can reject an insert...');
  const cols = await sql(`
    select column_name, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'scan_feedback'
      and column_name in ('variant', 'variant_source') order by column_name;`);
  if (cols.length !== 2) fail(`expected 2 columns, found ${cols.map((c) => c.column_name).join(', ') || 'none'}`);
  for (const c of cols) {
    if (c.is_nullable !== 'YES') fail(`${c.column_name} is NOT NULL`);
    if (c.column_default !== null) fail(`${c.column_name} has a default (${c.column_default})`);
  }
  const cons = await sql(`
    select c.conname from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'scan_feedback'
      and exists (
        select 1 from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where a.attname in ('variant', 'variant_source'));`);
  if (cons.length) fail(`variant columns joined constraint(s): ${cons.map((c) => c.conname).join(', ')}`);
  console.log('  OK (both nullable, no defaults, no constraints)');

  console.log('Step 3: an older client\'s insert still lands...');
  const legacy = await sql(`
    do $probe$
    declare v_user uuid; v_variant text;
    begin
      select id into v_user from auth.users limit 1;
      if v_user is null then raise exception 'PROBE-SKIP: no users on this project'; end if;
      insert into public.scan_feedback (owner_id, picked_card_id, model_set)
        values (v_user, 'probe-card', 'probe');
      select variant into v_variant from public.scan_feedback where picked_card_id = 'probe-card';
      if v_variant is not null then raise exception 'PROBE-FAIL: variant defaulted to %', v_variant; end if;
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(legacy).includes('PROBE-OK')) console.log('  OK (rolled back)');
  else if (String(legacy).includes('PROBE-SKIP')) console.log('  SKIPPED (no user to probe with)');
  else fail(`legacy insert probe: ${String(legacy).slice(0, 300)}`);

  console.log('Step 4: what has accumulated so far...');
  const [c] = await sql(`
    select count(*)::int as rows,
           count(*) filter (where variant_source = 'user')::int as labels,
           count(*) filter (where variant_source = 'default')::int as guesses,
           count(*) filter (where variant is null)::int as silent
    from public.scan_feedback;`);
  console.log(`  scan_feedback rows: ${c.rows}`);
  console.log(`     USER-chosen finishes (labels): ${c.labels}`);
  console.log(`     pricing defaults (not labels):  ${c.guesses}`);
  console.log(`     no finish recorded:             ${c.silent}`);
  if (c.labels) {
    const by = await sql(`
      select variant, count(*)::int as n from public.scan_feedback
       where variant_source = 'user' group by variant order by n desc;`);
    for (const r of by) console.log(`       ${r.variant}: ${r.n}`);
  } else {
    console.log('     (none yet: labels start accruing once the app update ships)');
  }

  console.log('\nDONE. Every detailed add now leaves a finish label behind.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}
