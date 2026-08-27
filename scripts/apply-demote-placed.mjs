/**
 * Apply supabase/migrations/20260827220000_demote_placed_on_collection_delete.sql: deleting a
 * collection now demotes the binder pockets it was backing. The pocket stays, the from_collection
 * claim goes, so the card reads NOT OWNED instead of silently claiming a copy that is gone.
 *
 * THE CHECKS THAT MATTER:
 *   2. The trigger exists on collections, fires on DELETE, and is DEFERRED. Deferred is the whole
 *      design: the demotion must see user_cards after the cascade and the rollup settle, and an
 *      immediate trigger would interleave with the RI queue and read a half-drained rollup.
 *   3. END TO END, in a transaction that rolls back: build a collection, an entry, and a placed
 *      pocket; delete the collection; force the deferred queue with SET CONSTRAINTS; the pocket
 *      must now read from_collection = false. This is the actual promise, not the plumbing.
 *   4. BACKFILL: past deletes already left over-placed pockets (from_collection = true with no
 *      owned copies behind them). The same rule is applied to them once, per user, and every
 *      demoted pocket is reported by binder so nothing changes silently.
 *
 * Safe to re-run: idempotent DDL, and the backfill is an absolute recompute (a second run finds
 * nothing left to demote).
 *
 * Run through apply-demote-placed.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260827220000_demote_placed_on_collection_delete.sql',
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

  console.log('Step 2: the trigger exists, on DELETE, and is deferred...');
  const [trg] = await sql(`
    select t.tgtype, t.tgdeferrable, t.tginitdeferred
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where c.relname = 'collections' and t.tgname = 'collections_demote_placements';`);
  if (!trg) fail('collections_demote_placements is missing');
  // tgtype bit 3 (value 8) = DELETE.
  if (!(trg.tgtype & 8)) fail('the trigger does not fire on DELETE');
  if (!trg.tgdeferrable || !trg.tginitdeferred) fail('the trigger is not deferrable initially deferred');
  console.log('  OK (constraint trigger, after delete, initially deferred)');

  console.log('Step 3: a real delete demotes the pocket it orphans (rolled back)...');
  const probe = await sql(`
    do $probe$
    declare
      v_user uuid; v_binder uuid; v_page uuid; v_slot uuid;
      v_flag boolean; v_qty integer;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then
        raise exception 'PROBE-SKIP: every user already owns a collection';
      end if;

      insert into public.collections (id, user_id, name)
        values ('probe-col-demote', v_user, 'probe');
      insert into public.portfolio_entries
          (id, collection_id, user_id, card_id, variant, condition, quantity)
        values ('probe-entry-demote', 'probe-col-demote', v_user, 'probe-card-demote',
                'Normal', 'Near Mint', 1);

      -- The rollup trigger must have granted the copy the pocket is about to consume.
      select coalesce(sum(quantity), 0) into v_qty
        from public.user_cards where owner_id = v_user and card_id = 'probe-card-demote';
      if v_qty <> 1 then raise exception 'PROBE-FAIL: rollup shows % copies, wanted 1', v_qty; end if;

      insert into public.binders (owner_id, title, layout_style, is_public)
        values (v_user, 'probe demote', 'freeform', false) returning id into v_binder;
      insert into public.binder_pages (binder_id, position, rows, cols)
        values (v_binder, 0, 3, 4) returning id into v_page;
      insert into public.binder_slots
          (page_id, row_index, col_index, slot_type, card_id, from_collection)
        values (v_page, 0, 0, 'card', 'probe-card-demote', true) returning id into v_slot;

      delete from public.collections where id = 'probe-col-demote';
      set constraints all immediate;  -- fire the deferred queue now, inside this transaction

      select from_collection into v_flag from public.binder_slots where id = v_slot;
      if v_flag then raise exception 'PROBE-FAIL: the pocket still claims a deleted copy'; end if;
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(probe).includes('PROBE-OK')) console.log('  OK (pocket demoted at commit, all rolled back)');
  else if (String(probe).includes('PROBE-SKIP')) console.log('  SKIPPED (no collection-less user to probe with)');
  else fail(`demotion probe: ${String(probe).slice(0, 400)}`);

  console.log('Step 4: backfill, the same rule applied to what past deletes left behind...');
  // Named per binder BEFORE demoting, so the output says exactly which pockets changed hands.
  const doomed = await sql(`
    with placed as (
      select b.owner_id, pr.username, b.title, s.card_id
        from public.binder_slots s
        join public.binder_pages p on p.id = s.page_id
        join public.binders b on b.id = p.binder_id
        join public.profiles pr on pr.id = b.owner_id
       where s.from_collection and s.card_id is not null
    ), owned as (
      select owner_id, card_id, sum(quantity)::int as qty
        from public.user_cards group by owner_id, card_id
    )
    select placed.username, placed.title, placed.card_id,
           count(*)::int as placed_n, coalesce(min(owned.qty), 0) as owned_n
      from placed left join owned
        on owned.owner_id = placed.owner_id and owned.card_id = placed.card_id
     group by placed.owner_id, placed.username, placed.title, placed.card_id
    having count(*) > coalesce(min(owned.qty), 0)
     order by placed.username, placed.title, placed.card_id;`);
  if (!doomed.length) {
    console.log('  OK (nothing over-placed, nothing to demote)');
  } else {
    for (const d of doomed) {
      console.log(
        `     @${d.username} "${d.title}": card ${d.card_id} placed ${d.placed_n}, owns ${d.owned_n}`,
      );
    }
    const users = await sql(`
      with placed as (
        select b.owner_id, s.card_id, count(*)::int as n
          from public.binder_slots s
          join public.binder_pages p on p.id = s.page_id
          join public.binders b on b.id = p.binder_id
         where s.from_collection and s.card_id is not null
         group by b.owner_id, s.card_id
      )
      select distinct placed.owner_id
        from placed
        left join (select owner_id, card_id, sum(quantity)::int as qty
                     from public.user_cards group by owner_id, card_id) o
          on o.owner_id = placed.owner_id and o.card_id = placed.card_id
       where placed.n > coalesce(o.qty, 0);`);
    let demoted = 0;
    for (const u of users) {
      const [r] = await sql(`select public.demote_unowned_placements('${u.owner_id}'::uuid) as n;`);
      demoted += r.n;
    }
    console.log(`  OK (${demoted} pocket(s) demoted across ${users.length} account(s))`);
    // A second pass must find nothing: the recompute is absolute or it is wrong.
    const leftovers = await sql(`
      with placed as (
        select b.owner_id, s.card_id, count(*)::int as n
          from public.binder_slots s
          join public.binder_pages p on p.id = s.page_id
          join public.binders b on b.id = p.binder_id
         where s.from_collection and s.card_id is not null
         group by b.owner_id, s.card_id
      )
      select count(*)::int as bad from placed
        left join (select owner_id, card_id, sum(quantity)::int as qty
                     from public.user_cards group by owner_id, card_id) o
          on o.owner_id = placed.owner_id and o.card_id = placed.card_id
       where placed.n > coalesce(o.qty, 0);`);
    if (leftovers[0].bad) fail(`${leftovers[0].bad} over-placement(s) survived the backfill`);
    console.log('  OK (verified: no over-placed pocket remains)');
  }

  console.log('\nDONE. Deleting a collection now releases the pockets it was backing.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}
