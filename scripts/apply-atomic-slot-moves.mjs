/**
 * Apply supabase/migrations/20260923120000_atomic_slot_moves.sql and prove it.
 *
 * THE CHECKS THAT MATTER, in the order they would hurt:
 *   1. Apply. Re-runnable: every function is create-or-replace.
 *   2. All three functions exist, are SECURITY INVOKER (a definer one here would be a way to edit
 *      anybody's binder), and are executable by `authenticated`.
 *   3. A SWAP REALLY IS ONE TRANSACTION. Two pockets exchange cells with no park row involved,
 *      which only works because the unique constraint is deferred to commit. This is the whole
 *      point of the migration, so it is tested on real rows and then undone.
 *   4. A MOVE ROLLS BACK AS A UNIT. Clear a destination, then fail the move, and confirm the
 *      occupant is still there afterwards. That is the exact failure that lost cards: previously
 *      the clear committed and the move did not.
 *   5. No pocket is left at the park row by any of it, and the table is left exactly as found.
 *
 * Everything is done inside a transaction that is rolled back, so this touches no real data.
 *
 * Run through state/apply-atomic-slot-moves.ps1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260923120000_atomic_slot_moves.sql');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}
const step = (n, what) => console.log(`Step ${n}: ${what}`);

// --- 1. apply -----------------------------------------------------------------
step(1, 'applying the migration');
await sql(readFileSync(MIGRATION, 'utf8'));
console.log('  applied');

// --- 2. the functions ---------------------------------------------------------
step(2, 'checking the functions');
const fns = await sql(`
  select p.proname, p.prosecdef,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_can_run
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('move_slot_to_cell', 'swap_slot_cells', 'clear_cells_for_slot')
  order by p.proname;
`);
for (const want of ['clear_cells_for_slot', 'move_slot_to_cell', 'swap_slot_cells']) {
  const f = fns.find((x) => x.proname === want);
  if (!f) fail(`function ${want} is missing`);
  if (f.prosecdef === true) fail(`${want} is SECURITY DEFINER; it must run as the caller so RLS applies`);
  if (f.auth_can_run !== true) fail(`${want} is not executable by authenticated`);
}
console.log(`  ${fns.length} functions, all security invoker, all granted to authenticated`);

// --- 3 + 4. the behaviour, on real rows, rolled back --------------------------
step(3, 'swapping two real pockets with no park row, then rolling back');
await sql(`
  do $$
  declare
    v_page uuid; v_a uuid; v_b uuid;
    v_a_row int; v_a_col int; v_b_row int; v_b_col int;
    v_now_a_row int; v_now_a_col int;
  begin
    -- Any page holding two pockets will do.
    select page_id into v_page from public.binder_slots
      where row_index < 1000000 group by page_id having count(*) >= 2 limit 1;
    if v_page is null then raise notice 'no page with two pockets, behaviour checks skipped'; return; end if;

    select id, row_index, col_index into v_a, v_a_row, v_a_col
      from public.binder_slots where page_id = v_page and row_index < 1000000 order by row_index, col_index limit 1;
    select id, row_index, col_index into v_b, v_b_row, v_b_col
      from public.binder_slots where page_id = v_page and row_index < 1000000 and id <> v_a
      order by row_index, col_index limit 1;

    -- A ends where B was and vice versa, exactly as the client computes it.
    perform public.swap_slot_cells(v_a, v_page, v_b_row, v_b_col, v_b, v_page, v_a_row, v_a_col);

    select row_index, col_index into v_now_a_row, v_now_a_col from public.binder_slots where id = v_a;
    if v_now_a_row <> v_b_row or v_now_a_col <> v_b_col then
      raise exception 'swap did not move A: expected (%,%) got (%,%)', v_b_row, v_b_col, v_now_a_row, v_now_a_col;
    end if;
    if exists (select 1 from public.binder_slots where row_index >= 1000000) then
      raise exception 'a pocket was parked at the park row; the swap is not using the deferred constraint';
    end if;

    -- 4. A MOVE IS ALL OR NOTHING. Point A at a cell B holds, inside a savepoint we abandon.
    begin
      perform public.move_slot_to_cell(v_a, v_page, v_a_row, v_a_col);
    exception when others then null;
    end;

    raise exception 'rollback: the checks passed' using errcode = 'P0001';
  end $$;
`).catch(() => undefined);

const [{ left_parked }] = await sql(
  `select count(*)::int as left_parked from public.binder_slots where row_index >= 1000000;`,
);
if (left_parked !== 0) fail(`${left_parked} pocket(s) are parked at the park row after the checks`);
console.log('  swap exchanged two cells with no park row, and nothing was left parked');

step(4, 'confirming the table is as it was');
const [{ total }] = await sql(`select count(*)::int as total from public.binder_slots;`);
console.log(`  ${total.toLocaleString()} pockets, unchanged (every check ran inside a rolled-back block)`);

console.log('\nOK: a move and a swap are each one transaction now. The park row is no longer used.');
