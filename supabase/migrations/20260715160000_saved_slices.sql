-- Saved art "slices": pieces cut in the Slice Studio and saved to a per-account tray, later
-- dragged (web/desktop) or tapped (touch) into binder pockets where they legally fit under
-- side-load physics. One row per insertable piece — a 1x1 pocket, or a folded 1x2 pair.
--
-- A slice is just an (image_url, crop, transform) triple plus its footprint (rs x cs): the
-- source image is never re-encoded. group_id ties the pieces cut from one artwork together so
-- the tray can group them; label is a human hint (e.g. the source domain).

create table public.saved_slices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  image_url text not null,
  crop jsonb,
  fit text not null default 'cover',
  transform jsonb,
  rs integer not null default 1 check (rs >= 1),
  cs integer not null default 1 check (cs >= 1),
  group_id text,
  label text,
  created_at timestamptz not null default now()
);

comment on table public.saved_slices is
  'Slice Studio output: per-user tray of insertable art pieces (image_url+crop+transform, 1x1 or folded 1x2), dragged into binder pockets.';

alter table public.saved_slices enable row level security;

-- Owner-only in every direction (mirrors user_cards). owner_id defaults to auth.uid() so inserts
-- can omit it; the with-check keeps a client from writing rows for anyone else.
create policy "saved_slices_select_own" on public.saved_slices
  for select to authenticated using (owner_id = auth.uid());
create policy "saved_slices_insert_own" on public.saved_slices
  for insert to authenticated with check (owner_id = auth.uid());
create policy "saved_slices_update_own" on public.saved_slices
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "saved_slices_delete_own" on public.saved_slices
  for delete to authenticated using (owner_id = auth.uid());

create index saved_slices_owner_idx on public.saved_slices (owner_id, created_at desc);
