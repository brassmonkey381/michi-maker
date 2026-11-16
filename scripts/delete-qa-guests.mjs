/**
 * TRI-005 option B (owner's pick 2026-11-15): remove the anonymous guest accounts that headless QA
 * browsers created on production, with everything that cascades from them (profile, binders and
 * their pages and pockets, puzzle plays, analytics sessions and events). Cannot be undone.
 *
 *   node scripts/delete-qa-guests.mjs            dry run: prints what would go, changes nothing
 *   node scripts/delete-qa-guests.mjs --apply    deletes, only if every guard below holds
 *
 * WHO COUNTS (stricter than the read-only finder):
 *   - auth.users.is_anonymous, and no email and no phone
 *   - has at least one auth.sessions row, and EVERY session's user agent says HeadlessChrome
 *     (one session from a real browser and the account is kept)
 *   - created before CUTOFF (so no QA walk still in flight is cut off mid-run)
 *   - 0 entitlements, 0 billing_customers, 0 public binders, 0 contest entries
 * GUARDS (--apply refuses, nothing deleted, if any fails): the count is between 1 and MAX; the
 * whole thing runs as ONE statement, so it either removes the full set or nothing.
 * Prints counts only (no ids beyond 8-character prefixes, no IPs). Output: state/out/qa-guests-delete.txt.
 */
import fs from 'node:fs';
import { ROOT, appSql } from './lib/michi.mjs';

const APPLY = process.argv.includes('--apply');
// --cutoff=<ISO> for a later pass (the second pass, 2026-11-16, took the headless guests made after
// the first run's cutoff: TCGScan's BiBo previews until 00:02 UTC and one Vercel build check).
const CUTOFF = (process.argv.find((a) => a.startsWith('--cutoff=')) ?? '--cutoff=2026-11-16T00:00:00Z').slice(9);
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(CUTOFF)) { console.error(`bad --cutoff ${CUTOFF}`); process.exit(2); }
const MAX = 2500;

const lines = [];
const out = (s = '') => { console.log(s); lines.push(s); };
const table = (rows) => {
  if (!rows.length) return out('  (none)');
  for (const r of rows) out('  ' + Object.entries(r).map(([k, v]) => `${k}=${v ?? '-'}`).join('  '));
};
const save = () => {
  fs.mkdirSync(`${ROOT}/state/out`, { recursive: true });
  fs.writeFileSync(`${ROOT}/state/out/qa-guests-delete.txt`, lines.join('\n') + '\n');
};

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

out(`Headless guest removal, ${APPLY ? 'APPLY' : 'DRY RUN'}, ${new Date().toISOString()}, cutoff ${CUTOFF}`);

out('\n1. what would go');
const [c] = await appSql(`
  with q as (${SET})
  select (select count(*) from q) as accounts,
         (select count(*) from public.profiles p where p.id in (select id from q)) as profiles,
         (select count(*) from public.binders b where b.owner_id in (select id from q)) as binders,
         (select count(*) from public.binder_pages p where p.binder_id in (select b.id from public.binders b where b.owner_id in (select id from q))) as pages,
         (select count(*) from public.puzzle_plays x where x.user_id in (select id from q)) as puzzle_plays,
         (select count(*) from public.analytics_sessions a where a.user_id in (select id from q)) as analytics_sessions,
         (select count(*) from public.analytics_events e where e.user_id in (select id from q)) as analytics_events,
         (select count(*) from public.reddit_conversions r where r.user_id in (select id from q)) as reddit_conversions,
         (select count(*) from public.image_reviews r where r.owner_id in (select id from q)) as image_reviews_left_orphaned;`);
table([c]);

out('\n2. kept by the stricter rules (matched the finder, but not this set)');
table(await appSql(`
  select count(*) as headless_guests_kept
    from auth.users u
   where u.is_anonymous
     and exists (select 1 from auth.sessions s where s.user_id = u.id and s.user_agent ilike '%HeadlessChrome%')
     and u.id not in (select id from (${SET}) q);`));

out('\n3. guests per day that would drop out of the counts (UTC)');
table(await appSql(`select created_at::date as day, count(*) as removed from (${SET}) q group by 1 order by 1;`));

out('\n3b. where they come from: newest 10 sign-ups, and the browser strings (version digits only, no IPs)');
table(await appSql(`select created_at from (${SET}) q order by created_at desc limit 10;`));
table(await appSql(`
  select regexp_replace(s.user_agent, '[0-9]+(\\.[0-9]+)+', 'N', 'g') as user_agent_shape,
         string_agg(distinct substring(s.user_agent from 'HeadlessChrome/([0-9]+)'), ',') as chrome_major,
         count(distinct s.user_id) as accounts, max(s.created_at) as newest_session
    from auth.sessions s where s.user_id in (select id from (${SET}) q)
   group by 1 order by accounts desc limit 15;`));

const n = Number(c.accounts);
if (!APPLY) {
  out(`\nDry run: nothing was changed. --apply would remove ${n} accounts.`);
  save();
  process.exit(0);
}
if (!(n >= 1 && n <= MAX)) {
  out(`\nREFUSED: ${n} accounts is outside 1..${MAX}. Nothing was changed.`);
  save();
  process.exit(4);
}

out(`\n4. deleting ${n} accounts in one statement`);
const [d] = await appSql(`
  with gone as (delete from auth.users where id in (select id from (${SET}) q) returning id)
  select count(*) as deleted from gone;`);
table([d]);

out('\n5. after');
table(await appSql(`select count(*) as matching_now from (${SET}) q;`));
save();
