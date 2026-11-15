/**
 * READ-ONLY (TRI-005 plan). Finds the anonymous guest accounts that scripted QA (headless Chromium)
 * created on production, so Brian can decide whether to remove them. Selects only; writes NOTHING.
 * Tells them from real visitors by the browser that signed them up: auth.sessions.user_agent says
 * "HeadlessChrome" for Playwright's headless Chromium, which a person's browser never does.
 * Prints user id prefixes and counts only (no IPs, no emails). Output: state/out/qa-guests.txt.
 */
import fs from 'node:fs';
import { ROOT, appSql } from './lib/michi.mjs';

const lines = [];
const out = (s = '') => { console.log(s); lines.push(s); };
const table = (rows) => {
  if (!rows.length) return out('  (none)');
  for (const r of rows) out('  ' + Object.entries(r).map(([k, v]) => `${k}=${v ?? '-'}`).join('  '));
};

const QA = `
  select u.id, u.created_at
    from auth.users u
   where u.is_anonymous
     and exists (select 1 from auth.sessions s where s.user_id = u.id and s.user_agent ilike '%HeadlessChrome%')`;

out('Headless-browser guest accounts on production, read-only, ' + new Date().toISOString());

out('\n1. per day (UTC): headless guests vs all guests created');
table(await appSql(`
  select u.created_at::date as day, count(*) as all_guests,
         count(*) filter (where u.id in (select id from (${QA}) q)) as headless_guests
    from auth.users u where u.is_anonymous and u.created_at >= '2026-11-01'
   group by 1 order by 1;`));

out('\n2. headless guests: what each one owns (rows that would go with it)');
table(await appSql(`
  select left(q.id::text, 8) as user_prefix, q.created_at,
         (select count(*) from public.binders b where b.owner_id = q.id) as binders,
         (select count(*) from public.analytics_sessions a where a.user_id = q.id) as analytics_sessions,
         (select count(*) from public.analytics_events e where e.user_id = q.id) as analytics_events,
         (select count(*) from public.puzzle_plays p where p.user_id = q.id) as puzzle_plays,
         (select count(*) from public.entitlements t where t.user_id = q.id) as entitlements,
         (select count(*) from public.profiles pr where pr.id = q.id) as profiles
    from (${QA}) q order by q.created_at;`));

out('\n3. guests with NO session row at all (user agent unknown), last 3 days, for comparison');
table(await appSql(`
  select count(*) as guests_without_session
    from auth.users u
   where u.is_anonymous and u.created_at >= now() - interval '3 days'
     and not exists (select 1 from auth.sessions s where s.user_id = u.id);`));

out('\nRead-only: nothing was changed.');
fs.mkdirSync(`${ROOT}/state/out`, { recursive: true });
fs.writeFileSync(`${ROOT}/state/out/qa-guests.txt`, lines.join('\n') + '\n');
