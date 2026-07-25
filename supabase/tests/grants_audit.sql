-- Client-grant audit. READ-ONLY: run any time (Supabase SQL editor / psql) to confirm the
-- client roles still hold only privileges that an RLS policy actually backs.
--
-- Expected output: a single row, 'OK: grants match policies'.
-- Any other row is a finding:
--   LEFTOVER — a privilege that should never be granted to a browser role (TRUNCATE bypasses
--              RLS entirely) or an anon write (no policy in this schema grants one).
--   BROKEN   — a policy permits a write but the underlying GRANT is missing, so the app would
--              fail with a permission error. This is the failure mode to watch for after
--              tightening grants.
--   DEFAULTS — new tables would again be created with the permissive Supabase defaults; see
--              20260725160000_tighten_client_grants.sql. (The supabase_admin-owned default set
--              is expected to stay permissive on hosted Supabase and only affects tables that
--              Supabase itself creates.)
--   NO_RLS   — a public table without RLS, where grants ARE load-bearing; revoking would break it.

select 'LEFTOVER: '||table_name||' '||privilege_type||' -> '||grantee as finding
from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated')
  and (privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
       or (grantee='anon' and privilege_type in ('INSERT','UPDATE','DELETE')))

union all
select 'BROKEN: '||p.tablename||' '||c.cmd||' policy exists but grant missing'
from pg_policies p
cross join lateral (
  select unnest(case when p.cmd='ALL' then array['INSERT','UPDATE','DELETE'] else array[p.cmd] end) as cmd
) c
where p.schemaname='public' and c.cmd in ('INSERT','UPDATE','DELETE')
  and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
  and not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema='public' and g.table_name=p.tablename
      and g.grantee='authenticated' and g.privilege_type=c.cmd)

union all
select 'DEFAULTS: '||defaclrole::regrole::text||' would re-grant '||array_to_string(defaclacl,' | ')
from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' and d.defaclobjtype='r'
  and defaclrole::regrole::text = 'postgres'
  and array_to_string(d.defaclacl,',') ~ 'anon=[a-z]*[wadDxt]'

union all
select 'NO_RLS: '||relname||' has no row level security'
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity

union all
select 'OK: grants match policies'
where not exists (
  select 1 from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
    and (privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
         or (grantee='anon' and privilege_type in ('INSERT','UPDATE','DELETE'))))
order by 1;
