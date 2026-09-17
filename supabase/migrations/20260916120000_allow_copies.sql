-- Let other people duplicate this binder.
--
-- Until now only the bundled examples could be duplicated: a member's public binder opened in
-- the public viewer, which is view only. The owner may now flip this on (Share sheet), and a
-- signed-in visitor gets a Duplicate button that copies the binder into their own account, under
-- a fresh name, with the owner's custom art stamped as borrowed (origin 'copied', credited, not
-- re-shareable as theirs), exactly as a copy of an example is. Off by default: nobody's binder
-- becomes copyable by this migration.
--
-- The reshare ledger (binder_reshares) records source -> copy as it does for examples.

alter table public.binders
  add column if not exists allow_copies boolean not null default false;

comment on column public.binders.allow_copies is
  'The owner lets other people duplicate this binder into their own account. Only meaningful while is_public.';

-- No RLS changes: a column inherits the table''s policies. Reading it needs the binder to be
-- readable, which for another person means public; writing it needs ownership.
