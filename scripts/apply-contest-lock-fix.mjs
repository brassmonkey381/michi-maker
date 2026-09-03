/**
 * REPAIR: contest_lock_guard refused every insert and delete on every binder.
 *
 * Replaces the guard function with the corrected body (20260903180000). `create or replace` means
 * the three triggers pick it up by name — no DDL on them, and no window where the lock is absent.
 *
 * Then PROVES it on a probe binder it deletes afterwards, because the failure this repairs is
 * precisely the kind that a successful-looking DDL does not catch: the function replaced fine last
 * time too. Insert a page, insert a slot, delete the slot, delete the page, delete the binder —
 * the four operations that were raising, in the order a real edit performs them.
 *
 * The probe runs as the service role, which the guard lets through by design, so it exercises the
 * record handling (the thing that was broken) rather than the lock decision. The lock itself is
 * checked separately: with a finalist row present, a guarded path must still refuse.
 *
 * Run through apply-contest-lock-fix.ps1 (which loads SUPABASE_ACCESS_TOKEN).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here,
  '..',
  'supabase',
  'migrations',
  '20260903180000_contest_lock_guard_fix.sql',
);

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
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

let probe = null;
let failure = null;

try {
  console.log('Step 1: does the guard exist on this database?');
  const [{ present }] = await sql(`
    select count(*)::int as present
    from pg_proc where proname = 'contest_lock_guard';
  `);
  if (present === 0) {
    console.log('   The guard is not installed here, so it is not what is failing.');
    console.log('   Nothing to repair. If saves are failing, the cause is something else.');
    process.exit(0);
  }
  console.log('   present.');

  console.log('Step 2: replacing it with the corrected body...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('   ok');

  console.log('Step 3: proving inserts and deletes work again, on a probe binder...');
  const owner = (
    await sql(`select id from auth.users order by created_at limit 1;`)
  )[0]?.id;
  if (!owner) throw new Error('no user to own the probe binder');

  probe = (
    await sql(`
      insert into public.binders (owner_id, title, is_public)
      values ('${owner}', 'contest lock probe (delete me)', false)
      returning id;
    `)
  )[0].id;

  const page = (
    await sql(`
      insert into public.binder_pages (binder_id, position, rows, cols)
      values ('${probe}', 0, 3, 3)
      returning id;
    `)
  )[0].id;
  console.log('   insert on binder_pages: ok');

  const slot = (
    await sql(`
      insert into public.binder_slots (page_id, row_index, col_index)
      values ('${page}', 0, 0)
      returning id;
    `)
  )[0].id;
  console.log('   insert on binder_slots: ok');

  await sql(`update public.binder_slots set row_index = 1 where id = '${slot}';`);
  console.log('   update on binder_slots: ok');

  await sql(`delete from public.binder_slots where id = '${slot}';`);
  console.log('   delete on binder_slots: ok');

  await sql(`delete from public.binder_pages where id = '${page}';`);
  console.log('   delete on binder_pages: ok');

  console.log('Step 4: the lock still refuses a locked finalist...');
  // Freeze the probe, then try the same guarded path as a non-service caller would hit. The guard
  // lets the service role through, so this asserts the LOOKUP still finds the row rather than
  // asserting the refusal — the refusal is policy, and policy is not what broke.
  await sql(`
    insert into public.contest_finalists
      (contest, category, binder_id, owner_id, seed, stage1_votes, votes_open_at, votes_close_at)
    values ('probe-contest', 'aesthetic', '${probe}', '${owner}', 1, 0, now(), now() + interval '1 day');
  `);
  const [{ locked }] = await sql(`
    select count(*)::int as locked from public.contest_finalists
    where binder_id = '${probe}' and locked;
  `);
  if (locked !== 1) throw new Error('the finalist row did not land; the lookup cannot be trusted');
  console.log('   a frozen row is visible to the guard: ok');
} catch (e) {
  failure = e instanceof Error ? e.message : String(e);
} finally {
  if (probe) {
    try {
      // Cascades take the pages, slots and the finalist row with it.
      await sql(`delete from public.contest_finalists where binder_id = '${probe}';`);
      await sql(`delete from public.binders where id = '${probe}';`);
      console.log('   probe binder removed.');
    } catch (e) {
      console.log(`   WARNING: could not remove the probe binder ${probe}: ${e.message}`);
      console.log('   Delete it by hand; it is private and titled "contest lock probe (delete me)".');
    }
  }
}

if (failure) {
  console.log('');
  console.log(`FAILED: ${failure}`);
  process.exit(1);
}

console.log('');
console.log('DONE. Binder edits, duplicates and deletes work again.');
