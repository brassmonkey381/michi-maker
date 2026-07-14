-- Fix: guest→sign-in sync 403s (tcgscan-app).
--
-- tcgscan-app mints collection/entry ids client-side ("col-…"/"lot-…"). With guest mode, the
-- SAME device data legitimately syncs under TWO uids in sequence: first the anonymous guest's,
-- then the real account's after sign-in (local data is the migration source). A GLOBAL pk on
-- `id` makes the second push collide with the anon-owned row → RLS blocks the cross-owner
-- upsert → 403 → the app's "Sync error — tap to retry" loop.
--
-- Composite PKs give each owner their own id namespace: (user_id, id). saved_cards already
-- has (user_id, card_id). RLS policies are unchanged; supabase-js upserts resolve on the PK,
-- so the app needs no code change.

alter table public.portfolio_entries
  drop constraint portfolio_entries_collection_id_fkey;

alter table public.collections
  drop constraint collections_pkey,
  add primary key (user_id, id);

alter table public.portfolio_entries
  drop constraint portfolio_entries_pkey,
  add primary key (user_id, id);

-- Entries follow their owner's collection (composite FK matches the new PK shape).
alter table public.portfolio_entries
  add constraint portfolio_entries_collection_fkey
  foreign key (user_id, collection_id)
  references public.collections (user_id, id)
  on delete cascade;

create index portfolio_entries_collection_idx
  on public.portfolio_entries (user_id, collection_id);
