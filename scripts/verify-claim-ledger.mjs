/**
 * READ-ONLY: is the live database actually in the state the claim-ledger work assumes?
 *
 * Run after apply-demote-stamp.ps1 (and apply-people-ranking.ps1). Everything here is a SELECT
 * or a rolled-back probe; nothing is written. The point is that "the applier printed DONE" and
 * "stamps now persist" are different claims, and the second is the one that matters: the column
 * shipped as uuid against client-minted `lot-...` text ids, so every stamp write 400'd silently
 * for two days while every check that existed still passed.
 *
 * Run through verify-claim-ledger.ps1 at the workspace root.
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';

const token = process.env.SUPABASE_ACCESS_TOKEN;
let failed = 0;
function bad(msg) {
  console.log(`  FAILED: ${msg}`);
  failed += 1;
}
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
  process.exit(2);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

try {
  console.log('1. binder_slots.source_entry_id can hold a client-minted id...');
  const [col] = await sql(`
    select data_type, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'binder_slots'
      and column_name = 'source_entry_id';`);
  if (!col) bad('the column is missing');
  else if (col.data_type !== 'text') bad(`data_type is ${col.data_type}, expected text`);
  else console.log(`  OK (${col.data_type}, nullable ${col.is_nullable})`);

  console.log('2. a real lot-... id round-trips (rolled back)...');
  const probe = await sql(`
    do $probe$
    declare v_page uuid; v_back text;
    begin
      select id into v_page from public.binder_pages limit 1;
      if v_page is null then raise exception 'PROBE-SKIP: no page available'; end if;
      insert into public.binder_slots (page_id, row_index, col_index, slot_type, card_id, source_entry_id)
      values (v_page, 96, 96, 'card', 'probe-verify-stamp', 'lot-probe-not-a-uuid')
      returning source_entry_id into v_back;
      if v_back is distinct from 'lot-probe-not-a-uuid' then
        raise exception 'PROBE-FAIL: got %', v_back;
      end if;
      raise exception 'PROBE-OK';
    end $probe$;`)
    .then(() => ({ ok: false, note: 'do-block returned without raising' }))
    .catch((e) => {
      const m = String(e.message);
      if (m.includes('PROBE-OK')) return { ok: true };
      if (m.includes('PROBE-SKIP')) return { ok: true, note: 'skipped (no pages yet)' };
      return { ok: false, note: m.slice(0, 200) };
    });
  if (!probe.ok) bad(probe.note);
  else console.log(`  OK${probe.note ? ` (${probe.note})` : ' (stored, read back, rolled back)'}`);

  console.log('3. the demote clears stamps, is owner-scoped, and counts archived copies...');
  const [fn] = await sql(`
    select pg_get_functiondef(p.oid) as def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'demote_unowned_placements';`);
  if (!fn) bad('demote_unowned_placements is missing');
  else {
    if (!fn.def.includes('source_entry_id = null')) bad('does not clear the stamp');
    if (!fn.def.includes('pe.user_id = b2.owner_id')) bad('victim EXISTS is not owner-scoped');
    if (!fn.def.includes('archived_at is not null')) bad('archived copies are not counted as owned');
    if (!failed) console.log('  OK');
  }

  console.log('4. the victim predicate PLANS (the 42883 that would abort collection deletes)...');
  await sql(`
    select 1 from public.binder_slots s2
      join public.binder_pages p2 on p2.id = s2.page_id
      join public.binders b2 on b2.id = p2.binder_id
     where s2.source_entry_id is not null
       and exists (select 1 from public.portfolio_entries pe
                    where pe.user_id = b2.owner_id and pe.id = s2.source_entry_id)
     limit 0;`);
  console.log('  OK');

  console.log('5. the trigger is still a deferred constraint trigger...');
  const [trg] = await sql(`
    select t.tgdeferrable, t.tginitdeferred from pg_trigger t
    join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'collections'
      and t.tgname = 'collections_demote_placements';`);
  if (!trg) bad('collections_demote_placements is missing');
  else if (!trg.tgdeferrable || !trg.tginitdeferred) bad('no longer deferred to commit');
  else console.log('  OK');

  console.log('6. the People ranking RPC (the other pending migration)...');
  const [sp] = await sql(`
    select pg_get_function_identity_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as result
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_profiles';`);
  if (!sp) bad('search_profiles is missing');
  else if (!sp.args.includes('p_offset') || !sp.result.includes('binder_votes'))
    console.log(`  NOT APPLIED YET (signature: ${sp.args}) - run apply-people-ranking.ps1`);
  else console.log('  OK (paged, ranked)');

  console.log('7. stamp census (what is actually stored right now)...');
  const [c] = await sql(`
    select
      (select count(*) from public.binder_slots
        where source_entry_id is not null and card_id is not null) as card_stamps,
      (select count(*) from public.binder_slots
        where source_entry_id is not null and card_id is null) as artwork_stamps,
      (select count(*) from public.binder_slots
        where source_entry_id is not null and card_id is not null
          and from_collection is distinct from true) as damaged,
      (select count(*) from public.binder_slots where from_collection) as consuming_pockets;`);
  console.log(`  stamped card pockets    : ${c.card_stamps}`);
  console.log(`  stamped artwork pockets : ${c.artwork_stamps}`);
  console.log(`  consuming pockets       : ${c.consuming_pockets}`);
  console.log(`  demote-damaged rows     : ${c.damaged}  (must be 0)`);
  if (Number(c.damaged) !== 0) bad(`${c.damaged} damaged pocket(s) remain`);
  if (Number(c.card_stamps) === 0) {
    console.log('  NOTE: no card stamps stored yet. Expected until a card is placed from the');
    console.log('        deployed build; place one owned card, reload, and re-run this.');
  }

  console.log(failed ? `\n${failed} CHECK(S) FAILED.` : '\nALL CHECKS PASSED.');
  process.exitCode = failed ? 2 : 0;
} catch (err) {
  console.log(`FAILED: ${err.message}`);
  process.exitCode = 2;
}
