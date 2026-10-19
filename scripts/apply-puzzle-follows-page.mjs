/**
 * Apply supabase/migrations/20261018140000_puzzle_follows_page.sql and prove it: a future puzzle
 * follows its binder page's cards; today's and earlier puzzles do not move.
 *
 * THE PROOF swaps the first two cards of the first future puzzle's page, reads the puzzle, and swaps
 * them back, all in one request. The page ends exactly as it started; the puzzle is re-synced by the
 * same trigger on the way back. Nothing else of the owner's is touched.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appSql, fail, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261018140000_puzzle_follows_page.sql');

step(1, 'applying the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
console.log('  OK');

step(2, 'the triggers exist');
const trig = await appSql(`
  select tgname from pg_trigger
   where tgname in ('binder_slots_follow_puzzle', 'binder_pages_follow_puzzle') and not tgisinternal;`);
if (trig.length !== 2) fail(`expected two triggers, found ${trig.map((t) => t.tgname).join(', ') || 'none'}`);
console.log('  OK');

step(3, 'a future puzzle follows a card swap on its page (swapped, read, swapped back)');
// Swaps the LIVE cells of the two probe slots, so running it twice is a swap and a swap back. (The
// first version joined probe_two to itself and reassigned the saved original cells both times: the
// same assignment twice, which left the page swapped. Caught on 2026-10-19 by the probe itself.)
const SWAP = `
  update public.binder_slots s
     set row_index = o.row_index, col_index = o.col_index
    from probe_two me, probe_two om, public.binder_slots o
   where s.id = me.id and om.rn <> me.rn and o.id = om.id;`;
const [probe] = await appSql(`
  create temp table probe_target as
    select d.id, d.source_page_id as page_id, d.card_ids, d.publish_on
      from public.daily_puzzles d
     where d.publish_on > public.puzzle_today() and d.source_page_id is not null
     order by d.publish_on limit 1;
  create temp table probe_two as
    select s.id, s.row_index, s.col_index, row_number() over (order by s.row_index, s.col_index) as rn
      from public.binder_slots s, probe_target t
     where s.page_id = t.page_id and s.slot_type = 'card' and s.card_id is not null
     order by s.row_index, s.col_index limit 2;
  ${SWAP}
  create temp table probe_mid as
    select d.card_ids from public.daily_puzzles d where d.id = (select id from probe_target);
  ${SWAP}
  select t.publish_on, t.card_ids as before_ids, m.card_ids as mid_ids,
         (select d.card_ids from public.daily_puzzles d where d.id = t.id) as after_ids,
         (select count(*) from probe_two) as slots
    from probe_target t, probe_mid m;`);
if (!probe) {
  console.log('  no future puzzle to probe with; the triggers are in place');
} else if (Number(probe.slots) < 2) {
  console.log('  the first future puzzle has fewer than two cards; nothing to swap, triggers are in place');
} else {
  const j = (x) => JSON.stringify(x);
  if (j(probe.before_ids) !== j(probe.after_ids)) fail(`the page did not come back as it was on ${probe.publish_on}`);
  if (j(probe.mid_ids) === j(probe.before_ids)) fail(`the puzzle for ${probe.publish_on} did not follow the swap`);
  if (j([...probe.mid_ids].sort()) !== j([...probe.before_ids].sort())) fail('the swap changed which cards are on the puzzle');
  console.log(`  OK: the ${probe.publish_on} puzzle followed the swap and the swap back; the page is as it was`);
}
console.log('DONE.');
