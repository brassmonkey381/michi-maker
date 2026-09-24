/**
 * Applies 20260924150000_puzzle_card_images.sql and checks the validation, because the whole point
 * of the column is that a page can draw without the 5.2 MB manifest, and a column quietly filled
 * with rubbish would leave every pocket blank with nothing to say why.
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

async function run(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { ok: res.ok, text: await res.text() };
}
async function sql(q2) { const r = await run(q2); if (!r.ok) fail(`query refused: ${r.text.slice(0, 400)}`); return JSON.parse(r.text); }
async function refused(q2, what) { const r = await run(q2); if (r.ok) fail(`${what}: it was ALLOWED`); return r.text; }
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const arr = (a) => `array[${a.map(q).join(',')}]::text[]`;
const pick = (rows, k) => rows.find((r) => r[k] !== undefined)?.[k];

step(1, 'applying');
await sql(readFileSync(join(ROOT, 'supabase', 'migrations', '20260924150000_puzzle_card_images.sql'), 'utf8'));
console.log('  applied');

step(2, 'a page to publish');
const [admin] = await sql(`select id from public.profiles where is_admin order by created_at limit 1;`);
const [page] = await sql(`
  select p.id, (select count(*)::int from public.binder_slots s
                 where s.page_id = p.id and s.slot_type = 'card' and s.card_id is not null) as n
    from public.binder_pages p join public.binders b on b.id = p.binder_id
   where b.owner_id = ${q(admin.id)} and b.title like 'Daily Puzzle:%'
     and (select count(*) from public.binder_slots s2
           where s2.page_id = p.id and s2.slot_type = 'card' and s2.card_id is not null) > 0
   limit 1;
`);
console.log(`  ${page.n} cards`);
const as = (uid, body) => `set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
  ${body}`;
const urls = Array.from({ length: page.n }, (_, i) => `https://example.test/card-${i}.webp`);

step(3, 'the addresses are stored, in order');
const pid = pick(await sql(as(admin.id,
  `select public.admin_publish_puzzle(date '1995-01-01', '${page.id}'::uuid, array['flowers','city'], null, ${arr(urls)}) as id;`)), 'id');
const [row] = await sql(`select card_image_urls, cardinality(card_image_urls) as n from public.daily_puzzles where id = ${q(pid)};`);
console.log(`  stored ${row.n}, first: ${row.card_image_urls[0]}`);
if (Number(row.n) !== page.n || row.card_image_urls[0] !== urls[0]) fail('the addresses did not land in order');

step(4, 'rubbish is refused');
const short = await refused(as(admin.id,
  `select public.admin_publish_puzzle(date '1995-01-02', '${page.id}'::uuid, array['a'], null, ${arr(urls.slice(1))});`),
  'a short array');
console.log(`  wrong length: ${short.slice(short.indexOf('expected'), short.indexOf('expected') + 46)}`);
const junk = await refused(as(admin.id,
  `select public.admin_publish_puzzle(date '1995-01-02', '${page.id}'::uuid, array['a'], null, ${arr(urls.map(() => ''))});`),
  'empty strings');
console.log(`  empty strings: refused`);

step(5, 're-publishing without them keeps what was there');
await sql(as(admin.id, `select public.admin_publish_puzzle(date '1995-01-01', '${page.id}'::uuid, array['flowers','city'], 'a new hint');`));
const [kept] = await sql(`select cardinality(card_image_urls) as n, hint from public.daily_puzzles where id = ${q(pid)};`);
console.log(`  still ${kept.n} addresses, hint is "${kept.hint}"`);
if (Number(kept.n) !== page.n) fail('a re-publish blanked the pictures');

step(6, 'cleaning up');
await sql(as(admin.id, `select public.admin_unpublish_puzzle(${q(pid)});`));
await sql(`delete from public.puzzle_vocabulary where word in ('flowers','city','a');`);
console.log('  gone');
console.log('\nOK: a puzzle can draw its cards without the manifest.');
