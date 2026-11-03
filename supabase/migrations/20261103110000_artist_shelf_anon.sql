-- The artists shelf for guests (2026-11-03, found by scripts/lab/artists-run.mjs): the view was
-- security_invoker, and the anon role has no SELECT on public.profiles (20260826130000), so a
-- guest's shelf answered "permission denied" and showed nothing. The view now runs as its owner.
-- That is safe because the view itself does the filtering the policies would: approved pieces of
-- flagged artists only, and from profiles only the three columns every public profile page shows.
create or replace view public.artist_shelf
with (security_invoker = false) as
  select pc.id, pc.title, pc.url, pc.width, pc.height, pc.surfaces, pc.created_at,
         pc.artist_id, p.username as artist_username, p.display_name as artist_name, p.artist_link
    from public.artist_pieces pc
    join public.profiles p on p.id = pc.artist_id
   where pc.status = 'approved' and p.is_artist;

grant select on public.artist_shelf to anon, authenticated;
