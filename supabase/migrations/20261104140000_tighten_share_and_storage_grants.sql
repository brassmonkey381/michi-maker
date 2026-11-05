-- Tighten who may CALL the 2026-11-04 functions (20261104120000, 20261104130000).
--
-- Those migrations said `revoke all ... from public` and granted `authenticated`, which reads as
-- "signed-in only". It is not: this project's default privileges grant EXECUTE on every new
-- function to `anon` and `authenticated` by name, and a revoke from PUBLIC does not touch a grant
-- made to a role by name. A stranger could reach create_collection_share (its body refused them)
-- and scan_image_bytes_for, which answered any account's stored picture bytes to anyone. Found by
-- calling them with the publishable key on 2026-11-04.
--
-- After this: shared_collection is the only one a stranger may call. The share and usage functions
-- the app calls stay for `authenticated`. The internal helpers are for definers only.

revoke execute on function public.create_collection_share(text)   from anon;
revoke execute on function public.revoke_collection_share(text)   from anon;
revoke execute on function public.my_collection_share(text)       from anon;
revoke execute on function public.my_scan_image_usage()           from anon;

revoke execute on function public.scan_image_bytes_for(uuid)      from anon, authenticated;
revoke execute on function public.tcgscan_card_total_cap(uuid)    from anon;
revoke execute on function public.tcgscan_scan_image_mb_cap(uuid) from anon;
