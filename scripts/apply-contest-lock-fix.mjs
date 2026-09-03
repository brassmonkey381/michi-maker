/**
 * REPAIR the contest edit lock, and PROVE IT THE WAY THE APP MEETS IT.
 *
 * The guard has now been wrong twice, and both times for the same underlying reason: a SQL
 * expression that has to be valid in branches it will not take. First `coalesce(new.x, old.x)`
 * (the unassigned record), then a CASE over three tables' columns (`record "v_row" has no field
 * "page_id"`). 20260903190000 removes the class of failure by going through jsonb instead of
 * record fields, and short-circuits before any of it whenever nothing is locked.
 *
 * WHY THE SECOND BUG SHIPPED. The previous version of this script probed as the service role, and
 * the guard's second line lets the service role straight through. It exercised the early return
 * and proved nothing at all about the code below it. So the probe here runs as role
 * `authenticated`, with a real uid in request.jwt.claims, which is the only way any of the guard's
 * body is reachable — and it checks BOTH states that matter:
 *
 *   · nothing locked  → every write the app makes must SUCCEED (this is what was broken)
 *   · binder locked   → the same writes must be REFUSED with 42501 (this is the feature)
 *
 * Everything runs inside a DO block ending in RAISE EXCEPTION, so the transaction rolls back and
 * the report arrives as the error message. No cleanup step, because there is nothing to clean up —
 * which matters here, since a locked binder deliberately refuses the deletes a cleanup would use.
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
  '20260903190000_contest_lock_guard_fix2.sql',
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
  if (!res.ok) return { error: text };
  return { rows: text ? JSON.parse(text) : [] };
}

try {
  const [{ present }] = (
    await sql(`select count(*)::int as present from pg_proc where proname = 'contest_lock_guard';`)
  ).rows;
  if (present === 0) {
    console.log('The guard is not installed on this database, so it is not what is failing.');
    process.exit(0);
  }

  console.log('Step 1: replacing the guard...');
  const applied = await sql(readFileSync(MIGRATION, 'utf8'));
  if (applied.error) throw new Error(`could not replace the function: ${applied.error.slice(0, 300)}`);
  console.log('   ok');

  console.log('Step 2: probing as a real signed-in user (everything rolls back)...');
  const probe = await sql(`
    do $$
    declare
      v_orig   text := session_user;
      v_uid    uuid;
      v_binder uuid;
      v_page   uuid;
      v_page2  uuid;
      v_slot   uuid;
      v_out    text := '';
    begin
      -- Pick a real account BEFORE dropping to its role: auth.users is unreadable afterwards.
      select b.owner_id into v_uid
      from public.binders b group by b.owner_id order by count(*) desc limit 1;
      if v_uid is null then select id into v_uid from auth.users order by created_at limit 1; end if;
      if v_uid is null then raise exception 'no account on this database to probe with'; end if;

      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

      -- ── NOTHING LOCKED: every one of these must work ────────────────────────────────────
      insert into public.binders (owner_id, title) values (v_uid, 'lock fix probe')
        returning id into v_binder;
      v_out := v_out || E'\\n  [open] INSERT binders      : ok';

      insert into public.binder_pages (binder_id, position, rows, cols)
        values (v_binder, 0, 3, 3) returning id into v_page;
      v_out := v_out || E'\\n  [open] INSERT binder_pages : ok';

      insert into public.binder_slots (page_id, row_index, col_index)
        values (v_page, 0, 0) returning id into v_slot;
      v_out := v_out || E'\\n  [open] INSERT binder_slots : ok';

      update public.binder_pages set title = 'probe' where id = v_page;
      v_out := v_out || E'\\n  [open] UPDATE binder_pages : ok';

      update public.binders set title = 'probe renamed' where id = v_binder;
      v_out := v_out || E'\\n  [open] UPDATE binders      : ok';

      delete from public.binder_slots where id = v_slot;
      v_out := v_out || E'\\n  [open] DELETE binder_slots : ok';

      delete from public.binder_pages where id = v_page;
      v_out := v_out || E'\\n  [open] DELETE binder_pages : ok';

      -- A page to try the locked writes against.
      insert into public.binder_pages (binder_id, position, rows, cols)
        values (v_binder, 0, 3, 3) returning id into v_page2;

      -- ── LOCKED: the same writes must be refused ─────────────────────────────────────────
      -- contest_finalists has no client write policy, so the row goes in as the original role.
      perform set_config('role', v_orig, true);
      insert into public.contest_finalists
        (contest, category, binder_id, owner_id, seed, stage1_votes, votes_open_at, votes_close_at)
      values ('probe-contest', 'aesthetic', v_binder, v_uid, 1, 0, now(), now() + interval '1 day');
      perform set_config('role', 'authenticated', true);

      begin
        insert into public.binder_slots (page_id, row_index, col_index) values (v_page2, 1, 1);
        v_out := v_out || E'\\n  [lock] INSERT binder_slots : NOT REFUSED  <-- the lock does nothing';
      exception
        when sqlstate '42501' then
          v_out := v_out || E'\\n  [lock] INSERT binder_slots : refused, correct';
        when others then
          v_out := v_out || E'\\n  [lock] INSERT binder_slots : WRONG ERROR ' || sqlstate || ' ' || sqlerrm;
      end;

      begin
        delete from public.binder_pages where id = v_page2;
        v_out := v_out || E'\\n  [lock] DELETE binder_pages : NOT REFUSED  <-- the lock does nothing';
      exception
        when sqlstate '42501' then
          v_out := v_out || E'\\n  [lock] DELETE binder_pages : refused, correct';
        when others then
          v_out := v_out || E'\\n  [lock] DELETE binder_pages : WRONG ERROR ' || sqlstate || ' ' || sqlerrm;
      end;

      begin
        update public.binders set title = 'nope' where id = v_binder;
        v_out := v_out || E'\\n  [lock] UPDATE binders      : NOT REFUSED  <-- the lock does nothing';
      exception
        when sqlstate '42501' then
          v_out := v_out || E'\\n  [lock] UPDATE binders      : refused, correct';
        when others then
          v_out := v_out || E'\\n  [lock] UPDATE binders      : WRONG ERROR ' || sqlstate || ' ' || sqlerrm;
      end;

      perform set_config('role', v_orig, true);
      raise exception '%', v_out;
    end $$;
  `);

  const raw = probe.error ?? JSON.stringify(probe.rows);
  const report = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  const lines = report
    .split('\n')
    .filter((l) => l.includes('[open]') || l.includes('[lock]'))
    .map((l) => l.replace(/^.*?(\[(?:open|lock)\])/, '  $1'));

  console.log('');
  for (const l of lines) console.log(l);

  const openOk = lines.filter((l) => l.includes('[open]') && l.trim().endsWith(': ok')).length;
  const lockOk = lines.filter((l) => l.includes('[lock]') && l.includes('refused, correct')).length;
  const bad = lines.filter((l) => l.includes('NOT REFUSED') || l.includes('WRONG ERROR'));

  console.log('');
  if (openOk < 7 || lockOk < 3 || bad.length > 0) {
    console.log(`FAILED: ${openOk}/7 open writes succeeded, ${lockOk}/3 locked writes refused.`);
    if (lines.length === 0) console.log(report.slice(0, 1500));
    process.exit(1);
  }
  console.log(`All ${openOk} ordinary writes succeed and all ${lockOk} locked writes are refused.`);
  console.log('');
  console.log('DONE. Reload the app; binder creates, edits, duplicates and deletes work.');
} catch (e) {
  console.log('');
  console.log(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
