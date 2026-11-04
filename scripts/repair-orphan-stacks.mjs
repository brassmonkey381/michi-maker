/**
 * REPAIR: every stack whose box is missing (parent_id null, or pointing at a row that is not a box
 * in the same collection) gets a NEW box, numbered with the lowest free Bo code in its account, and
 * moves into it (owner, 2026-11-04: "for orphaned stacks, make a parent Bo[N] and move the stack in
 * there"). One new box per collection, shared by that collection's orphans. Both rows get
 * updated_at = now() so every device takes them on its next reconcile (tcgscan sync is
 * last-write-wins on updated_at; no trigger sets it).
 *
 * Prints what it will do, does it in one transaction, then re-counts orphans (must be 0).
 * Safe to re-run: with no orphans it changes nothing. Run through repair-orphan-stacks.ps1.
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const token = process.env.SUPABASE_ACCESS_TOKEN;
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
const ORPHANS = `
  select s.user_id, s.collection_id, s.id
  from public.storage_units s
  where s.kind = 'stack' and not exists (
    select 1 from public.storage_units b
    where b.user_id = s.user_id and b.id = s.parent_id and b.kind = 'box' and b.collection_id = s.collection_id)`;
try {
  console.log('Step 1: orphaned stacks');
  const before = await sql(ORPHANS + ';');
  console.log(`  ${before.length} orphan(s)`);
  for (const o of before) console.log(`    ${o.id} (account ${o.user_id.slice(0, 8)}, collection ${o.collection_id})`);
  if (!before.length) {
    console.log('DONE: nothing to repair');
    process.exit(0);
  }

  console.log('Step 2: one new box per collection, then the stacks move in (one transaction)');
  await sql(`
    begin;
    create temp table orphan_cols on commit drop as
      select distinct o.user_id, o.collection_id,
             'box-fix-' || substr(md5(o.user_id::text || '/' || o.collection_id || '/' || now()::text), 1, 16) as box_id
      from (${ORPHANS}) o;
    -- The lowest free Bo number per account, one after another for an account with several.
    insert into public.storage_units (id, user_id, collection_id, name, kind, code, created_at, updated_at)
    select oc.box_id, oc.user_id, oc.collection_id, '', 'box',
           (select min(n) from generate_series(1, 10000) n
            where not exists (select 1 from public.storage_units x
                              where x.user_id = oc.user_id and x.kind = 'box' and x.code = n))
           -- A second orphaned collection in the same account counts on from there; should that land on
           -- a taken number, the app's code check moves the later box on (lib/unit-codes resolveCodes).
           + (row_number() over (partition by oc.user_id order by oc.collection_id) - 1),
           now(), now()
    from orphan_cols oc;
    update public.storage_units s
    set parent_id = oc.box_id, updated_at = now()
    from orphan_cols oc
    where s.kind = 'stack' and s.user_id = oc.user_id and s.collection_id = oc.collection_id
      and not exists (select 1 from public.storage_units b
                      where b.user_id = s.user_id and b.id = s.parent_id and b.kind = 'box'
                        and b.collection_id = s.collection_id and b.id <> oc.box_id);
    commit;`);
  console.log('  OK');

  console.log('Step 3: re-count');
  const after = await sql(ORPHANS + ';');
  if (after.length) {
    console.log(`FAILED: ${after.length} orphan(s) remain`);
    process.exit(1);
  }
  const boxes = await sql(`select id, code, collection_id from public.storage_units where id like 'box-fix-%' order by created_at desc limit 20;`);
  for (const b of boxes) console.log(`  new box Bo${b.code} (${b.id}) in collection ${b.collection_id}`);
  console.log('DONE: 0 orphans. Phones pick the new boxes up on their next sync.');
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exit(1);
}
