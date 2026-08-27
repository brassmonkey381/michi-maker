-- scan-images: the owner can read their own folder, which is what makes an UPSERT legal.
--
-- THE BUG THIS FIXES. 20260828120000 gave scan-images binder-art's policy set (insert/update/
-- delete, deliberately no select) while tcgscan-app uploads the way scan-feedback does, with
-- `upsert: true`. An upsert has to read the row it might be replacing, and with no select policy
-- RLS refuses the whole write: every scan image failed with "new row violates row-level security
-- policy", the entry kept a path pointing at an object that was never created, and the display
-- silently fell back to catalog art. Twelve real scans were lost that way before the error was
-- visible at all.
--
-- Look at the two precedents together and the rule is plain: scan-feedback uploads with upsert
-- and HAS a select policy; binder-art has no select policy and uploads with upsert OFF. The
-- policy set has to match the upload mode. avatars carries the same owner-select for the same
-- family of reason (it lists the folder to prune old files).
--
-- WHAT THIS DOES NOT WIDEN. The bucket is already PUBLIC: anyone holding a URL can fetch the
-- object, and that is how both apps display these images. This policy governs only the API
-- (listing, existence checks), and only for the owner's own folder, so the reachable surface is
-- unchanged. It is not what keeps other people out of your scans; the unguessable uuid filename
-- and the owner-only portfolio_entries row that holds it are.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'Scan image owners can read their own folder') then
    create policy "Scan image owners can read their own folder"
      on storage.objects for select to authenticated
      using (bucket_id = 'scan-images' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
