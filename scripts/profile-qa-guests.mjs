/**
 * READ-ONLY (TRI-005, owner 2026-11-16: "can we get more info on these accounts? Do any of them have
 * traits that seem like real users at all?"). Profiles the exact set delete-qa-guests.mjs would
 * remove, looking for anything a person leaves behind and a script does not: coming back on
 * another day, long sessions, building by hand over minutes, solving puzzles, arriving from an ad
 * or another site, a phone-sized window. Selects only; writes NOTHING. Prints counts, event names,
 * campaign words and 8-character id prefixes; no IPs, no full ids.
 * Output: state/out/qa-guests-profile.txt. Run through state/profile-qa-guests.ps1.
 */
import fs from 'node:fs';
import { ROOT, appSql } from './lib/michi.mjs';

const CUTOFF = '2026-11-16T00:00:00Z';
const lines = [];
const out = (s = '') => { console.log(s); lines.push(s); };
const table = (rows) => {
  if (!rows.length) return out('  (none)');
  for (const r of rows) out('  ' + Object.entries(r).map(([k, v]) => `${k}=${v ?? '-'}`).join('  '));
};

// The same set as delete-qa-guests.mjs (keep the two in step).
const SET = `
  select u.id, u.created_at from auth.users u
   where u.is_anonymous
     and u.email is null and u.phone is null
     and u.created_at < '${CUTOFF}'
     and exists (select 1 from auth.sessions s where s.user_id = u.id)
     and not exists (select 1 from auth.sessions s where s.user_id = u.id and coalesce(s.user_agent, '') not ilike '%HeadlessChrome%')
     and not exists (select 1 from public.entitlements t where t.user_id = u.id)
     and not exists (select 1 from public.billing_customers c where c.user_id = u.id)
     and not exists (select 1 from public.binders b where b.owner_id = u.id and b.is_public)
     and not exists (select 1 from public.contest_entries e where e.owner_id = u.id)`;

// One row per account with everything a person would leave behind.
const PER = `
  with q as (${SET}),
  ses as (
    select a.user_id, count(*) as sessions,
           count(distinct a.started_at::date) as days,
           max(extract(epoch from (a.last_seen_at - a.started_at))) as longest_s,
           extract(epoch from (max(a.last_seen_at) - min(a.started_at))) as span_s
      from public.analytics_sessions a where a.user_id in (select id from q) group by 1),
  ev as (
    select e.user_id, count(*) as events, count(distinct e.name) as kinds
      from public.analytics_events e where e.user_id in (select id from q) group by 1),
  st as (
    select distinct on (e.user_id) e.user_id,
           e.props->>'utm_source' as src, e.props->>'utm_medium' as med, e.props->>'utm_campaign' as camp,
           e.props->>'referrer' as ref, (e.props->>'viewport_w')::int as vw, (e.props->>'viewport_h')::int as vh
      from public.analytics_events e
     where e.name = 'session.start' and e.user_id in (select id from q)
     order by e.user_id, e.ts),
  bs as (
    select b.owner_id as user_id, count(distinct b.id) as binders, count(s.id) as slots,
           max(extract(epoch from (greatest(b.updated_at, coalesce(s.updated_at, b.updated_at)) - b.created_at))) as built_over_s
      from public.binders b
      left join public.binder_pages p on p.binder_id = b.id
      left join public.binder_slots s on s.page_id = p.id
     where b.owner_id in (select id from q) group by 1),
  pz as (
    select x.user_id, count(*) as plays, count(*) filter (where x.guess is not null) as answered
      from public.puzzle_plays x where x.user_id in (select id from q) group by 1),
  ua as (
    select s.user_id,
           case when max(s.user_agent) ilike '%Edg/%' then 'win-edge-headless'
                when max(s.user_agent) ilike '%Windows%' then 'win-chrome-headless'
                when max(s.user_agent) ilike '%Linux%' then 'linux-headless'
                when max(s.user_agent) ilike '%Mac%' then 'mac-headless' else 'other' end as ua
      from auth.sessions s where s.user_id in (select id from q) group by 1)
  select q.id, q.created_at, ua.ua,
         coalesce(ses.sessions, 0) as sessions, coalesce(ses.days, 0) as days,
         round(coalesce(ses.longest_s, 0)) as longest_s, round(coalesce(ses.span_s, 0)) as span_s,
         coalesce(ev.events, 0) as events, coalesce(ev.kinds, 0) as kinds,
         st.src, st.med, st.camp, st.ref, st.vw, st.vh,
         coalesce(bs.binders, 0) as binders, coalesce(bs.slots, 0) as slots, round(coalesce(bs.built_over_s, 0)) as built_over_s,
         coalesce(pz.plays, 0) as plays, coalesce(pz.answered, 0) as answered
    from q left join ses on ses.user_id = q.id left join ev on ev.user_id = q.id left join st on st.user_id = q.id
    left join bs on bs.user_id = q.id left join pz on pz.user_id = q.id left join ua on ua.user_id = q.id`;

out(`Headless guests, profile, read-only, ${new Date().toISOString()}, cutoff ${CUTOFF}`);
const rows = await appSql(PER);
const n = rows.length;
const num = (v) => Number(v ?? 0);
out(`\n${n} accounts (the dry run's set)`);

out('\n1. by browser string');
const by = (f) => { const m = new Map(); for (const r of rows) { const k = f(r) ?? '(none)'; m.set(k, (m.get(k) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
for (const [k, v] of by((r) => r.ua)) out(`  ${k}: ${v}`);

out('\n2. how they arrived (first session.start): utm_source / utm_medium / campaign');
for (const [k, v] of by((r) => (r.src || r.med || r.camp ? `${r.src ?? '-'} / ${r.med ?? '-'} / ${r.camp ?? '-'}` : null)).slice(0, 15)) out(`  ${k}: ${v}`);
out('   referrer (another site linked here):');
for (const [k, v] of by((r) => r.ref).slice(0, 10)) out(`  ${k}: ${v}`);

out('\n3. window size at the first session (width x height)');
for (const [k, v] of by((r) => (r.vw ? `${r.vw}x${r.vh}` : null)).slice(0, 12)) out(`  ${k}: ${v}`);
out(`  phone-sized (width under 500): ${rows.filter((r) => r.vw && num(r.vw) < 500).length}`);

out('\n4. what a person leaves behind (each line counts accounts)');
const traits = {
  'came back on a second day': (r) => num(r.days) >= 2,
  'more than one session': (r) => num(r.sessions) >= 2,
  'a session longer than 10 minutes': (r) => num(r.longest_s) > 600,
  'active across more than an hour': (r) => num(r.span_s) > 3600,
  '30+ events': (r) => num(r.events) >= 30,
  '10+ kinds of event': (r) => num(r.kinds) >= 10,
  'a binder edited 5+ minutes after it was made': (r) => num(r.built_over_s) > 300,
  'answered a daily puzzle': (r) => num(r.answered) > 0,
  'arrived from an ad or link (utm_source set, not qa)': (r) => r.src && r.med !== 'qa',
  'referred by another site': (r) => !!r.ref,
  'phone-sized window': (r) => r.vw && num(r.vw) < 500,
  'no session or event at all': (r) => num(r.sessions) === 0 && num(r.events) === 0,
};
for (const [k, f] of Object.entries(traits)) out(`  ${k}: ${rows.filter(f).length}`);

out('\n5. sign-up rhythm: gap to the previous headless sign-up, how many fall in each band');
const times = rows.map((r) => Date.parse(r.created_at)).sort((a, b) => a - b);
const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000);
const bands = [['under 15 s', 15], ['15-60 s', 60], ['1-3 min', 180], ['3-10 min', 600], ['10-60 min', 3600], ['1-24 h', 86400], ['over a day', Infinity]];
let lo = 0;
for (const [label, hi] of bands) { out(`  ${label}: ${gaps.filter((g) => g >= lo && g < hi).length}`); lo = hi; }
out('   sign-ups by hour of day (UTC), all days together:');
const hours = Array(24).fill(0); for (const t of times) hours[new Date(t).getUTCHours()] += 1;
out('  ' + hours.map((v, h) => `${String(h).padStart(2, '0')}h=${v}`).join(' '));

out('\n6. the most person-like accounts (scored on section 4; top 20, 8-character id prefixes)');
const score = (r) => Object.entries(traits).filter(([k]) => k !== 'no session or event at all').reduce((s, [, f]) => s + (f(r) ? 1 : 0), 0);
const top = rows.map((r) => ({ r, s: score(r) })).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s || num(b.r.events) - num(a.r.events)).slice(0, 20);
out(`  accounts scoring 2 or more: ${rows.filter((r) => score(r) >= 2).length}; 3 or more: ${rows.filter((r) => score(r) >= 3).length}`);
table(top.map(({ r, s }) => ({ id: String(r.id).slice(0, 8), score: s, made: String(r.created_at).slice(0, 16), ua: r.ua, days: r.days, sessions: r.sessions, longest_s: r.longest_s, events: r.events, kinds: r.kinds, binders: r.binders, slots: r.slots, built_over_s: r.built_over_s, answered: r.answered, src: r.src, med: r.med, vw: r.vw })));

out('\n7. the event names those top accounts sent (counts)');
const topIds = top.map((x) => `'${x.r.id}'`).join(',');
if (topIds) table(await appSql(`select name, count(*) as n from public.analytics_events where user_id in (${topIds}) group by 1 order by 2 desc limit 25;`));
else out('  (none)');

out('\nRead-only: nothing was changed.');
fs.mkdirSync(`${ROOT}/state/out`, { recursive: true });
fs.writeFileSync(`${ROOT}/state/out/qa-guests-profile.txt`, lines.join('\n') + '\n');
