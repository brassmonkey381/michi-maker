/**
 * READ-ONLY (TRI-005, 2026-11-17: "find source"). Per headless guest made AFTER a cutoff (default
 * 2026-11-16T19:00Z, the pass-2 removal's), one row: created_at (UTC), OS and HeadlessChrome major,
 * the first page it opened, the referrer and utm tags of its first session.start, its event count,
 * and the network it came from as the first two octets of the IP only (IPv6: first two groups),
 * from auth.sessions and the sign-up's auth.audit_log_entries row. No ids, no full IPs, no emails.
 * Selects only; writes NOTHING to the database. Output: state/out/qa-guests-source.txt.
 *   node scripts/source-qa-guests.mjs [--after=<ISO>]
 */
import fs from 'node:fs';
import { ROOT, appSql, q } from './lib/michi.mjs';

const after = (process.argv.find((a) => a.startsWith('--after=')) ?? '--after=2026-11-16T19:00:00Z').slice(8);
if (Number.isNaN(Date.parse(after))) { console.error('source-qa-guests: --after must be an ISO time'); process.exit(2); }

const lines = [];
const out = (s = '') => { console.log(s); lines.push(s); };
const prefix = (ip) => {
  if (!ip) return '-';
  const s = String(ip).replace(/\/\d+$/, '');
  if (s.includes(':')) return s.split(':').slice(0, 2).join(':') + ':…';
  return s.split('.').slice(0, 2).join('.') + '.x.x';
};

const rows = await appSql(`
  with g as (
    select u.id, u.created_at from auth.users u
     where u.is_anonymous and u.email is null and u.phone is null
       and u.created_at >= ${q(after)}::timestamptz
       and exists (select 1 from auth.sessions s where s.user_id = u.id)
       and not exists (select 1 from auth.sessions s where s.user_id = u.id and coalesce(s.user_agent, '') not ilike '%HeadlessChrome%')),
  ua as (
    select distinct on (s.user_id) s.user_id, s.user_agent, host(s.ip) as ip
      from auth.sessions s where s.user_id in (select id from g) order by s.user_id, s.created_at),
  al as (
    select distinct on (a.payload->>'actor_id') a.payload->>'actor_id' as uid, a.ip_address as ip
      from auth.audit_log_entries a
     where a.created_at >= ${q(after)}::timestamptz - interval '1 hour'
       and a.payload->>'actor_id' in (select id::text from g)
     order by a.payload->>'actor_id', a.created_at),
  pv as (
    select distinct on (e.user_id) e.user_id, e.props->>'route' as route
      from public.analytics_events e where e.name = 'page.view' and e.user_id in (select id from g)
     order by e.user_id, e.ts),
  st as (
    select distinct on (e.user_id) e.user_id, e.props->>'referrer' as ref, e.props->>'utm_source' as src,
           e.props->>'utm_medium' as med, e.props->>'utm_campaign' as camp, e.props->>'viewport_w' as vw
      from public.analytics_events e where e.name = 'session.start' and e.user_id in (select id from g)
     order by e.user_id, e.ts),
  ev as (select e.user_id, count(*) as n, min(e.ts) as first_ts from public.analytics_events e where e.user_id in (select id from g) group by 1)
  select g.created_at, ua.user_agent, ua.ip as session_ip, al.ip as audit_ip, pv.route, st.ref, st.src, st.med, st.camp, st.vw,
         coalesce(ev.n, 0) as events, ev.first_ts
    from g left join ua on ua.user_id = g.id left join al on al.uid = g.id::text
    left join pv on pv.user_id = g.id left join st on st.user_id = g.id left join ev on ev.user_id = g.id
   order by g.created_at;`);

out(`Headless guests made after ${after}, read-only, ${new Date().toISOString()}: ${rows.length} accounts`);
for (const [i, r] of rows.entries()) {
  const ua = String(r.user_agent ?? '');
  const os = /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : /Mac/.test(ua) ? 'Mac' : 'other';
  const major = (ua.match(/HeadlessChrome\/(\d+)/) ?? [])[1] ?? '-';
  out(`\n${i + 1}. created_at=${r.created_at} UTC`);
  out(`   browser=${os} HeadlessChrome/${major}  ua_shape=${ua.replace(/\d+(\.\d+)*/g, 'N').slice(0, 140) || '-'}`);
  out(`   network: session_ip=${prefix(r.session_ip)}  signup_audit_ip=${prefix(r.audit_ip)}`);
  out(`   first_page=${r.route ?? '-'}  width=${r.vw ?? '-'}  referrer=${r.ref ?? '-'}  utm_source=${r.src ?? '-'}  utm_medium=${r.med ?? '-'}  utm_campaign=${r.camp ?? '-'}`);
  out(`   events=${r.events}  first_event=${r.first_ts ?? '-'}`);
}
out('\nRead-only: nothing was changed.');
fs.mkdirSync(`${ROOT}/state/out`, { recursive: true });
fs.writeFileSync(`${ROOT}/state/out/qa-guests-source.txt`, lines.join('\n') + '\n');
