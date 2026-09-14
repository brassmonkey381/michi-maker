/**
 * Apply supabase/migrations/20260913120000_page_style.sql to the live app project and prove it:
 * binders gain a nullable jsonb `page_style` with an is-object check.
 *
 * Safe to re-run: add column if not exists, and the constraint is dropped and recreated. Nothing
 * else moves: the binder count is the same before and after and no binder gains a style.
 *
 * DDL goes through the management API with SUPABASE_ACCESS_TOKEN in the environment; the .ps1
 * wrapper in the session scratchpad loads it without printing it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260913120000_page_style.sql');

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
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

const COLUMN = `
  select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'binders' and column_name = 'page_style';`;

try {
  console.log('Step 1: what is there now...');
  const existing = await sql(COLUMN);
  if (existing.length && existing[0].data_type !== 'jsonb') {
    fail(`binders.page_style already exists as ${existing[0].data_type}, not jsonb. Stopping rather than guessing.`);
  }
  console.log(existing.length ? '  column already present as jsonb (re-run)' : '  no page_style column yet');
  const [{ n: before }] = await sql('select count(*)::int as n from public.binders;');
  console.log(`  binders on record: ${before}`);

  console.log('Step 2: apply the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  const after = await sql(COLUMN);
  if (!after.length || after[0].data_type !== 'jsonb') fail('column is not jsonb after apply');
  const con = await sql(`select 1 from pg_constraint where conname = 'binders_page_style_is_object';`);
  if (!con.length) fail('constraint binders_page_style_is_object is not on the table');
  console.log('  column and constraint present');

  console.log('Step 3: the constraint bites (in a rolled-back transaction)...');
  const probe = await sql(`
    do $$
    declare b uuid;
    begin
      select id into b from public.binders limit 1;
      if b is null then raise notice 'no binder to probe'; return; end if;
      update public.binders set page_style = '{"material":"stitched"}'::jsonb where id = b;
      update public.binders set page_style = null where id = b;
      begin
        update public.binders set page_style = '["x"]'::jsonb where id = b;
        raise exception 'array was accepted';
      exception when check_violation then null;
      end;
      raise exception 'ROLLBACK_PROBE';
    end $$;`).catch((e) => String(e.message));
  if (!String(probe).includes('ROLLBACK_PROBE')) fail(`probe did not roll back as expected: ${String(probe).slice(0, 200)}`);
  console.log('  object accepted, null accepted, array refused, all rolled back');

  console.log('Step 4: nothing else moved...');
  const [{ n: afterN }] = await sql('select count(*)::int as n from public.binders;');
  const [{ n: styled }] = await sql('select count(*)::int as n from public.binders where page_style is not null;');
  if (afterN !== before) fail(`binder count changed: ${before} -> ${afterN}`);
  if (styled !== 0) fail(`${styled} binders unexpectedly have a page_style`);
  console.log(`  binders: ${afterN}, styled: 0`);
  console.log('DONE: binders.page_style is live.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}
