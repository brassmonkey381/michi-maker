/**
 * Applies 20260924140000_puzzle_backdrop.sql and proves a published puzzle carries the page's image.
 *
 * THE THING TO CHECK is that a COLOUR is left behind while an IMAGE is carried, because both live
 * in the same text column and telling them apart is the whole of the change.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PROJECT_REF = 'piikwvntldytjejxmcla';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (m) => { console.log(`FAILED: ${m}`); process.exit(2); };
const step = (n, w) => console.log(`Step ${n}: ${w}`);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const pick = (rows, k) => rows.find((r) => r[k] !== undefined)?.[k];

step(1, 'applying');
await sql(readFileSync(join(ROOT, 'supabase', 'migrations', '20260924140000_puzzle_backdrop.sql'), 'utf8'));
console.log('  applied');

step(2, 'a page whose background is an image');
const [admin] = await sql(`select id from public.profiles where is_admin order by created_at limit 1;`);
const [page] = await sql(`
  select p.id, p.background_color from public.binder_pages p
    join public.binders b on b.id = p.binder_id
   where b.owner_id = ${q(admin.id)} and b.title like 'Daily Puzzle:%'
     and p.background_color like 'http%'
     and (select count(*) from public.binder_slots s
           where s.page_id = p.id and s.slot_type = 'card' and s.card_id is not null) > 0
   limit 1;
`);
if (!page) fail('no puzzle page with an image background to test with');
console.log(`  ${String(page.background_color).slice(0, 78)}…`);

const as = (uid, body) => `set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
  ${body}`;

step(3, 'publishing carries it');
const pid = pick(await sql(as(admin.id, `select public.admin_publish_puzzle(date '1996-01-01', '${page.id}'::uuid, array['flowers','city']) as id;`)), 'id');
const [got] = await sql(`select backdrop_url from public.daily_puzzles where id = ${q(pid)};`);
console.log(`  backdrop_url set: ${got.backdrop_url === page.background_color}`);
if (got.backdrop_url !== page.background_color) fail('the image did not reach the puzzle');

step(4, 'a colour is left behind');
await sql(`update public.binder_pages set background_color = '#112233' where id = ${q(page.id)};`);
await sql(as(admin.id, `select public.admin_publish_puzzle(date '1996-01-01', '${page.id}'::uuid, array['flowers','city']);`));
const [colour] = await sql(`select backdrop_url from public.daily_puzzles where id = ${q(pid)};`);
console.log(`  backdrop_url for a #rrggbb page: ${JSON.stringify(colour.backdrop_url)}`);
if (colour.backdrop_url !== null) fail('a colour was carried across as if it were a picture');
await sql(`update public.binder_pages set background_color = ${q(page.background_color)} where id = ${q(page.id)};`);

step(5, 'cleaning up');
await sql(as(admin.id, `select public.admin_unpublish_puzzle(${q(pid)});`));
await sql(`delete from public.puzzle_vocabulary where word in ('flowers','city');`);
const [back] = await sql(`select background_color from public.binder_pages where id = ${q(page.id)};`);
console.log(`  the page's own background is back: ${back.background_color === page.background_color}`);
if (back.background_color !== page.background_color) fail('the test left the page changed');

console.log('\nOK: a puzzle wears the backdrop of the page it came from.');
