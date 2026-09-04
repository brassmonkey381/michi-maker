/**
 * READ-ONLY. Why does "Rebuild in michi" say a binder holds 0 cards?
 *
 * The rebuild row is drawn from the BINDER's pockets, not from the collection's cards. Those are
 * different facts: a card is in a collection because you own it, and in a pocket because the
 * scanner recorded a page and a slot for it (portfolio_entries.storage_id + storage_page +
 * storage_pos). This dumps both sides for every binder unit so the gap is visible rather than
 * inferred.
 *
 * SELECTs only. Nothing is written, nothing is echoed but counts and names.
 *
 * Run through inspect-tcgscan-binders.ps1, which loads the token silently.
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const EMAIL = process.env.INSPECT_EMAIL ?? 'bstockman1@gmail.com';

if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (run this through the .ps1)');
  process.exit(2);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.log(`FAILED: query -> HTTP ${res.status}`);
    console.log(text.slice(0, 500));
    process.exit(3);
  }
  return text ? JSON.parse(text) : [];
}

const esc = (s) => String(s).replace(/'/g, "''");

console.log('Step 1: resolving the account...');
const who = await sql(`select id from auth.users where lower(email) = lower('${esc(EMAIL)}') limit 1`);
if (!who.length) {
  console.log(`FAILED: no auth user with email ${EMAIL}`);
  process.exit(4);
}
const uid = who[0].id;
console.log(`  OK (id ends ...${String(uid).slice(-6)})`);

console.log('');
console.log('Step 2: collections and their storage units...');
const units = await sql(`
  select c.id as collection_id,
         c.name as collection_name,
         (select count(*) from public.portfolio_entries e
            where e.user_id = c.user_id and e.collection_id = c.id) as collection_cards,
         u.id as unit_id, u.name as unit_name, u.kind,
         u.grid_rows, u.grid_cols, u.page_count
    from public.collections c
    left join public.storage_units u
      on u.user_id = c.user_id and u.collection_id = c.id
   where c.user_id = '${uid}'
   order by c.name, u.name
`);
if (!units.length) console.log('  (no collections)');
for (const u of units) {
  console.log(
    `  ${u.collection_name} (${u.collection_cards} cards)` +
      (u.unit_id ? `  ->  ${u.kind}: ${u.unit_name}  grid ${u.grid_rows} x ${u.grid_cols}  page_count ${u.page_count}` : '  ->  (no storage units)'),
  );
}

console.log('');
console.log('Step 3: what actually points at each unit...');
const pointed = await sql(`
  select u.name as unit_name,
         count(e.id) as entries,
         count(*) filter (where e.storage_page is not null and e.storage_pos is not null) as pocketed,
         count(*) filter (where e.storage_page is null or e.storage_pos is null) as loose_in_unit,
         min(e.storage_page) as first_page, max(e.storage_page) as last_page,
         count(*) filter (where e.storage_rows is not null) as with_page_shape
    from public.storage_units u
    left join public.portfolio_entries e
      on e.user_id = u.user_id and e.storage_id = u.id
   where u.user_id = '${uid}'
   group by u.id, u.name
   order by u.name
`);
if (!pointed.length) console.log('  (no storage units at all)');
for (const p of pointed) {
  console.log(
    `  ${p.unit_name}: ${p.entries} entries reference it, ${p.pocketed} have a page AND a pocket, ` +
      `${p.loose_in_unit} do not, pages ${p.first_page ?? '-'}..${p.last_page ?? '-'}, ` +
      `${p.with_page_shape} carry a per-page shape`,
  );
}

console.log('');
console.log('Step 4: entries with NO storage_id (loose in the collection)...');
const loose = await sql(`
  select c.name as collection_name, count(*) as loose
    from public.portfolio_entries e
    join public.collections c on c.user_id = e.user_id and c.id = e.collection_id
   where e.user_id = '${uid}' and e.storage_id is null
   group by c.name
   order by c.name
`);
if (!loose.length) console.log('  (none: every card claims a storage unit)');
for (const l of loose) console.log(`  ${l.collection_name}: ${l.loose} loose`);

console.log('');
console.log('Step 5: a sample of the pockets, if there are any...');
const sample = await sql(`
  select u.name as unit_name, e.card_id, e.storage_page, e.storage_pos,
         e.storage_rows, e.storage_cols
    from public.portfolio_entries e
    join public.storage_units u on u.user_id = e.user_id and u.id = e.storage_id
   where e.user_id = '${uid}'
   order by u.name, e.storage_page nulls last, e.storage_pos nulls last
   limit 20
`);
if (!sample.length) console.log('  (no entry references any storage unit)');
for (const s of sample) {
  console.log(
    `  ${s.unit_name}  page ${s.storage_page ?? 'null'}  pos ${s.storage_pos ?? 'null'}  ` +
      `shape ${s.storage_rows ?? '-'} x ${s.storage_cols ?? '-'}  ${s.card_id}`,
  );
}

console.log('');
console.log('Done. A binder reads "0 cards" when its `pocketed` count above is 0.');
