/**
 * Applies 20260924190000_showcase_covers_pages.sql and proves the renderer can now see a page.
 *
 * THE CHECK THAT MATTERS is the one that failed before: fetch the binder the way
 * api/og-image-binder.js does, as ANON, and count the pages it gets back. Asserting that
 * `binder_pages.is_public` is true in the database would have passed while the renderer still saw
 * nothing, because what it sees is decided by RLS and a nested select, not by the column alone.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (m) => {
  console.log(`FAILED: ${m}`);
  process.exit(2);
};
const step = (n, w) => console.log(`Step ${n}: ${w}`);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

function envVar(name) {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === name) return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}
const URL_ = envVar('EXPO_PUBLIC_SUPABASE_URL');
const KEY = envVar('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

async function sql(query) {
  const res = await fetch('https://api.supabase.com/v1/projects/piikwvntldytjejxmcla/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await res.text();
  if (!res.ok) fail(`query refused: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

step(1, 'applying');
await sql(readFileSync(join(ROOT, 'supabase', 'migrations', '20260924190000_showcase_covers_pages.sql'), 'utf8'));
console.log('  applied');

step(2, 'what the renderer sees, as anon, for each published puzzle');
const puzzles = await sql(`
  select d.publish_on, d.source_binder_id, d.source_page_id, coalesce(b.is_public, false) as showcased, b.title
    from public.daily_puzzles d
    left join public.binders b on b.id = d.source_binder_id
   order by d.publish_on;
`);
const select = encodeURIComponent('title,binder_pages(id,binder_slots(card_id))');
let drawable = 0;
for (const p of puzzles) {
  if (!p.showcased) {
    console.log(`  --   ${p.publish_on}  "${p.title}" is not showcased, so it cannot be drawn`);
    continue;
  }
  const res = await fetch(
    `${URL_}/rest/v1/binders?id=eq.${p.source_binder_id}&is_public=eq.true&select=${select}`,
    { headers: { apikey: KEY } },
  );
  const [row] = await res.json();
  const pages = row?.binder_pages ?? [];
  const withCards = pages.filter((pg) => (pg.binder_slots ?? []).some((s) => s.card_id));
  const named = p.source_page_id ? pages.some((pg) => pg.id === p.source_page_id) : null;
  console.log(
    `  ${withCards.length ? 'ok  ' : 'BAD '} ${p.publish_on}  "${p.title}"  pages visible: ${pages.length}`
    + `  with cards: ${withCards.length}  its own page visible: ${named}`,
  );
  if (withCards.length) drawable += 1;
  else fail(`the renderer still sees no drawable page for ${p.publish_on}`);
  if (named === false) fail(`the page ${p.publish_on} was published from is not visible to the renderer`);
}
console.log(`  ${drawable} of ${puzzles.length} puzzle(s) can be drawn`);

step(3, 'and the endpoint itself agrees');
const ready = puzzles.find((p) => p.showcased && p.source_page_id);
if (ready) {
  const url = `https://michi-maker.com/api/og-image-hires?id=${ready.source_binder_id}`
    + `&v=2&t=${ready.publish_on}&page=${ready.source_page_id}`;
  const res = await fetch(url);
  const type = res.headers.get('content-type') ?? '';
  console.log(`  ${ready.publish_on}: ${res.status} ${type}`);
  if (!res.ok || !type.startsWith('image/')) {
    console.log(`  body: ${(await res.text()).slice(0, 200)}`);
    fail('the renderer still refuses; the page visibility was not the only problem');
  }
  console.log(`  drew ${(Number(res.headers.get('content-length') ?? 0) / 1024).toFixed(0)} KB`);
} else {
  console.log('  no puzzle is both showcased and has a page id, so the endpoint was not called');
}

console.log('\nOK.');
