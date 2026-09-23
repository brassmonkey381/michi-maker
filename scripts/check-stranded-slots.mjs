/**
 * READ-ONLY. How many pockets are stranded at the swap park row, as a share of all pockets?
 *
 * `swapSlotCells` parks a pocket at row_index = 1_000_000 mid-swap (binderRepo.ts PARK_ROW). If
 * the swap dies after the park and both unpark attempts also fail, the row stays there: still in
 * the table, still loaded by the client (mapPage filters on slot_type, not on row bounds), and
 * rendering nowhere. To the person who owns it, the card is gone.
 *
 * This measures the blast radius and writes NOTHING. The number is the point: a rounding error
 * means the strand path is not worth engineering around, and the delete paths are the whole story.
 *
 * Run through state/check-stranded-slots.ps1.
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const PARK_ROW = 1_000_000;
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
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

console.log('Step 1: counting pockets');
const [totals] = await sql(`
  select
    count(*)::bigint                                             as total,
    count(*) filter (where row_index >= ${PARK_ROW})::bigint     as stranded,
    count(distinct page_id) filter (where row_index >= ${PARK_ROW})::bigint as pages_hit
  from public.binder_slots;
`);
const total = Number(totals.total);
const stranded = Number(totals.stranded);
const pct = total ? (100 * stranded) / total : 0;

console.log(`  pockets in the table : ${total.toLocaleString()}`);
console.log(`  stranded at park row : ${stranded.toLocaleString()}`);
console.log(`  share                : ${pct.toFixed(4)}%`);
console.log(`  pages affected       : ${Number(totals.pages_hit).toLocaleString()}`);

// Node on Windows asserts inside libuv if the process exits while a fetch handle is still
// closing, so the nothing-to-report path falls through instead of calling process.exit.
// Node on Windows asserts inside libuv if the process exits while a fetch handle is still
// closing, so the nothing-to-report path falls through instead of calling process.exit.
if (stranded === 0) {
  console.log('\nOK: nothing is stranded. The park path is not costing anyone a card today.');
} else {
  console.log('\nStep 2: who is affected, and how old');
  const rows = await sql(`
    select b.user_id, count(*)::bigint as pockets, min(s.created_at) as oldest, max(s.created_at) as newest
    from public.binder_slots s
    join public.binder_pages p on p.id = s.page_id
    join public.binders b on b.id = p.binder_id
    where s.row_index >= ${PARK_ROW}
    group by b.user_id
    order by pockets desc
    limit 20;
  `);
  console.log(`  accounts affected: ${rows.length}${rows.length === 20 ? '+ (capped at 20)' : ''}`);
  for (const r of rows) {
    console.log(`    ${String(r.user_id).slice(0, 8)}  ${r.pockets} pocket(s)  ${String(r.oldest).slice(0, 10)} to ${String(r.newest).slice(0, 10)}`);
  }
  console.log('\nNothing was written. To clear them, the statement is:');
  console.log(`    delete from public.binder_slots where row_index >= ${PARK_ROW};`);
}
