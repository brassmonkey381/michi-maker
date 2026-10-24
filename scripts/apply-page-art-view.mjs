/**
 * Apply supabase/migrations/20261024120000_page_art_view.sql to the live app project and prove it:
 * binder_pages gains a nullable text `art_view` with a known-values check.
 *
 * Safe to re-run: add column if not exists, and the constraint is dropped and recreated. Nothing
 * else moves: the page count is the same before and after and no page gains a value.
 *
 * DDL goes through the management API; the token comes from the environment or the secrets file
 * (scripts/lib/michi.mjs), never printed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { appSql, fail, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261024120000_page_art_view.sql');

const COLUMN = `
  select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'binder_pages' and column_name = 'art_view';`;

step(1, 'what is there now');
const before = await appSql(COLUMN);
if (before.length && before[0].data_type !== 'text') fail(`art_view exists as ${before[0].data_type}, not text. Stopping.`);
console.log(`  art_view ${before.length ? 'already present' : 'absent'}`);
const [{ p }] = await appSql('select count(*)::int as p from public.binder_pages;');
console.log(`  pages: ${p}`);

step(2, 'apply the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
const after = await appSql(COLUMN);
if (after.length !== 1 || after[0].data_type !== 'text') fail('art_view is not a text column after apply');
const [{ c }] = await appSql(`select count(*)::int as c from pg_constraint where conname = 'binder_pages_art_view_known';`);
if (c !== 1) fail('the known-values check is missing');
console.log('  column and check present');

step(3, 'nothing else moved');
const [{ p2 }] = await appSql('select count(*)::int as p2 from public.binder_pages;');
const [{ set }] = await appSql('select count(*)::int as set from public.binder_pages where art_view is not null;');
if (p2 !== p) fail(`page count changed: ${p} -> ${p2}`);
if (set !== 0) fail(`${set} pages unexpectedly have a value`);
console.log(`  pages: ${p2}, with a value: 0`);
console.log('DONE: binder_pages.art_view is live.');
