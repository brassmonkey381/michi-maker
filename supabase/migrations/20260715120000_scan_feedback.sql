-- ML scan feedback (written by tcgscan-app). When the recognizer is wrong/unsure, the user
-- picks the TRUE card; we capture the crop, the full frame, the model's top-K, and that
-- confirmed id — the highest-value training signal for the recognizer. Read cross-project by
-- tcgscan-data-science via the service role (which bypasses RLS). This is user-generated data,
-- so it lives in the app project (piikwvntldytjejxmcla), not the pure-catalog tcgscan-data one.

create table public.scan_feedback (
  id             uuid primary key default gen_random_uuid(),
  -- Contributor. RETAINED for training if the account is later deleted (id -> null),
  -- so this is nullable with ON DELETE SET NULL (not the usual cascade).
  owner_id       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  crop_path      text,               -- scan-feedback bucket key for the cropped card
  full_path      text,               -- ...and for the full uncropped frame
  picked_card_id text not null,      -- user-confirmed TCGPlayer productId (the label)
  model_set      text,               -- classifier set in use (e.g. v3-e95)
  od_set         text,               -- detector in use (e.g. od-v2)
  candidates     jsonb,              -- the model's top-K: [{cardId, similarity, index}]
  detection      jsonb               -- {box:{ymin,xmin,ymax,xmax}, score}
);

create index scan_feedback_owner_idx on public.scan_feedback (owner_id);
create index scan_feedback_card_idx on public.scan_feedback (picked_card_id);

alter table public.scan_feedback enable row level security;

-- Contributors insert + read their OWN rows; training reads use the service role (bypasses RLS).
create policy "own scan_feedback insert" on public.scan_feedback for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "own scan_feedback select" on public.scan_feedback for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert on public.scan_feedback to authenticated;

-- Private image bucket. Users upload/read only under their own uid/ prefix; no public read.
insert into storage.buckets (id, name, public)
  values ('scan-feedback', 'scan-feedback', false)
  on conflict (id) do nothing;

create policy "scan-feedback insert own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'scan-feedback' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "scan-feedback select own" on storage.objects for select to authenticated
  using (
    bucket_id = 'scan-feedback' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
