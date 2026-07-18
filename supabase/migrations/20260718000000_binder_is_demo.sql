-- Demo binders: the read-only "Try it out!" showcase binder built from the example collection.
-- A demo binder is a real, persisted, owner-scoped binder (so it survives reload and can be
-- deleted), but the app treats it specially: it does NOT count toward the free-tier binder cap,
-- it is read-only and cannot be shared, and there is at most one per account (the client clears
-- any prior demo binder before building a new one). Existing binders default to false.
alter table public.binders
  add column if not exists is_demo boolean not null default false;

comment on column public.binders.is_demo is
  'Read-only example/showcase binder (the "Try it out!" build). Excluded from the binder cap; not editable or shareable; at most one per owner (enforced client-side).';
