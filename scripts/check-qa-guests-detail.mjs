/**
 * READ-ONLY (TRI-005 step 1, Brian's yes 2026-11-15 "TRI-005 yes read only go"). For the headless
 * guest accounts that find-qa-guests.mjs found: how many of their binders are public, what
 * deleting an auth user would cascade to, and how many of their analytics rows already carry the
 * utm_medium=qa marker. Selects only; writes NOTHING. Prints counts and table names only.
 * Output: state/out/qa-guests-detail.txt. Run through state/check-qa-guests-detail.ps1.
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
  select u.id from auth.users u
   where u.is_anonymous
     and exists (select 1 from auth.sessions s where s.user_id = u.id and s.user_agent ilike '%HeadlessChrome%')`;

out('Headless guests, detail, read-only, ' + new Date().toISOString());

out('\n1. their binders: public or private, and pages/slots under them');
table(await appSql(`
  select count(*) as binders,
         count(*) filter (where b.is_public) as public_binders,
         (select count(*) from public.binder_pages p where p.binder_id in (select b2.id from public.binders b2 where b2.owner_id in (${QA}))) as pages
    from public.binders b where b.owner_id in (${QA});`));

out('\n2. their public binders by likes (are they seen?)');
table(await appSql(`
  select count(*) filter (where coalesce((to_jsonb(b)->>'like_count')::int, 0) > 0) as public_with_likes,
         max(b.updated_at) as newest_update
    from public.binders b where b.is_public and b.owner_id in (${QA});`));

out('\n3. every foreign key that points at auth.users, and what a user delete does to it');
table(await appSql(`
  select c.conrelid::regclass as table_name, a.attname as column_name,
         case c.confdeltype when 'c' then 'CASCADE (rows deleted)' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
                            when 'r' then 'RESTRICT (blocks delete)' else 'NO ACTION (blocks delete)' end as on_delete
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
     and c.conrelid::regclass::text not like 'auth.%'
   order by 1, 2;`));

out('\n4. tables with a user_id or owner_id column and no foreign key to auth.users (left behind on delete)');
table(await appSql(`
  select format('%I.%I', col.table_schema, col.table_name) as table_name, col.column_name
    from information_schema.columns col
   where col.table_schema = 'public' and col.column_name in ('user_id', 'owner_id')
     and not exists (
       select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
          and c.conrelid = format('%I.%I', col.table_schema, col.table_name)::regclass and a.attname = col.column_name)
   order by 1;`));

out('\n5. analytics columns that could carry the qa marker');
table(await appSql(`
  select table_name, string_agg(column_name, ', ' order by column_name) as columns
    from information_schema.columns
   where table_schema = 'public' and table_name in ('analytics_sessions', 'analytics_events')
     and (column_name ilike '%utm%' or column_name ilike '%medium%' or column_name in ('props', 'properties', 'meta', 'context'))
   group by 1;`));

out('\n6. their analytics rows that already say qa anywhere in a utm/medium field');
table(await appSql(`
  select (select count(*) from public.analytics_sessions a where a.user_id in (${QA})) as sessions,
         (select count(*) from public.analytics_sessions a where a.user_id in (${QA})
            and to_jsonb(a)::text ~* '"utm_medium"\s*:\s*"qa"') as sessions_marked_qa,
         (select count(*) from public.analytics_events e where e.user_id in (${QA})) as events,
         (select count(*) from public.analytics_events e where e.user_id in (${QA})
            and to_jsonb(e)::text ~* '"utm_medium"\s*:\s*"qa"') as events_marked_qa;`));

out('\nRead-only: nothing was changed.');
fs.mkdirSync(`${ROOT}/state/out`, { recursive: true });
fs.writeFileSync(`${ROOT}/state/out/qa-guests-detail.txt`, lines.join('\n') + '\n');
