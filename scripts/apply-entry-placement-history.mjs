/**
 * Apply supabase/migrations/20261123120000_entry_placement_history.sql (TCG-040): a trigger logs a
 * card's old pocket whenever its placement changes, so a binder can be put back.
 *
 * Checks: row security on, the trigger present, and a probe inside a transaction that raises (so
 * it rolls back) after moving one row and counting its history rows. Nothing is left behind.
 * Safe to re-run. Run through apply-entry-placement-history.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261123120000_entry_placement_history.sql');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
  process.exit(2);
}

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

let step = 0;
try {
  step = 1;
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  step = 2;
  console.log('Step 2: row security and the trigger...');
  const [t] = await sql(`select relrowsecurity from pg_class where oid = 'public.entry_placement_history'::regclass;`);
  if (!t?.relrowsecurity) throw new Error('row level security is off');
  const trg = await sql(`select tgname from pg_trigger where tgname = 'portfolio_entries_placement_history' and not tgisinternal;`);
  if (trg.length !== 1) throw new Error('trigger missing');
  console.log('  OK');

  step = 3;
  console.log('Step 3: a probe move logs exactly one row (then rolls back)...');
  const probe = await sql(`
    do $p$
    declare v_id text; v_page int; v_n int;
    begin
      select id, storage_page into v_id, v_page from public.portfolio_entries where storage_page is not null limit 1;
      if v_id is null then raise exception 'NO_ROWS'; end if;
      update public.portfolio_entries set storage_page = v_page + 1000 where id = v_id;
      select count(*) into v_n from public.entry_placement_history
        where entry_id = v_id and new_storage_page = v_page + 1000;
      raise exception 'PROBE:%', v_n;
    end $p$;`).then(() => 'no exception').catch((e) => String(e.message));
  const m = String(probe).match(/PROBE:(\d+)/);
  if (String(probe).includes('NO_ROWS')) console.log('  SKIPPED (no placed rows to probe)');
  else if (!m || m[1] !== '1') throw new Error(`probe expected 1 history row, got ${m ? m[1] : probe}`);
  else console.log('  OK (1 row logged, rolled back)');

  console.log('DONE: placement history is on.');
} catch (e) {
  console.log(`FAILED at step ${step}: ${e.message}`);
  process.exit(10 + step);
}
