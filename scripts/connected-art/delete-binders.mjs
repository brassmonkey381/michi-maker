/**
 * Remove the connected-artwork binders from the account. Lists them first; --apply deletes.
 *
 * TITLES, NOT A PATTERN. It names the four titles this import can create, so it cannot reach a
 * binder someone made by hand that happens to mention connected art. The 4x4 title is included
 * although no group has ever needed it, so a shape that stops appearing cannot leave a stale binder
 * behind when the importer, which only deletes the titles it is about to write, stops naming it.
 *
 * Pages and slots go by cascade. This is destructive and deliberately has an --apply gate.
 *
 *   node scripts/connected-art/delete-binders.mjs           (lists, deletes nothing)
 *   node scripts/connected-art/delete-binders.mjs --apply    (through the .ps1 wrapper)
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const USERNAME = process.env.IMPORT_USERNAME || 'fakemichi';
const TITLES = [
  'Connected Art: Pairs',
  'Connected Art: Threes and Small Scenes',
  'Connected Art: The Wide Ones',
  'Connected Art: The Big Ones',
];

const APPLY = process.argv.includes('--apply');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);
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
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const list = TITLES.map(q).join(', ');

step(1, `resolving @${USERNAME}`);
const who = await sql(`select id, username from public.profiles where lower(username) = lower(${q(USERNAME)}) limit 1;`);
if (!who.length) fail(`no profile with username '${USERNAME}'`);
const me = who[0];
console.log(`  ${me.id}  @${me.username}`);

step(2, 'what is there');
const found = await sql(`
  select b.id, b.title,
         (select count(*) from public.binder_pages p where p.binder_id = b.id) as pages,
         (select count(*) from public.binder_slots s
            join public.binder_pages p2 on p2.id = s.page_id where p2.binder_id = b.id) as slots
  from public.binders b
  where b.owner_id = ${q(me.id)} and b.title in (${list})
  order by b.title;
`);
if (!found.length) console.log('  nothing to remove');
for (const b of found) console.log(`  "${b.title}"  ${b.pages} pages, ${b.slots} cards`);

if (!APPLY) {
  console.log('\nOK: listed only. Re-run with --apply to delete.');
} else {
  step(3, 'deleting');
  const gone = await sql(`delete from public.binders where owner_id = ${q(me.id)} and title in (${list}) returning id, title;`);
  for (const b of gone) console.log(`  removed "${b.title}"`);

  step(4, 'reading it back');
  const left = await sql(`select count(*)::int as n from public.binders where owner_id = ${q(me.id)} and title in (${list});`);
  if (Number(left[0].n) !== 0) fail(`${left[0].n} still present after the delete`);
  console.log('  0 remain');
  console.log('\nOK: the connected-artwork binders are gone.');
}
