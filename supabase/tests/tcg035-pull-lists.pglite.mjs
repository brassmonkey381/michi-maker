// Run: in an empty folder outside this repo, npm i @electric-sql/pglite@0.2.17, then
//   node <this file> <repo>\supabase\migrations\20261119120000_tcg035_pull_lists.sql
// (PGlite is a test-only tool, deliberately not a dependency of this app.)
// TCG-035: run the pull-list migration against a minimal copy of the schema in PGlite.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const MIG = process.argv[2];
const db = new PGlite();
const U = '11111111-1111-1111-1111-111111111111';
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];

await db.exec(`
create role authenticated; create role anon;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
insert into auth.users values ('${U}');
create table public.collections (id text, user_id uuid, archived_at timestamptz, primary key (user_id, id), unique (id));
create table public.portfolio_entries (
  id text primary key, collection_id text not null, user_id uuid not null, card_id text not null,
  variant text not null default 'Normal', condition text not null default 'NM', quantity integer not null default 1,
  purchase_price numeric, purchase_date date, added_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  storage_id text, storage_page integer, storage_pos integer, scanned_at timestamptz, scan_path text,
  storage_rows integer, storage_cols integer, scan_session text, item_kind text);
create table public.storage_units (
  id text not null, user_id uuid not null, collection_id text not null, name text not null,
  kind text not null check (kind in ('binder','stack','box','other')), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), insertion_order text not null default 'lifo', grid_rows integer, grid_cols integer,
  page_count integer, parent_id text, code integer, primary key (user_id, id));
create table public.binders (id uuid primary key default gen_random_uuid(), owner_id uuid not null, title text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.binder_pages (id uuid primary key default gen_random_uuid(), binder_id uuid not null references public.binders(id) on delete cascade,
  position integer not null default 0, rows integer not null default 3, cols integer not null default 3,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.binder_slots (id uuid primary key default gen_random_uuid(), page_id uuid not null references public.binder_pages(id) on delete cascade,
  row_index integer not null, col_index integer not null, card_id text, from_collection boolean, source_entry_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger binder_slots_set_updated_at before update on public.binder_slots for each row execute function public.set_updated_at();
-- stand-in for enforce_card_cap: card 'CAP' can never be inserted
create function public.cap_stub() returns trigger language plpgsql as $$
begin if new.card_id = 'CAP' and new.quantity = 1 then raise exception 'tier_cap_exceeded' using errcode = 'P0001'; end if; return new; end $$;
create trigger cap_stub before insert on public.portfolio_entries for each row execute function public.cap_stub();
`);
await db.exec(fs.readFileSync(MIG, 'utf8'));
await db.exec(`set test.uid = '${U}'`);

// â”€â”€ fixture â”€â”€
const T0 = "'2026-11-01T00:00:00Z'";
await db.exec(`
insert into public.collections values ('col-1', '${U}', null), ('col-2', '${U}', null);
insert into public.storage_units (id, user_id, collection_id, name, kind, parent_id) values
  ('box-1', '${U}', 'col-1', 'Box', 'box', null), ('stk-1', '${U}', 'col-1', 'S1', 'stack', 'box-1'),
  ('bnd-2', '${U}', 'col-1', 'Old binder', 'binder', null);
insert into public.portfolio_entries (id, collection_id, user_id, card_id, storage_id, storage_pos, scanned_at, updated_at) values
  ('A', 'col-1', '${U}', 'cA', 'stk-1', 1, '2026-10-01', ${T0}), ('B', 'col-1', '${U}', 'cB', 'stk-1', 2, '2026-10-02', ${T0}),
  ('C', 'col-1', '${U}', 'cC', 'stk-1', 3, '2026-10-03', ${T0}), ('D', 'col-1', '${U}', 'cD', 'stk-1', 3, '2026-10-04', ${T0}),
  ('E', 'col-1', '${U}', 'cE', 'stk-1', 7, '2026-10-05', ${T0});
insert into public.portfolio_entries (id, collection_id, user_id, card_id, quantity, updated_at) values ('L', 'col-2', '${U}', 'cL', 3, ${T0});
insert into public.portfolio_entries (id, collection_id, user_id, card_id, storage_id, storage_page, storage_pos, storage_rows, storage_cols, updated_at)
  values ('F', 'col-1', '${U}', 'cF', 'bnd-2', 2, 4, 3, 3, ${T0});
insert into public.portfolio_entries (id, collection_id, user_id, card_id, quantity, updated_at) values ('K', 'col-1', '${U}', 'CAP', 2, ${T0});
`);
const mb = (await one(`insert into public.binders (owner_id, title) values ('${U}', 'Fire types') returning id`)).id;
const pg = (await one(`insert into public.binder_pages (binder_id, position, rows, cols) values ($1, 0, 3, 3) returning id`, [mb])).id;
const slot = async (r, c, card) => (await one(`insert into public.binder_slots (page_id, row_index, col_index, card_id, updated_at) values ($1,$2,$3,$4,${T0}) returning id`, [pg, r, c, card])).id;
const sC = await slot(0, 0, 'cC'), sL = await slot(0, 1, 'cL'), sF = await slot(0, 2, 'cF'), sK = await slot(1, 0, 'CAP');
const list = (await one(`insert into public.pull_lists (collection_id, michi_binder_id, source) values ('col-1', $1, 'michi') returning id`, [mb])).id;
const item = async (entry, card, s, pos) => (await one(
  `insert into public.pull_list_items (list_id, entry_id, card_id, michi_slot_id, target_page, target_pos, target_rows, target_cols) values ($1,$2,$3,$4,1,$5,3,3) returning id`,
  [list, entry, card, s, pos])).id;
const iC = await item('C', 'cC', sC, 0), iL = await item('L', 'cL', sL, 1), iF = await item('F', 'cF', sF, 2), iK = await item('K', 'CAP', sK, 3);

const before = await q(`select * from public.portfolio_entries order by id`);
const slotsBefore = await q(`select id, source_entry_id, from_collection from public.binder_slots order by id`);
const stack = async () => (await q(`select id, storage_pos from public.portfolio_entries where storage_id = 'stk-1' order by storage_pos`)).map((r) => `${r.id}${r.storage_pos}`).join(' ');

// â”€â”€ 1. checking alone changes nothing; commit moves only checked items â”€â”€
await db.exec(`update public.pull_list_items set checked_at = now() where id in ('${iC}', '${iL}', '${iK}')`);
assert.deepEqual(await q(`select * from public.portfolio_entries order by id`), before, 'checking moved something');
const r1 = (await one(`select public.commit_pull_list($1) as r`, [list])).r;
assert.equal(r1.moved, 2, JSON.stringify(r1));
assert.deepEqual(r1.skipped.map((s) => s.reason), ['cap']);
const unit = r1.target_unit_id;
const u = await one(`select * from public.storage_units where id = $1`, [unit]);
assert.equal(u.kind, 'binder'); assert.equal(u.michi_binder_id, mb); assert.equal(u.name, 'Fire types'); assert.equal(u.grid_cols, 3);
const c = await one(`select * from public.portfolio_entries where id = 'C'`);
assert.deepEqual([c.storage_id, c.storage_page, c.storage_pos, c.storage_rows], [unit, 1, 0, 3]);
// stack: A1 B2 (C3 gone) D3 E7 -> A1 B2 D3 E4, order kept, gap closed
assert.equal(await stack(), 'A1 B2 D3 E4');
const L = await one(`select quantity from public.portfolio_entries where id = 'L'`);
assert.equal(L.quantity, 2);
const split = await one(`select * from public.portfolio_entries where card_id = 'cL' and id <> 'L'`);
assert.deepEqual([split.quantity, split.collection_id, split.storage_id, split.storage_pos], [1, 'col-1', unit, 1]);
const sl = await one(`select source_entry_id, from_collection from public.binder_slots where id = $1`, [sL]);
assert.deepEqual([sl.source_entry_id, sl.from_collection], [split.id, true]);
assert.equal((await one(`select source_entry_id from public.binder_slots where id = $1`, [sC])).source_entry_id, 'C');
assert.equal((await one(`select status from public.pull_lists where id = $1`, [list])).status, 'open');
assert.equal((await one(`select count(*)::int n from public.portfolio_entries where id = 'K'`)).n, 1, 'cap item untouched');
// every touched entry got a newer updated_at
assert.ok(new Date(c.updated_at) > new Date('2026-11-01'), 'C stamped');
console.log('PASS 1 commit: checked copies moved, split, pockets stamped, stack closed in order, cap item skipped');

// â”€â”€ 2. one undo puts everything back â”€â”€
const u1 = (await one(`select public.undo_pull_list($1) as r`, [r1.commit_id])).r;
assert.deepEqual(u1.conflicts, [], JSON.stringify(u1));
const after = await q(`select * from public.portfolio_entries order by id`);
const strip = (rows) => rows.map(({ updated_at, ...r }) => r);
assert.deepEqual(strip(after), strip(before), 'undo did not restore entries');
assert.deepEqual(await q(`select id, source_entry_id, from_collection from public.binder_slots order by id`), slotsBefore, 'undo did not restore slots');
assert.equal((await one(`select count(*)::int n from public.storage_units where id = $1`, [unit])).n, 0, 'empty created unit not removed');
assert.equal((await one(`select count(*)::int n from public.pull_list_items where list_id = $1 and moved_at is not null`, [list])).n, 0);
assert.equal((await one(`select count(*)::int n from public.pull_list_items where list_id = $1 and checked_at is not null`, [list])).n, 3, 'checks kept');
await assert.rejects(db.query(`select public.undo_pull_list($1)`, [r1.commit_id]), /already undone/);
console.log('PASS 2 undo: entries, quantities, stack positions, pockets restored; split row and new unit removed; checks kept');

// â”€â”€ 3. partial commits finish the list â”€â”€
const r2 = (await one(`select public.commit_pull_list($1) as r`, [list])).r;
assert.equal(r2.moved, 2);
await db.exec(`update public.pull_list_items set checked_at = now() where id = '${iF}'; delete from public.pull_list_items where id = '${iK}'`);
const r3 = (await one(`select public.commit_pull_list($1) as r`, [list])).r;
assert.equal(r3.moved, 1);
assert.equal(r3.target_unit_id, r2.target_unit_id, 'second commit reused the unit');
const f = await one(`select * from public.portfolio_entries where id = 'F'`);
assert.deepEqual([f.storage_id, f.storage_page, f.storage_pos], [r2.target_unit_id, 1, 2]);
assert.equal((await one(`select status from public.pull_lists where id = $1`, [list])).status, 'done');
await assert.rejects(db.query(`select public.commit_pull_list($1)`, [list]), /pull list is done/);
console.log('PASS 3 partial commits: unchecked items waited, a later commit reused the binder unit, list done');

// â”€â”€ 4. undo never overwrites a later edit â”€â”€
await db.exec(`update public.portfolio_entries set storage_pos = 9, updated_at = clock_timestamp() + interval '1 hour' where id = 'F'`);
const u3 = (await one(`select public.undo_pull_list($1) as r`, [r3.commit_id])).r;
assert.deepEqual(u3.conflicts, ['F']);
assert.equal((await one(`select storage_pos from public.portfolio_entries where id = 'F'`)).storage_pos, 9);
console.log('PASS 4 undo conflict: a row edited after the commit is reported, not overwritten');

// â”€â”€ 5. another user cannot commit my list â”€â”€
await db.exec(`set test.uid = '22222222-2222-2222-2222-222222222222'`);
await assert.rejects(db.query(`select public.commit_pull_list($1)`, [list]), /pull list not found/);
await db.exec(`set test.uid = ''`);
await assert.rejects(db.query(`select public.commit_pull_list($1)`, [list]), /not signed in/);
console.log('PASS 5 ownership: another account and a signed-out call are refused');
console.log('ALL PASSED');
