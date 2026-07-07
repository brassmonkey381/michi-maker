-- Custom binder artwork: a Storage bucket for user-uploaded images, plus columns to persist
-- an artwork slot's image (uploaded OR pasted) so it survives reload / syncs across devices.

-- ---------------------------------------------------------------------------
-- Storage bucket for user-uploaded binder art
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'binder-art',
  'binder-art',
  true, -- public read (images are embedded in binders, some of which are public)
  5242880, -- 5 MB per file
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Authenticated users may write only within their own "{uid}/…" folder. No SELECT policy is
-- needed: a public bucket serves objects at their public URL without one, and omitting it means
-- clients can't list/enumerate the bucket (see the "public_bucket_allows_listing" advisor).
create policy "Users upload binder-art to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'binder-art'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users update their own binder-art"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'binder-art'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'binder-art'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete their own binder-art"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'binder-art'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Persist artwork-slot images
-- ---------------------------------------------------------------------------
-- A custom-artwork slot's image URL (uploaded to binder-art, or a pasted external URL) and,
-- for a sliced artwork, the sub-rectangle of that image this slot shows (fractions 0–1).
alter table public.binder_slots add column if not exists image_url text;
alter table public.binder_slots add column if not exists image_crop jsonb;
