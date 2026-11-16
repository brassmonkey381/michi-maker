/**
 * READ-ONLY (TRI-005, 2026-11-16: find what keeps signing up headless guests, so it can be stopped).
 * Groups every anonymous HeadlessChrome-only guest into BURSTS (sign-ups less than 10 minutes apart,
 * same browser shape), and for each burst prints its start and end (UTC), size, median gap, the
 * browser's major version, whether the accounts sent analytics, and the first page they opened with
 * its window size and campaign tags. No cutoff: includes guests made after 2026-11-16, so a job
 * still running shows up. Selects only; writes NOTHING. No IPs, no ids.
 * Output: state/out/qa-guests-trace.txt. Run through state/trace-qa-guests.ps1 BEFORE the removal.
 */
import fs from 'node:fs';
import { ROOT, appSql } from './lib/michi.mjs';

const lines = [];
const out = (s = '') => { console.log(s); lines.push(s); };

const rows = await appSql(`
  with g as (
    select u.id, u.created_at from auth.users u
     where u.is_anonymous and u.email is null and u.phone is null
       and exists (select 1 from auth.sessions s where s.user_id = u.id)
       and not exists (select 1 from auth.sessions s where s.user_id = u.id and coalesce(s.user_agent, '') not ilike '%HeadlessChrome%')),
  ua as (
    select s.user_id,
           case when max(s.user_agent) ilike '%Edg/%' then 'win-edge'
                when max(s.user_agent) ilike '%Windows%' then 'win-chrome'
                when max(s.user_agent) ilike '%Linux%' then 'linux'
                when max(s.user_agent) ilike '%Mac%' then 'mac' else 'other' end as shape,
           max(substring(s.user_agent from 'HeadlessChrome/([0-9]+)')) as major
      from auth.sessions s where s.user_id in (select id from g) group by 1),
  pv as (
    select distinct on (e.user_id) e.user_id, e.props->>'route' as route
      from public.analytics_events e where e.name = 'page.view' and e.user_id in (select id from g)
     order by e.user_id, e.ts),
  st as (
    select distinct on (e.user_id) e.user_id, e.props->>'viewport_w' as vw, e.props->>'utm_medium' as med, e.props->>'utm_campaign' as camp
      from public.analytics_events e where e.name = 'session.start' and e.user_id in (select id from g)
     order by e.user_id, e.ts),
  ev as (select e.user_id, count(*) as n from public.analytics_events e where e.user_id in (select id from g) group by 1)
  select g.created_at, ua.shape, ua.major, pv.route, st.vw, st.med, st.camp, coalesce(ev.n, 0) as events
    from g left join ua on ua.user_id = g.id left join pv on pv.user_id = g.id
    left join st on st.user_id = g.id left join ev on ev.user_id = g.id
   order by g.created_at;`);

out(`Headless guest bursts, read-only, ${new Date().toISOString()}: ${rows.length} accounts, no cutoff`);
out(`made after 2026-11-16T00:00Z (after the removal's cutoff): ${rows.filter((r) => r.created_at >= '2026-11-16').length}`);

const top = (arr, k) => {
  const m = new Map();
  for (const x of arr) { const v = x[k] ?? '-'; m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, c]) => `${v}(${c})`).join(' ');
};
const bursts = [];
for (const r of rows) {
  const t = Date.parse(r.created_at);
  const b = bursts.findLast((x) => x.shape === r.shape && t - x.end < 10 * 60 * 1000);
  if (b) { b.gaps.push((t - b.end) / 1000); b.end = t; b.rows.push(r); }
  else bursts.push({ shape: r.shape, start: t, end: t, gaps: [], rows: [r] });
}
bursts.sort((a, b) => a.start - b.start);
const iso = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

out(`\n${bursts.length} bursts (same browser shape, sign-ups under 10 min apart). Bursts of 5+ in full, newest last:`);
for (const b of bursts.filter((x) => x.rows.length >= 5)) {
  const silent = b.rows.filter((r) => Number(r.events) === 0).length;
  out(`  ${iso(b.start)} to ${iso(b.end)} UTC  ${b.shape}  n=${b.rows.length}  median_gap=${Math.round(med(b.gaps))}s  chrome=${top(b.rows, 'major')}  no_analytics=${silent}  first_page=${top(b.rows, 'route')}  width=${top(b.rows, 'vw')}  medium=${top(b.rows, 'med')}  campaign=${top(b.rows, 'camp')}`);
}
const small = bursts.filter((x) => x.rows.length < 5);
out(`\n${small.length} smaller bursts (1-4 sign-ups), ${small.reduce((s, b) => s + b.rows.length, 0)} accounts; the last 15:`);
for (const b of small.slice(-15)) out(`  ${iso(b.start)} UTC  ${b.shape}  n=${b.rows.length}  chrome=${top(b.rows, 'major')}  first_page=${top(b.rows, 'route')}  events=${b.rows.reduce((s, r) => s + Number(r.events), 0)}`);

out('\nRead-only: nothing was changed.');
fs.mkdirSync(`${ROOT}/state/out`, { recursive: true });
fs.writeFileSync(`${ROOT}/state/out/qa-guests-trace.txt`, lines.join('\n') + '\n');
