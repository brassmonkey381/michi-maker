-- scan_path may now be filled in LATE, once (tcgscan-app lib/scan-hold, 2026-09-25).
--
-- Until now scan_path was only a birth field (20260828120000_scan_images.sql). A guest's, or an
-- unanswered account's, card crops now wait on the device; when the account says yes to Save my
-- scans the app uploads them and writes scan_path onto entries that already exist. Whole-row sync
-- would let a device still holding the pointer-less copy push scan_path = null over it. This
-- trigger keeps the stored path when an update brings null.
--
-- WHY IT ALSO MOVES updated_at. The client merge treats rows with equal updated_at as equal, so a
-- device that pushed null and got the path back at the SAME stamp would keep its null forever and
-- push it again on its next edit. One millisecond past the PUSHED stamp makes that device see the
-- server row as newer and install it.
--
-- It rejects nothing, so 20260828120000's rule (one rejected row poisons the whole push batch)
-- still holds; that file's "no trigger" note is superseded by this one. michi-maker never sends
-- scan_path, so its updates pass through untouched.
--
-- CONSEQUENCE: a push can no longer clear scan_path. Clearing one (a future "delete my uploaded
-- scans") must go through a security-definer RPC that first runs
--   perform set_config('tcgscan.allow_scan_path_clear', 'on', true);

create or replace function public.portfolio_entries_keep_scan_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scan_path is null
     and old.scan_path is not null
     and coalesce(current_setting('tcgscan.allow_scan_path_clear', true), '') <> 'on' then
    new.scan_path := old.scan_path;
    new.updated_at := coalesce(new.updated_at, old.updated_at, now()) + interval '1 millisecond';
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_entries_keep_scan_path on public.portfolio_entries;
create trigger portfolio_entries_keep_scan_path
  before update on public.portfolio_entries
  for each row execute function public.portfolio_entries_keep_scan_path();

comment on column public.portfolio_entries.scan_path is
  'Bucket-relative path ({uid}/{uuid}.jpg) of this lot''s best cropped scan in the scan-images '
  'bucket. Written at entry creation, or once later when the account says yes to Save my scans '
  '(only after the object exists). portfolio_entries_keep_scan_path stops a push nulling it. '
  'Null = no scan (manual, CSV, declined).';
