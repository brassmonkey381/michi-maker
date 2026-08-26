-- tcgscan-michi-maker: profile bios + avatar uploads, and the profiles read policy finally
-- means what "private profile" says.
--
-- Profiles have been public by default since 20260710120000, but a profile page is a username
-- and an initial in a circle: nothing worth landing on when a shared binder brings someone in.
-- This adds the content half (a short bio, an uploadable avatar), and closes the read-policy gap
-- that had to be closed BEFORE a profile holds self-written text:
--
-- THE GAP. The SELECT policy on profiles has been `using (true)` since init. search_profiles and
-- the feeds honour is_public, but a direct REST select does not: a private profile's username,
-- avatar, marketing_consent, preferences and is_admin were all readable by anyone with the anon
-- key. Tolerable while the row held nothing personal; not tolerable under a bio.
--
-- THE FIX, in two parts:
--   1. Row level: non-owners can only read PUBLIC profiles. Owners always read their own row
--      (settings needs marketing_* and preferences). The subqueries inside the binder policies
--      keep working: they require the owner's profile to be public, which is exactly the row
--      this policy exposes.
--   2. Column level, for the signed-out `anon` role only: the marketing and admin columns are
--      revoked. anon surfaces (og-profile, the public profile page) select explicit public
--      columns, so nothing breaks; `authenticated` keeps the full grant because the owner's own
--      settings read their own row with `select('*')`.
--
-- Residual, accepted and recorded: a signed-in account can still read marketing_* /
-- preferences / is_admin of PUBLIC profiles via direct REST. Closing that fully needs
-- column-splitting or a definer view; not worth it today, revisit if preferences ever hold
-- anything sensitive.

-- ---------------------------------------------------------------------------
-- 1. The content
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists bio text;
-- One short paragraph, hard-capped server-side so the client cap is not just advisory.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_bio_len'
  ) then
    alter table public.profiles add constraint profiles_bio_len
      check (bio is null or char_length(bio) <= 280);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The avatars bucket (binder-art's shape: public read by URL, own-folder writes, no listing)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true,
  2097152, -- 2MB; an avatar renders at 72px, and the client downscales before upload anyway
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Avatar uploads to own folder" on storage.objects;
create policy "Avatar uploads to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Avatar updates in own folder" on storage.objects;
create policy "Avatar updates in own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Avatar deletes in own folder" on storage.objects;
create policy "Avatar deletes in own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- 3. The read policy
-- ---------------------------------------------------------------------------
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Public profiles are viewable; owners see their own" on public.profiles;
create policy "Public profiles are viewable; owners see their own"
  on public.profiles for select to anon, authenticated
  using (is_public or id = (select auth.uid()));

-- Column-level for the signed-out role: everything marketing/admin/preference-shaped goes dark.
revoke select on public.profiles from anon;
grant select (id, username, avatar_url, bio, is_public, created_at)
  on public.profiles to anon;

-- Owners may LIST their own avatar folder (needed so replacing an avatar can delete the old
-- file). Scoped to the owner's folder, so the bucket still cannot be enumerated publicly; the
-- binder-art bucket deliberately has no select policy at all, but binder-art never replaces
-- files, and avatars do on every change.
drop policy if exists "Avatar owners can list their own folder" on storage.objects;
create policy "Avatar owners can list their own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
