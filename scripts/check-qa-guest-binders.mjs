/**
 * READ-ONLY (TRI-005, owner 2026-11-16: "the 326 private binders (650 pages) concern me still. Do
 * we need to keep any of these? Has anyone been looking at them? Have they ever gone public?").
 * For the binders owned by the exact set delete-qa-guests.mjs would remove: were they ever public,
 * did anyone else open, like or copy one, did the owner share a link, did anyone else's binder copy
 * from them, and what is in them. Selects only; writes NOTHING. Prints counts, titles and 8-character
 * id prefixes; no IPs, no full ids. Output: state/out/qa-guest-binders.txt.
 * Run through state/check-qa-guest-binders.ps1.
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
  select u.id from auth.users u
   where u.is_anonymous
     and u.email is null and u.phone is null
     and u.created_at < '${CUTOFF}'
     and exists (select 1 from auth.sessions s where s.user_id = u.id)
     and not exists (select 1 from auth.sessions s where s.user_id = u.id and coalesce(s.user_agent, '') not ilike '%HeadlessChrome%')
     and not exists (select 1 from public.entitlements t where t.user_id = u.id)
     and not exists (select 1 from public.billing_customers c where c.user_id = u.id)
     and not exists (select 1 from public.binders b where b.owner_id = u.id and b.is_public)
     and not exists (select 1 from public.contest_entries e where e.owner_id = u.id)`;
const B = `select b.id from public.binders b where b.owner_id in (${SET})`;

out(`Headless guests' binders, read-only, ${new Date().toISOString()}, cutoff ${CUTOFF}`);

out('\n1. how many, and were any EVER public');
out('   (made_public_at is stamped on every private-to-public switch and kept after unpublishing)');
table(await appSql(`
  select count(*) as binders,
         count(*) filter (where b.is_public) as public_now,
         count(*) filter (where b.made_public_at is not null) as ever_public
    from public.binders b where b.id in (${B});`));
table(await appSql(`
  select count(*) as make_public_events, count(*) filter (where (e.props->>'public')::boolean) as switched_on
    from public.analytics_events e where e.name = 'binder.public' and e.user_id in (${SET});`));

out('\n2. did ANYONE ELSE open one (page.view of /binder/<id> by a user outside this set)');
table(await appSql(`
  with ids as (${B})
  select count(*) as views, count(distinct e.user_id) as viewers
    from public.analytics_events e
   where e.name = 'page.view'
     and e.props->>'route' like '/binder/%'
     and split_part(split_part(e.props->>'route', '/', 3), '?', 1) in (select id::text from ids)
     and e.user_id not in (${SET});`));
out('   (the same, counting the owners themselves, for scale)');
table(await appSql(`
  with ids as (${B})
  select count(*) as owner_views
    from public.analytics_events e
   where e.name = 'page.view'
     and e.props->>'route' like '/binder/%'
     and split_part(split_part(e.props->>'route', '/', 3), '?', 1) in (select id::text from ids)
     and e.user_id in (${SET});`));

out('\n3. liked by anyone, copied by anyone, link shared by the owner');
table(await appSql(`
  with ids as (${B})
  select (select count(*) from public.binder_likes l where l.binder_id in (select id from ids)) as likes,
         (select count(*) from public.binder_likes l where l.binder_id in (select id from ids) and l.user_id not in (${SET})) as likes_from_others,
         (select count(*) from public.binder_reshares r where r.source_binder_id in (select id::text from ids)) as copied_from_these,
         (select count(*) from public.binder_reshares r where r.source_binder_id in (select id::text from ids) and r.copied_by not in (${SET})) as copied_by_others,
         (select count(*) from public.analytics_events e where e.name = 'share.link' and e.props->>'binder_id' in (select id::text from ids)) as share_links;`));

out('\n4. what is in them');
table(await appSql(`
  with ids as (${B})
  select count(distinct p.id) as pages, count(s.id) as pockets_filled,
         count(s.id) filter (where s.card_id is not null) as cards,
         count(s.id) filter (where s.slot_type <> 'card') as art_or_text_pockets,
         count(distinct b.id) filter (where s.id is null) as binders_with_no_pockets
    from public.binders b
    left join public.binder_pages p on p.binder_id = b.id
    left join public.binder_slots s on s.page_id = p.id
   where b.id in (select id from ids);`));
out('   titles, most common first (top 25):');
table(await appSql(`select b.title, count(*) as n from public.binders b where b.id in (${B}) group by 1 order by 2 desc, 1 limit 25;`));
out('   made by day (UTC):');
table(await appSql(`select b.created_at::date as day, count(*) as n from public.binders b where b.id in (${B}) group by 1 order by 1;`));

out('\n5. pictures they uploaded (binder-art bucket, files under each owner\'s folder)');
table(await appSql(`
  select count(*) as files, coalesce(round(sum((o.metadata->>'size')::bigint) / 1048576.0, 1), 0) as mb
    from storage.objects o
   where o.bucket_id = 'binder-art' and (storage.foldername(o.name))[1] in (select id::text from (${SET}) q);`));

out('\n6. the binders with the most cards (top 10, 8-character prefixes)');
table(await appSql(`
  select left(b.id::text, 8) as id, b.title, b.created_at::date as made, count(s.id) as pockets,
         b.made_public_at is not null as ever_public
    from public.binders b
    left join public.binder_pages p on p.binder_id = b.id
    left join public.binder_slots s on s.page_id = p.id
   where b.id in (${B}) group by b.id order by 4 desc limit 10;`));

out('\nRead-only: nothing was changed.');
fs.mkdirSync(`${ROOT}/state/out`, { recursive: true });
fs.writeFileSync(`${ROOT}/state/out/qa-guest-binders.txt`, lines.join('\n') + '\n');
