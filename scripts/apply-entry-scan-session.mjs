/**
 * Apply supabase/migrations/20260829120000_entry_scan_session.sql: portfolio_entries.scan_session,
 * the review session that filed a lot, so a committed session is an exact set again.
 *
 * THE CHECKS THAT MATTER:
 *   2. Nullable, no default, no constraint. It is written by a fire-and-forget sync batch, and
 *      one rejected row stops the queue forever.
 *   3. An older client's insert still lands.
 *   4. CENSUS: how many scanned lots can be grouped into a session and how many predate this.
 *      The second number only ever shrinks in proportion, and a sessions screen has to say what
 *      it cannot show rather than quietly showing less than there is.
 *
 * Safe to re-run: idempotent DDL, read-only checks.
 *
 * Run through apply-entry-scan-session.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260829120000_entry_scan_session.sql',
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

  console.log('Step 2: the column, and that it cannot reject a row...');
  const [col] = await sql(`
    select is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'portfolio_entries'
      and column_name = 'scan_session';`);
  if (!col) fail('scan_session is missing');
  if (col.is_nullable !== 'YES') fail('scan_session is NOT NULL, which can poison a sync batch');
  if (col.column_default !== null) fail(`scan_session has a default (${col.column_default})`);
  const cons = await sql(`
    select c.conname from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'portfolio_entries'
      and exists (
        select 1 from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where a.attname = 'scan_session');`);
  if (cons.length) fail(`scan_session joined constraint(s): ${cons.map((c) => c.conname).join(', ')}`);
  console.log('  OK (nullable, no default, no constraints)');

  console.log('Step 3: an older client\'s insert still lands...');
  const legacy = await sql(`
    do $probe$
    declare v_user uuid; v_s text;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then raise exception 'PROBE-SKIP: every user already owns a collection'; end if;
      insert into public.collections (id, user_id, name) values ('probe-col-sess', v_user, 'probe');
      insert into public.portfolio_entries
          (id, collection_id, user_id, card_id, variant, condition, quantity)
        values ('probe-entry-sess', 'probe-col-sess', v_user, 'probe-card', 'Normal', 'Near Mint', 1);
      select scan_session into v_s from public.portfolio_entries
        where user_id = v_user and id = 'probe-entry-sess';
      if v_s is not null then raise exception 'PROBE-FAIL: scan_session defaulted to %', v_s; end if;
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(legacy).includes('PROBE-OK')) console.log('  OK (rolled back)');
  else if (String(legacy).includes('PROBE-SKIP')) console.log('  SKIPPED (no collection-less user to probe with)');
  else fail(`legacy insert probe: ${String(legacy).slice(0, 300)}`);

  console.log('Step 4: what can be grouped today...');
  const [c] = await sql(`
    select count(*) filter (where scanned_at is not null)::int as scanned,
           count(*) filter (where scan_session is not null)::int as in_session,
           count(distinct scan_session)::int as sessions
    from public.portfolio_entries;`);
  console.log(`  scanned lots: ${c.scanned}`);
  console.log(`     grouped into sessions: ${c.in_session} across ${c.sessions} session(s)`);
  console.log(`     predating session recording: ${c.scanned - c.in_session} (shown as ungrouped, never hidden)`);

  console.log('\nDONE. The next batched review files a session that can be acted on.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}
