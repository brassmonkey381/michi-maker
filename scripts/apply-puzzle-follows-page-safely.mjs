/**
 * Apply supabase/migrations/20261020100000_puzzle_follows_page_safely.sql and prove both halves:
 *   1. the editor's transient "ten cards on a 3x3" state no longer fails the write;
 *   2. a finished swap still reaches the puzzle.
 *
 * Both probes set the two triggers immediate so they fire inside the
 * request where the probe can read their effect. Everything is swapped or deleted back; the page
 * ends exactly as it started.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appSql, fail, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261020100000_puzzle_follows_page_safely.sql');
const j = (x) => JSON.stringify(x);

step(1, 'applying the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
console.log('  OK');

step(2, 'both triggers exist and are deferred to commit');
const trig = await appSql(`
  select tgname, tgdeferrable, tginitdeferred from pg_trigger
   where tgname in ('binder_slots_follow_puzzle', 'binder_pages_follow_puzzle') and not tgisinternal;`);
if (trig.length !== 2) fail(`expected two triggers, found ${trig.map((t) => t.tgname).join(', ') || 'none'}`);
if (!trig.every((t) => t.tgdeferrable && t.tginitdeferred)) fail('a trigger is not deferred');
console.log('  OK');

const TARGET = `
  create temp table probe_target as
    select d.id, d.source_page_id as page_id, d.card_ids, d.publish_on
      from public.daily_puzzles d
     where d.publish_on > public.puzzle_today() and d.source_page_id is not null
       and cardinality(d.card_ids) = d.rows * d.cols
     order by d.publish_on limit 1;`;

step(3, 'a tenth card on a full page is a write that succeeds and a puzzle that waits');
const [full] = await appSql(`
  ${TARGET}
  set constraints public.binder_slots_follow_puzzle, public.binder_pages_follow_puzzle immediate;
  insert into public.binder_slots (id, page_id, row_index, col_index, slot_type, card_id)
    select '00000000-0000-4000-8000-00000000f00d', t.page_id, 0, 0, 'card', 'probe-card' from probe_target t;
  create temp table probe_mid as
    select d.card_ids from public.daily_puzzles d where d.id = (select id from probe_target);
  delete from public.binder_slots where id = '00000000-0000-4000-8000-00000000f00d';
  select t.publish_on, t.card_ids as before_ids, m.card_ids as mid_ids,
         (select d.card_ids from public.daily_puzzles d where d.id = t.id) as after_ids
    from probe_target t, probe_mid m;`);
if (!full) {
  console.log('  no full future puzzle to probe with; the triggers are in place');
} else {
  if (j(full.mid_ids) !== j(full.before_ids)) fail(`the ${full.publish_on} puzzle took the overfull page: ${j(full.mid_ids)}`);
  if (j(full.after_ids) !== j(full.before_ids)) fail(`the ${full.publish_on} puzzle changed: ${j(full.after_ids)}`);
  console.log(`  OK: the insert went through and the ${full.publish_on} puzzle did not move`);
}

step(4, 'a finished swap still reaches the puzzle (swapped, read, swapped back)');
const SWAP = `
  update public.binder_slots s
     set row_index = o.row_index, col_index = o.col_index
    from probe_two me, probe_two om, public.binder_slots o
   where s.id = me.id and om.rn <> me.rn and o.id = om.id;`;
const [probe] = await appSql(`
  ${TARGET}
  create temp table probe_two as
    select s.id, row_number() over (order by s.row_index, s.col_index) as rn
      from public.binder_slots s, probe_target t
     where s.page_id = t.page_id and s.slot_type = 'card' and s.card_id is not null
     order by s.row_index, s.col_index limit 2;
  set constraints public.binder_slots_follow_puzzle, public.binder_pages_follow_puzzle immediate;
  ${SWAP}
  create temp table probe_mid as
    select d.card_ids from public.daily_puzzles d where d.id = (select id from probe_target);
  ${SWAP}
  select t.publish_on, t.card_ids as before_ids, m.card_ids as mid_ids,
         (select d.card_ids from public.daily_puzzles d where d.id = t.id) as after_ids,
         (select count(*) from probe_two) as slots
    from probe_target t, probe_mid m;`);
if (!probe || Number(probe.slots) < 2) {
  console.log('  nothing to swap; the triggers are in place');
} else {
  if (j(probe.before_ids) !== j(probe.after_ids)) fail(`the page did not come back as it was on ${probe.publish_on}`);
  if (j(probe.mid_ids) === j(probe.before_ids)) fail(`the puzzle for ${probe.publish_on} did not follow the swap`);
  console.log(`  OK: the ${probe.publish_on} puzzle followed the swap and the swap back`);
}
console.log('DONE.');
