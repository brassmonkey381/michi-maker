-- tcgscan-michi-maker — binder reshare provenance ledger
--
-- Records every DUPLICATE of a binder (own binders, bundled examples, and any future cross-user
-- copy) so a binder's reshare history can always be traced. One row per copy:
--   • binder_id         — the COPY (FK → binders, cascade on delete)
--   • source_binder_id  — what it was copied FROM. TEXT, not a uuid FK: bundled example ids
--                         ('ex-…') aren't uuids, and a source binder may later be deleted; we want
--                         the lineage to survive that. Walk this back up to reconstruct the chain.
--   • source_title      — the source's title at copy time (denormalized for display without a join)
--   • source_is_example — whether the source was a bundled example
--   • copied_by         — who made the copy (default auth.uid())
--
-- Pairs with the client-side rule (src/data/artAttributionCheck.ts markCopiedArtBorrowed): copied
-- custom art is stamped private on duplicate, so a copy can't be reshared with art the new owner
-- didn't create. This table is the durable audit trail of who copied what from whom.
--
-- RLS conventions match the init migration: RLS on; writes `to authenticated` with an ownership
-- predicate. SELECT is owner-only for now (the copier can see their own lineage); server/service
-- role can query the full ledger. A public provenance-display policy can be added later.

create table if not exists public.binder_reshares (
  id uuid primary key default gen_random_uuid(),
  binder_id uuid not null references public.binders (id) on delete cascade,
  source_binder_id text,
  source_title text,
  source_is_example boolean not null default false,
  copied_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists binder_reshares_binder_id_idx on public.binder_reshares (binder_id);
create index if not exists binder_reshares_source_idx on public.binder_reshares (source_binder_id);
create index if not exists binder_reshares_copied_by_idx on public.binder_reshares (copied_by);

alter table public.binder_reshares enable row level security;

-- Insert: only for your own copy (the copy binder must belong to you), attributed to you.
drop policy if exists "Users record their own reshares" on public.binder_reshares;
create policy "Users record their own reshares"
  on public.binder_reshares for insert to authenticated
  with check (
    copied_by = auth.uid()
    and exists (
      select 1 from public.binders b
      where b.id = binder_reshares.binder_id and b.owner_id = auth.uid()
    )
  );

-- Select: the copier can read their own lineage. (Widen later if provenance is shown to viewers.)
drop policy if exists "Users read their own reshares" on public.binder_reshares;
create policy "Users read their own reshares"
  on public.binder_reshares for select to authenticated
  using (copied_by = auth.uid());
