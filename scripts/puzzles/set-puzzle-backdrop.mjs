/**
 * Point every page of every puzzle binder at one backdrop.
 *
 * WHY NOT THE URL AS GIVEN. A pixabay.com/images/download/... address is the DOWNLOAD button's
 * link, not an image address: fetched without a pixabay session it answers 403 with an HTML error
 * page, so a page pointed at it draws nothing and silently falls back to the colour behind it. The
 * address that works hotlinked is the one the Pixabay API returns for the same photograph
 * (largeImageURL), which is checked here before a single row is written.
 *
 * THESE ADDRESSES CAN EXPIRE. A pixabay.com/get/... link carries a signature. It is fine for a
 * private working binder and is the wrong thing to ship a public daily puzzle on; the app's own
 * stock-art picker re-hosts a picture into the user's bucket for exactly that reason.
 *
 * binder_pages carries a set_updated_at trigger (init migration), so the stamp is the database's
 * job here and is deliberately not sent by hand.
 *
 *   node scripts/puzzles/set-puzzle-backdrop.mjs <url>            (checks, writes nothing)
 *   node scripts/puzzles/set-puzzle-backdrop.mjs <url> --apply
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const USERNAME = process.env.IMPORT_USERNAME || 'fakemichi';
const TITLE_PREFIX = 'Daily Puzzle: ';

const APPLY = process.argv.includes('--apply');
const url = process.argv.slice(2).find((a) => a.startsWith('http'));
const token = process.env.SUPABASE_ACCESS_TOKEN;

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
if (!url) fail('usage: node scripts/puzzles/set-puzzle-backdrop.mjs <https url> [--apply]');

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
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

step(1, 'checking the address actually serves an image');
const head = await fetch(url, { redirect: 'follow' });
const type = head.headers.get('content-type') ?? '';
console.log(`  ${head.status} ${type}`);
if (!head.ok) fail(`that address answers ${head.status}, so every page would draw nothing`);
if (!type.startsWith('image/')) fail(`that address serves ${type}, not an image`);

step(2, `finding @${USERNAME}'s puzzle binders`);
const pages = await sql(`
  select p.id, b.title, p.position
  from public.binder_pages p
  join public.binders b on b.id = p.binder_id
  join public.profiles pr on pr.id = b.owner_id
  where lower(pr.username) = lower(${q(USERNAME)})
    and b.title like ${q(`${TITLE_PREFIX}%`)}
  order by b.title, p.position;
`);
if (!pages.length) fail(`no binders titled "${TITLE_PREFIX}..." on that account`);
const byBinder = new Map();
for (const p of pages) byBinder.set(p.title, (byBinder.get(p.title) ?? 0) + 1);
for (const [t, n] of byBinder) console.log(`  ${String(n).padStart(2)} page(s)  ${t}`);
console.log(`  ${pages.length} page(s) in ${byBinder.size} binder(s)`);

if (!APPLY) {
  console.log('\nOK: checked only. Re-run with --apply to write.');
} else {
  step(3, 'writing');
  const updated = await sql(`
    update public.binder_pages p
       set background_color = ${q(url)}
      from public.binders b, public.profiles pr
     where p.binder_id = b.id and b.owner_id = pr.id
       and lower(pr.username) = lower(${q(USERNAME)})
       and b.title like ${q(`${TITLE_PREFIX}%`)}
    returning p.id;
  `);
  console.log(`  ${updated.length} page(s) updated`);

  step(4, 'reading it back');
  const [check] = await sql(`
    select count(*)::int as total,
           count(*) filter (where p.background_color = ${q(url)})::int as pointed
      from public.binder_pages p
      join public.binders b on b.id = p.binder_id
      join public.profiles pr on pr.id = b.owner_id
     where lower(pr.username) = lower(${q(USERNAME)})
       and b.title like ${q(`${TITLE_PREFIX}%`)};
  `);
  console.log(`  ${check.pointed} of ${check.total} page(s) now carry it`);
  if (check.pointed !== check.total) fail('some pages did not take the backdrop');
  console.log('\nOK: every puzzle page shares one backdrop.');
}
