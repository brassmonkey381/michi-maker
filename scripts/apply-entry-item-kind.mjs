/**
 * Apply the sealed-entry pair: 20260831120000 (portfolio_entries.item_kind, the card-vs-sealed
 * discriminator — null = card, 'sealed' = sealed product, a birth field like scan_path) and
 * 20260831130000 (the user_cards rollup trigger skips sealed rows).
 *
 * THE CHECKS THAT MATTER:
 *   2. The column exists, is text, nullable, has NO default and joins NO constraint — the entries
 *      sync push is one batch upsert, and nothing about this column may ever reject a row.
 *   3. Both insert shapes land: without the column (every old client in the wild) and with it
 *      ('sealed' round-trips). Probed in a raise-to-roll-back do-block so nothing is left behind.
 *   4. The rollup ignores sealed: in the same rolled-back probe, a card insert moves user_cards
 *      and a sealed insert does not — proven by reading the rollup back, not by trusting the
 *      trigger text.
 *
 * Safe to re-run: idempotent DDL. Run through apply-entry-item-kind.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = [
  join(here, '..', 'supabase', 'migrations', '20260831120000_entry_item_kind.sql'),
  join(here, '..', 'supabase', 'migrations', '20260831130000_rollup_skips_sealed.sql'),
  join(here, '..', 'supabase', 'migrations', '20260831140000_sealed_cap.sql'),
];

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
  console.log('Step 1: applying the migrations...');
  for (const m of MIGRATIONS) await sql(readFileSync(m, 'utf8'));
  console.log('  OK (item_kind column + sealed-blind rollup + split cap trigger)');

  console.log('Step 2: the column, and that nothing about it can reject a row...');
  const [col] = await sql(`
    select data_type, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'portfolio_entries'
      and column_name = 'item_kind';`);
  if (!col) fail('item_kind is missing');
  if (col.data_type !== 'text') fail(`item_kind is ${col.data_type}, expected text`);
  if (col.is_nullable !== 'YES') fail('item_kind is NOT NULL, which can poison a sync batch');
  if (col.column_default !== null) fail(`item_kind has a default (${col.column_default})`);
  const cons = await sql(`
    select c.conname from pg_constraint c
    where c.conrelid = 'public.portfolio_entries'::regclass
      and exists (
        select 1 from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where a.attname = 'item_kind');`);
  if (cons.length) fail(`item_kind joined a constraint: ${cons.map((c) => c.conname).join(', ')}`);
  console.log('  OK (text, nullable, no default, no constraint)');

  console.log('Step 3: probing both entry-insert shapes, rolled back...');
  const probe = await sql(`
    do $probe$
    declare
      v_user uuid; v_col text := 'probe-col-item-kind'; v_back text;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then
        select id into v_user from auth.users limit 1;
      end if;
      if v_user is null then raise exception 'PROBE-SKIP: no user to own a probe collection'; end if;

      insert into public.collections (id, user_id, name) values (v_col, v_user, 'probe');

      -- The shape every client in the wild sends today: no item_kind at all.
      insert into public.portfolio_entries
          (id, collection_id, user_id, card_id, variant, condition, quantity)
        values ('probe-entry-card', v_col, v_user, 'probe-card', 'Normal', 'Near Mint', 1);

      -- The card insert above must have moved the rollup...
      declare v_cards int; v_sealed int;
      begin
        select coalesce(sum(quantity), 0) into v_cards
          from public.user_cards where owner_id = v_user and card_id = 'probe-card';
        if v_cards <> 1 then
          raise exception 'PROBE-FAIL: card insert rolled up % copies, wanted 1', v_cards;
        end if;
      end;

      -- The shape the sealed client sends.
      insert into public.portfolio_entries
          (id, collection_id, user_id, card_id, variant, condition, quantity, item_kind)
        values ('probe-entry-sealed', v_col, v_user, '91595', 'Normal', 'Sealed', 1, 'sealed');
      select item_kind into v_back from public.portfolio_entries where id = 'probe-entry-sealed';
      if v_back is distinct from 'sealed' then
        raise exception 'PROBE-FAIL: item_kind did not round-trip (got %)', v_back;
      end if;

      -- ...and the sealed insert must NOT have. Read back, not assumed.
      declare v_leak int;
      begin
        select coalesce(sum(quantity), 0) into v_leak
          from public.user_cards where owner_id = v_user and card_id = '91595';
        if v_leak <> 0 then
          raise exception 'PROBE-FAIL: sealed insert leaked % copies into user_cards', v_leak;
        end if;
      end;

      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(probe).includes('PROBE-OK')) {
    console.log('  OK (old shape lands, sealed round-trips, rollup counts a card and ignores sealed, all rolled back)');
  } else if (String(probe).includes('PROBE-SKIP')) {
    console.log('  SKIPPED (no user to own a probe collection)');
  } else {
    fail(`entry probe: ${String(probe).slice(0, 400)}`);
  }

  console.log('');
  console.log('Done. item_kind is live and the rollup is sealed-blind; sealed adds may now ship.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}
