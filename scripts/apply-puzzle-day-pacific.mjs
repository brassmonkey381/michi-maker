/**
 * Applies 20260924170000_puzzle_day_pacific.sql and checks the boundary on both sides of DST.
 *
 * THE POINT OF THE CHECK is that a fixed offset looks correct in whichever season it was written
 * in and is an hour out in the other, silently, six months later. So the rollover instant is
 * asserted in September AND December, and the assertion is the local clock time, not the offset.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (m) => {
  console.log(`FAILED: ${m}`);
  process.exit(2);
};
const step = (n, w) => console.log(`Step ${n}: ${w}`);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

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
await sql(readFileSync(join(here, '..', 'supabase', 'migrations', '20260924170000_puzzle_day_pacific.sql'), 'utf8'));
console.log('  applied');

step(2, 'the day turns over at 3am Pacific in BOTH seasons');
const rows = await sql(`
  select d::date as day,
         to_char(public.puzzle_day_started(d::date) at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI TZ') as local_start,
         to_char(public.puzzle_day_started(d::date) at time zone 'UTC', 'HH24:MI') as utc_start
    from (values ('2026-09-24'), ('2026-12-24'), ('2027-03-15'), ('2027-07-04')) as v(d)
   order by 1;
`);
for (const r of rows) console.log(`  ${r.day}  starts ${r.local_start}  (${r.utc_start} UTC)`);
const bad = rows.filter((r) => !String(r.local_start).includes('03:00'));
if (bad.length) fail(`${bad.length} day(s) do not start at 03:00 local: ${JSON.stringify(bad)}`);
console.log('  all four start at 03:00 local, which a fixed offset could not do');

step(3, 'what today is now, and what is visible');
const [now] = await sql(`
  select public.puzzle_today() as today,
         (now() at time zone 'utc')::date as utc_today,
         to_char(now() at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') as pacific_now;
`);
console.log(`  pacific now ${now.pacific_now}  puzzle day ${now.today}  (UTC date would say ${now.utc_today})`);
if (now.today !== now.utc_today) {
  console.log('  NOTE: they differ right now, so the change moves which puzzle is live.');
}

const live = await sql(`
  select publish_on, publish_on <= public.puzzle_today() as visible
    from public.daily_puzzles order by publish_on;
`);
for (const r of live) console.log(`  ${r.publish_on}  visible: ${r.visible}`);

step(4, 'the rule exists once');
const [copies] = await sql(`
  select count(*)::int as n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('guess_puzzle_word','puzzle_answer','admin_puzzle_list')
     and pg_get_functiondef(p.oid) like '%at time zone ''America/Los_Angeles''%';
`);
console.log(`  functions still spelling the rule out themselves: ${copies.n}`);
if (Number(copies.n) !== 0) fail('a function still has its own copy of the day rule');

console.log('\nOK: one definition, 3am Pacific, correct across daylight saving.');
