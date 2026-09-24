/**
 * Applies 20260924180000_puzzle_readable_by_anon.sql and checks the split it creates:
 * a sessionless reader must SEE the puzzle and must NOT be able to reach the answer.
 *
 * Both halves matter. Only checking that the page now loads would pass just as well if the change
 * had opened the answers too.
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
await sql(readFileSync(join(ROOT, 'supabase', 'migrations', '20260924180000_puzzle_readable_by_anon.sql'), 'utf8'));
console.log('  applied');

// Over HTTP with only the publishable key: no Authorization header at all, which is exactly what a
// cold incognito tab sends before the app has minted its guest session.
const URL_ = envVar('EXPO_PUBLIC_SUPABASE_URL');
const KEY = envVar('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const asAnon = (path) => fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY } });

step(2, 'a sessionless reader sees the live puzzle');
const res = await asAnon('daily_puzzles?select=publish_on,theme_count,card_ids&order=publish_on.desc');
const rows = await res.json();
console.log(`  ${res.status}, ${Array.isArray(rows) ? rows.length : 0} row(s)`);
for (const r of rows ?? []) console.log(`    ${r.publish_on}  ${r.theme_count} themes  ${r.card_ids?.length ?? 0} cards`);
if (!Array.isArray(rows) || rows.length === 0) fail('a sessionless reader still sees no puzzle');

step(3, 'and cannot see tomorrow');
const [today] = await sql('select public.puzzle_today() as d;');
const ahead = (rows ?? []).filter((r) => r.publish_on > today.d);
console.log(`  today is ${today.d}; rows dated later: ${ahead.length}`);
if (ahead.length) fail('an unpublished puzzle is visible without a session');

step(4, 'and cannot reach the answers');
const ansRes = await asAnon('daily_puzzle_answers?select=themes');
const ans = await ansRes.json();
console.log(`  daily_puzzle_answers: ${ansRes.status}, ${Array.isArray(ans) ? ans.length : JSON.stringify(ans).slice(0, 80)}`);
if (Array.isArray(ans) && ans.length > 0) fail('the answers are readable without a session');
const [stored] = await sql('select count(*)::int as n from public.daily_puzzle_answers;');
if (Number(stored.n) === 0) fail('the check is vacuous: there were no answers to hide');
console.log(`  ${stored.n} answer row(s) exist, and a sessionless reader gets none of them`);

step(5, 'playing still needs a session');
const play = await fetch(`${URL_}/rest/v1/rpc/guess_puzzle_word`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_puzzle_id: rows[0] ? undefined : undefined, p_word: 'flowers' }),
});
console.log(`  guess_puzzle_word without a session: ${play.status}`);
if (play.ok) fail('a sessionless caller was allowed to guess');

console.log('\nOK: the puzzle reads publicly, the answer does not, and playing still needs a session.');
