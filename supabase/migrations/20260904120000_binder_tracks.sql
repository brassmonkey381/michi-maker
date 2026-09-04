-- A BINDER CAN HAVE A SOUNDTRACK, and so can a page.
--
-- binders.track and binder_pages.track hold one uploaded audio file each, as
-- {url, name, bytes, attested_at}: the public URL in the binder-audio bucket, the name shown in
-- the player, the file's size, and when the owner attested they hold the rights. Null = silent,
-- which is every binder that exists today, so nothing is backfilled and nothing changes for
-- anyone until an owner adds a track. A page track plays while that page is open and hands back
-- to the binder track when it is left.
--
-- The bucket is public-read like binder-art (a track is played from a public binder page) with
-- owner-folder write policies, and capped at 8 MB per file — a three-minute MP3 is 3 to 5.

alter table public.binders
  add column if not exists track jsonb;
alter table public.binders
  drop constraint if exists binders_track_is_object;
alter table public.binders
  add constraint binders_track_is_object
  check (track is null or jsonb_typeof(track) = 'object');
comment on column public.binders.track is
  'The binder''s soundtrack: {url, name, bytes, attested_at}. url is in the binder-audio bucket. Null = silent.';

alter table public.binder_pages
  add column if not exists track jsonb;
alter table public.binder_pages
  drop constraint if exists binder_pages_track_is_object;
alter table public.binder_pages
  add constraint binder_pages_track_is_object
  check (track is null or jsonb_typeof(track) = 'object');
comment on column public.binder_pages.track is
  'This page''s own track, played while the page is open: {url, name, bytes, attested_at}. Null = the binder''s.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'binder-audio',
  'binder-audio',
  true,
  8388608, -- 8 MB per file
  array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm']
)
on conflict (id) do nothing;

drop policy if exists "Users upload binder-audio to their own folder" on storage.objects;
create policy "Users upload binder-audio to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'binder-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users update their own binder-audio" on storage.objects;
create policy "Users update their own binder-audio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'binder-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'binder-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete their own binder-audio" on storage.objects;
create policy "Users delete their own binder-audio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'binder-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
