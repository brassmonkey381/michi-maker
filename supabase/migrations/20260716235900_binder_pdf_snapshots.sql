-- Per-binder PDF purchases are SNAPSHOT licenses: buying `pdf_binder:<id>` entitles you to the
-- binder's fill-sheet PDF AS IT IS AT PURCHASE TIME, forever — not to future edits (edit → print
-- would make the $3.99 unlock an all-you-can-print pass). This records the spend:
--
--   binder_pdf_snapshots  one row per (user, binder): the content fingerprint the purchase was
--                         spent on + when. The client compares the binder's current fingerprint
--                         against this to decide "still the purchased version" vs "edited".
--   binder-pdfs bucket    the purchased PDF's bytes (`<uid>/<binderId>.pdf`), archived at spend
--                         time so the bought version stays downloadable forever even after edits.
--
-- Client-written (owner RLS): the PDF is generated client-side, so the client is necessarily
-- trusted to report the spend — this is honest-UI gating, not cryptographic enforcement. A
-- re-purchase re-arms via entitlements.granted_at (bumped by the payments-webhook upsert).

create table public.binder_pdf_snapshots (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  binder_id   text not null,
  -- SHA-256 of the binder's printable content ({layoutStyle, pages}, stable key order).
  fingerprint text not null,
  sheets      int,
  updated_at  timestamptz not null default now(),
  primary key (user_id, binder_id)
);

comment on table public.binder_pdf_snapshots is
  'Spent per-binder PDF purchases: the content fingerprint each pdf_binder:<id> unlock was used on. Purchased PDF bytes live in the binder-pdfs bucket.';

alter table public.binder_pdf_snapshots enable row level security;

create policy "own snapshots select" on public.binder_pdf_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own snapshots insert" on public.binder_pdf_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own snapshots update" on public.binder_pdf_snapshots for update to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update on public.binder_pdf_snapshots to authenticated;

-- Private archive bucket; users touch only their own uid/ prefix.
insert into storage.buckets (id, name, public)
  values ('binder-pdfs', 'binder-pdfs', false)
  on conflict (id) do nothing;

create policy "binder-pdfs insert own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'binder-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "binder-pdfs update own" on storage.objects for update to authenticated
  using (
    bucket_id = 'binder-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "binder-pdfs select own" on storage.objects for select to authenticated
  using (
    bucket_id = 'binder-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
