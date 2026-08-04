-- Let a binder owner choose which page(s) show in the shared-link OG preview.
--
-- `share_page_ids` is up to 2 binder_pages.id to feature. NULL (the default) keeps today's
-- automatic behaviour: the two fullest pages, as an open spread. The OG image endpoint
-- (api/og-image-binder.js) reads this and renders the chosen pages when set. A hidden page can't be
-- featured — the endpoint fetches with the anon key, so RLS only ever returns PUBLIC pages, and a
-- stale/hidden id simply falls back to auto.

alter table public.binders
  add column if not exists share_page_ids uuid[];

alter table public.binders
  drop constraint if exists binders_share_page_ids_max_two;
alter table public.binders
  add constraint binders_share_page_ids_max_two
  check (share_page_ids is null or array_length(share_page_ids, 1) <= 2);

comment on column public.binders.share_page_ids is
  'Up to 2 binder_pages.id to feature in the shared-link OG preview. NULL = auto (two fullest pages).';
