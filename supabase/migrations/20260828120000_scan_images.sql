-- Real scans: every card confirmed into the collection keeps its best cropped scan.
--
-- The pointer is a BIRTH FIELD: tcgscan-app mints the storage path before the entry exists and
-- writes it in the same addEntry call. Written later it would be a whole-row-LWW casualty (any
-- other device's edit to the entry would push the row back with the pointer null); written at
-- birth, no device ever holds a pointer-less copy of the row, so the merge cannot lose it. The
-- bytes upload asynchronously: a path whose object does not exist yet is LEGAL and displays as
-- the catalog image, exactly like a dangling storage_id.
--
-- Soft pointer discipline (the storage-layer rules, unchanged): nullable, no FK, no CHECK, no
-- trigger. The sync push is one batch per table and one rejected row poisons the whole batch;
-- nothing about this column can reject a row. michi's CSV import inserts with an explicit column
-- list and never mentions it.

alter table public.portfolio_entries add column if not exists scan_path text;

comment on column public.portfolio_entries.scan_path is
  'Bucket-relative path ({uid}/{uuid}.jpg) of this lot''s best cropped scan in the scan-images '
  'bucket. Minted at entry creation; bytes upload async, so the object may lag or never arrive '
  '(display falls back to the catalog image). Null = not a scanned add (manual, CSV, guest).';

-- ── the scan-images bucket ─────────────────────────────────────────────────────────────────
-- Public like binder-art, and for the same reason: the images embed in surfaces that may one
-- day be public, and a public bucket serves by URL with no SELECT policy, which also keeps it
-- unlistable. The uuid filename is the privacy: paths are unguessable and are only discoverable
-- through the owner's own portfolio_entries rows (owner-only RLS).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scan-images', 'scan-images', true, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Owner-folder writes only, same shape as binder-art. No SELECT policy on purpose.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'Users upload scan images to their own folder') then
    create policy "Users upload scan images to their own folder"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'scan-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'Users update their own scan images') then
    create policy "Users update their own scan images"
      on storage.objects for update to authenticated
      using (bucket_id = 'scan-images' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'scan-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'Users delete their own scan images') then
    create policy "Users delete their own scan images"
      on storage.objects for delete to authenticated
      using (bucket_id = 'scan-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
