/**
 * Retire the per-puzzle binders from before the fortnight layout. Dry run by default; --apply writes.
 *
 *   node scripts/puzzles/retire-old-binders.mjs            (lists, writes nothing)
 *   node scripts/puzzles/retire-old-binders.mjs --apply
 *
 * WHY DELETE AND NOT ARCHIVE (2026-10-18). Until fill-queue wrote one binder per fortnight, every
 * puzzle had its own binder ("Daily Puzzle: forest + sky"), 26 of them by then, all private and
 * all spent. The account has no flag that simply hides a binder from its owner: `archived_at` is
 * the over-cap reclaim, and ProStatusBanner quietly restores anything archived the moment there
 * is room under the cap, which on this account is always; `removed_at` is a moderation takedown
 * and hides nothing from the owner. So the old binders go, and two things make that safe:
 *   1. the puzzles do not need them. A daily_puzzles row carries its own card_ids and picture
 *      addresses; source_binder_id and source_page_id are `on delete set null`, and the only
 *      thing that read them was the Studio image download, which needed the binder public, and
 *      these were all un-showcased after their day;
 *   2. everything deleted is written to state/puzzles/retired-binders-<date>.json first: the
 *      binder rows, their pages and their slots, enough to put any of them back by hand.
 *
 * Only binders titled "Daily Puzzle: ..." (singular) are touched. The fortnight binders are
 * "Daily Puzzles: ..." and are left alone, as is anything whose puzzle is still to come.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, adminUser, appSql, fail, puzzleToday, q, step, textArray } from '../lib/michi.mjs';

const APPLY = process.argv.includes('--apply');
console.log(APPLY ? '*** APPLY: this will delete binders from the live database ***\n' : 'DRY RUN: nothing will be written.\n');

const me = await adminUser();
step(1, `the old puzzle binders of @${me.username}`);
const binders = await appSql(`
  select b.*,
         (select count(*) from public.binder_pages p where p.binder_id = b.id)::int as pages,
         (select max(d.publish_on)::text from public.daily_puzzles d where d.source_binder_id = b.id) as puzzle_day
    from public.binders b
   where b.owner_id = ${q(me.id)} and b.title like 'Daily Puzzle: %'
   order by b.created_at;
`);
if (!binders.length) {
  console.log('  none left');
  process.exit(0);
}
const today = puzzleToday();
const future = binders.filter((b) => b.puzzle_day && b.puzzle_day > today);
if (future.length) fail(`${future.length} binder(s) still feed a puzzle that has not run: ${future.map((b) => b.title).join(', ')}`);
for (const b of binders) {
  console.log(`  ${b.title.padEnd(36)} ${b.pages} pages  ${b.puzzle_day ? `ran ${b.puzzle_day}` : 'never published'}${b.is_public ? '  PUBLIC' : ''}`);
}
console.log(`  ${binders.length} binder(s)`);

const ids = binders.map((b) => b.id);
step(2, 'everything that would go with them');
const pages = await appSql(`select * from public.binder_pages where binder_id = any(${textArray(ids)}::uuid[]) order by binder_id, position;`);
const slots = await appSql(`select * from public.binder_slots where page_id = any(${textArray(pages.map((p) => p.id))}::uuid[]);`);
const [refs] = await appSql(`
  select count(*)::int as puzzles from public.daily_puzzles where source_binder_id = any(${textArray(ids)}::uuid[]);
`);
console.log(`  ${pages.length} pages, ${slots.length} slots; ${refs.puzzles} past puzzle(s) will keep their cards and forget their binder`);

if (!APPLY) {
  console.log(`\nOK: ${binders.length} binder(s) would be retired. Re-run with --apply.`);
  process.exit(0);
}

step(3, 'writing the backup first');
const dir = join(ROOT, 'state', 'puzzles');
mkdirSync(dir, { recursive: true });
const file = join(dir, `retired-binders-${today}.json`);
writeFileSync(file, JSON.stringify({ retired_on: new Date().toISOString(), binders, pages, slots }, null, 2), 'utf8');
console.log(`  ${file}`);

step(4, 'deleting');
// Pages and slots cascade from the binder; the puzzles' pointers go null by their own rule.
const gone = await appSql(`delete from public.binders where id = any(${textArray(ids)}::uuid[]) and owner_id = ${q(me.id)} returning id;`);
console.log(`  ${gone.length} binder(s) deleted`);
if (gone.length !== ids.length) fail(`expected ${ids.length}, deleted ${gone.length}`);

step(5, 'reading back');
const [left] = await appSql(`select count(*)::int as n from public.binders where owner_id = ${q(me.id)} and title like 'Daily Puzzle: %';`);
const [puzzles] = await appSql(`
  select count(*)::int as total, count(*) filter (where cardinality(card_ids) > 0 and card_image_urls is not null)::int as drawable
    from public.daily_puzzles where publish_on <= ${q(today)}::date;
`);
console.log(`  ${left.n} old binder(s) remain; ${puzzles.drawable} of ${puzzles.total} past puzzles still carry their cards and pictures`);
if (left.n !== 0 || puzzles.drawable !== puzzles.total) fail('read-back did not match');

console.log(`\nOK: ${gone.length} binder(s) retired, backup at ${file}.`);
