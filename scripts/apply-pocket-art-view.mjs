/**
 * Apply supabase/migrations/20261027120000_pocket_art_view.sql to the live app project and prove
 * it: binder_slots gains a nullable text `art_view` ('card' | 'window'), and binder_pages.art_view
 * admits 'card' as well. The binder-wide choice is page_style.artView (jsonb), no column.
 *
 * Safe to re-run: add column if not exists, constraints dropped and recreated. Nothing else moves:
 * slot and page counts are the same before and after and no row gains a value.
 *
 * DDL goes through the management API; the token comes from the environment or the secrets file
 * (scripts/lib/michi.mjs), never printed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { appSql, fail, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261027120000_pocket_art_view.sql');

const COLUMN = `
  select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'binder_slots' and column_name = 'art_view';`;

step(1, 'what is there now');
const before = await appSql(COLUMN);
if (before.length && before[0].data_type !== 'text') fail(`binder_slots.art_view exists as ${before[0].data_type}, not text. Stopping.`);
console.log(`  binder_slots.art_view ${before.length ? 'already present' : 'absent'}`);
const [{ s }] = await appSql('select count(*)::int as s from public.binder_slots;');
const [{ p }] = await appSql('select count(*)::int as p from public.binder_pages;');
const [{ pv }] = await appSql('select count(*)::int as pv from public.binder_pages where art_view is not null;');
console.log(`  slots: ${s}, pages: ${p}, pages with a view: ${pv}`);

step(2, 'apply the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
const after = await appSql(COLUMN);
if (after.length !== 1 || after[0].data_type !== 'text') fail('binder_slots.art_view is not a text column after apply');
const [{ c }] = await appSql(`select count(*)::int as c from pg_constraint where conname in ('binder_slots_art_view_known', 'binder_pages_art_view_known');`);
if (c !== 2) fail(`expected both known-values checks, found ${c}`);
console.log('  column and both checks present');

step(3, 'nothing else moved');
const [{ s2 }] = await appSql('select count(*)::int as s2 from public.binder_slots;');
const [{ p2 }] = await appSql('select count(*)::int as p2 from public.binder_pages;');
const [{ sv }] = await appSql('select count(*)::int as sv from public.binder_slots where art_view is not null;');
const [{ pv2 }] = await appSql('select count(*)::int as pv2 from public.binder_pages where art_view is not null;');
if (s2 !== s) fail(`slot count changed: ${s} -> ${s2}`);
if (p2 !== p) fail(`page count changed: ${p} -> ${p2}`);
if (sv !== 0) fail(`${sv} slots unexpectedly have a value`);
if (pv2 !== pv) fail(`pages with a view changed: ${pv} -> ${pv2}`);
console.log(`  slots: ${s2} (with a value: 0), pages: ${p2} (with a view: ${pv2}, as before)`);
console.log('DONE: binder_slots.art_view is live, and a page may say card.');
