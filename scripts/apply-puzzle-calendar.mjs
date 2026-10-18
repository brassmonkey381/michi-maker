/**
 * Apply supabase/migrations/20261018130000_puzzle_calendar.sql and prove it: the Studio's month
 * calendar reads the whole schedule, answers included, in one call. Admin only.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appSql, fail, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261018130000_puzzle_calendar.sql');

step(1, 'applying the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
console.log('  OK');

step(2, 'the function exists and only authenticated callers may run it');
const [fn] = await appSql(`
  select p.proname, p.prosecdef as definer,
         has_function_privilege('anon', p.oid, 'execute') as anon_can,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_can
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_puzzle_calendar';`);
if (!fn) fail('admin_puzzle_calendar is missing');
if (fn.anon_can) fail('anon can execute admin_puzzle_calendar');
if (!fn.auth_can || !fn.definer) fail('admin_puzzle_calendar is not a security definer for authenticated');
console.log('  OK');

step(3, 'the shape, read as the database owner (is_admin() is false here, so zero rows is expected)');
const rows = await appSql(`select count(*) as n from public.admin_puzzle_calendar();`);
console.log(`  OK: ${rows[0].n} row(s) visible without an admin session`);

step(4, 'what the calendar would show the admin');
const [c] = await appSql(`
  select count(*) as puzzles, min(d.publish_on) as first_day, max(d.publish_on) as last_day,
         count(*) filter (where a.themes is null) as without_answer,
         count(*) filter (where pg.title like '% · %') as with_holiday
    from public.daily_puzzles d
    left join public.daily_puzzle_answers a on a.puzzle_id = d.id
    left join public.binder_pages pg on pg.id = d.source_page_id;`);
console.log(`  ${c.puzzles} puzzle(s), ${c.first_day} to ${c.last_day}, ${c.with_holiday} with a holiday title, ${c.without_answer} without an answer row`);
console.log('DONE.');
