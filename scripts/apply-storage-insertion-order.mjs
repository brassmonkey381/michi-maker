/**
 * Apply supabase/migrations/20260827200000_storage_insertion_order.sql: storage_units gains
 * insertion_order ('lifo' | 'fifo'), so a stack can say whether the first card scanned ended up
 * at the bottom of the pile or the top of it.
 *
 * THE CHECKS THAT MATTER:
 *   2. The column exists, is NOT NULL, defaults 'lifo', and the CHECK rejects anything else.
 *   3. THE DEFAULT REACHED EVERY EXISTING ROW (no nulls). Rows written before today were
 *      recorded under the first-scanned-is-the-bottom rule, so the default has to preserve that
 *      meaning rather than leave piles already on a shelf unlabelled. It does NOT demand that
 *      every unit reads lifo: a deliberate "front to back" answer is the point of the migration,
 *      and one can land mid-run (see the note at step 3).
 *   4. An old client's insert (no insertion_order column) still lands and still reads 'lifo'.
 *
 * Safe to re-run: idempotent DDL.
 *
 * Run through apply-storage-insertion-order.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260827200000_storage_insertion_order.sql');

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

  console.log('Step 2: the column, its default and its CHECK...');
  const [col] = await sql(`
    select is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'storage_units'
      and column_name = 'insertion_order';`);
  if (!col) fail('insertion_order is missing');
  if (col.is_nullable !== 'NO') fail('insertion_order is nullable');
  if (!String(col.column_default).includes('lifo')) fail(`default is ${col.column_default}`);
  const bad = await sql(`
    do $probe$
    begin
      update public.storage_units set insertion_order = 'sideways'
       where id = (select id from public.storage_units limit 1);
      raise exception 'PROBE-ACCEPTED';
    exception
      when check_violation then raise exception 'PROBE-REJECTED';
      when others then raise;
    end $probe$;`).catch((e) => String(e.message));
  if (String(bad).includes('PROBE-REJECTED')) console.log('  OK (default lifo, CHECK rejects other values)');
  else if (String(bad).includes('PROBE-ACCEPTED')) fail('the CHECK let an invalid value through');
  else console.log('  OK (default lifo; no rows to probe the CHECK with)');

  console.log('Step 3: every existing unit still means what it meant...');
  // WHAT THIS CAN AND CANNOT ASSERT. The risk being guarded is a column default that silently
  // reinterprets piles already on a shelf, and the evidence for that is a row the default did not
  // reach: NOT NULL plus a default means every pre-existing row now says 'lifo', which is what
  // they were recorded under.
  //
  // It deliberately does NOT assert that every unit reads 'lifo'. A person answering "front to
  // back" is the entire point of this migration, and a device that had been unable to push that
  // answer (no column to push it into) lands it the moment step 1 runs, which is inside this
  // script. The first run failed exactly there: a real 'fifo' answer arrived between step 1 and
  // step 3, and the applier reported its own success as a failure.
  const [census] = await sql(`
    select count(*)::int as total,
           count(*) filter (where insertion_order = 'lifo')::int as lifo,
           count(*) filter (where insertion_order = 'fifo')::int as fifo,
           count(*) filter (where insertion_order is null)::int as unset
    from public.storage_units;`);
  if (census.unset) fail(`${census.unset} unit(s) have no order at all, so the default did not apply`);
  console.log(`  OK (${census.total} unit(s): ${census.lifo} lifo, ${census.fifo} fifo)`);
  if (census.fifo) {
    // Named rather than merely counted: a stack that fills the other way is a claim about a
    // physical pile, and the only person who can confirm it is the one holding the box.
    const chosen = await sql(`
      select name, kind from public.storage_units where insertion_order = 'fifo' order by name;`);
    for (const u of chosen) {
      console.log(`     "${u.name}" (${u.kind}) fills FRONT TO BACK, someone answered that deliberately`);
    }
  }

  console.log('Step 4: an old client’s insert still lands...');
  const legacy = await sql(`
    do $probe$
    declare v_user uuid; v_order text;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then
        raise exception 'PROBE-SKIP: every user already owns a collection (see apply-storage-units)';
      end if;
      insert into public.collections (id, user_id, name) values ('probe-col-order', v_user, 'probe');
      insert into public.storage_units (id, user_id, collection_id, name, kind)
        values ('probe-unit-order', v_user, 'probe-col-order', 'probe', 'stack');
      select insertion_order into v_order from public.storage_units
        where user_id = v_user and id = 'probe-unit-order';
      if v_order <> 'lifo' then raise exception 'PROBE-FAIL: defaulted to %', v_order; end if;
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(legacy).includes('PROBE-OK')) console.log('  OK (rolled back)');
  else if (String(legacy).includes('PROBE-SKIP')) console.log('  SKIPPED (no collection-less user to probe with)');
  else fail(`legacy insert probe: ${String(legacy).slice(0, 300)}`);

  console.log('\nDONE. Stacks can now record whether they fill bottom-up or top-down.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}
