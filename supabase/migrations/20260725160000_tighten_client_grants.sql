-- Defense in depth: strip client-role privileges that no RLS policy backs.
--
-- WHY. Supabase's default privileges grant `arwdDxtm` (insert/select/update/delete/TRUNCATE/
-- references/trigger/maintain) to `anon` and `authenticated` on every table created in `public`.
-- RLS is what actually protects the data, and it does — but two gaps are worth closing:
--   1. TRUNCATE IS NOT SUBJECT TO RLS. A table-level TRUNCATE grant to `anon` is the one
--      privilege here that RLS cannot restrain. (PostgREST doesn't expose TRUNCATE, so this was
--      latent rather than exploitable — but it should not be granted at all.)
--   2. Write grants with no matching policy are pure surface area: RLS already denies them, so
--      revoking is behaviour-neutral and leaves privileges mirroring intent.
--
-- SAFETY. Verified before writing this: every table in `public` has RLS ENABLED, there are no
-- views, and NO policy anywhere grants a write to `anon` (every write policy is `to
-- authenticated`). The revokes below are therefore no-ops behaviourally — each one removes a
-- privilege that RLS was already refusing. `postgres` and `service_role` are untouched, so
-- edge functions (payments-webhook, etc.) keep working exactly as before.
--
-- The `authenticated` pass is DERIVED FROM THE POLICIES rather than hardcoded, so it stays
-- correct as tables come and go: a command is kept only where a policy (its own, or an ALL
-- policy) actually grants it to that role.

do $$
declare
  t record;
  c text;
  keep boolean;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- Never appropriate for a browser client, and TRUNCATE bypasses RLS.
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', t.tablename);

    -- No policy in this schema grants anon a write; make the grants say so.
    execute format('revoke insert, update, delete on table public.%I from anon', t.tablename);

    -- For authenticated, keep only what a policy actually backs.
    foreach c in array array['INSERT', 'UPDATE', 'DELETE'] loop
      select exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = t.tablename
          and p.cmd in ('ALL', c)
          and ('authenticated' = any (p.roles) or 'public' = any (p.roles))
      ) into keep;
      if not keep then
        execute format('revoke %s on table public.%I from authenticated', c, t.tablename);
      end if;
    end loop;
  end loop;
end $$;

-- MAINTAIN (PG17) — same reasoning; tolerated if the server predates it.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('revoke maintain on table public.%I from anon, authenticated', t.tablename);
    exception when others then null;
    end;
  end loop;
end $$;

-- Stop FUTURE tables from re-acquiring the same surface. Without this, the next `create table`
-- in a migration silently restores TRUNCATE-to-anon and we're back where we started. After this,
-- a new table defaults to anon=r (SELECT) and authenticated=arwd — RLS governs the rest.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public
  revoke insert, update, delete on tables from anon;
do $$
begin
  execute 'alter default privileges in schema public revoke maintain on tables from anon, authenticated';
exception when others then raise notice 'MAINTAIN not supported here: %', sqlerrm;
end $$;

-- The same defaults are ALSO registered under supabase_admin. Altering that set requires
-- membership in supabase_admin, which `postgres` does not have on hosted Supabase — this block
-- is expected to no-op there, and is kept so the migration is complete on projects where it can
-- run. Impact of it failing is limited: that default only applies to tables created BY
-- supabase_admin (Supabase-managed internals), not to tables our migrations create.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public
             revoke truncate, references, trigger on tables from anon, authenticated';
  execute 'alter default privileges for role supabase_admin in schema public
             revoke insert, update, delete on tables from anon';
exception when others then
  raise notice 'supabase_admin default privileges not alterable here (expected on hosted): %', sqlerrm;
end $$;
