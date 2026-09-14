-- A page, and a pocket, can dress their own cards and art.
--
-- The binder sets a sleeve colour and an art backing for everything (binders.page_style). These
-- columns let one page, or one pocket, say otherwise, and the app resolves pocket -> page ->
-- binder, taking the first that is set. Null everywhere is the binder's own choice, which is every
-- row that exists today, so nothing is backfilled.
--
-- #rrggbb strings, like binder_pages.background_color. Not validated here: the client normalises
-- on the way in and ignores anything that is not a colour, exactly as it does for page_style.

alter table public.binder_pages
  add column if not exists sleeve text,
  add column if not exists art_backing text;

alter table public.binder_slots
  add column if not exists sleeve text,
  add column if not exists art_backing text;

comment on column public.binder_pages.sleeve is 'This page''s sleeve colour for its card pockets, #rrggbb. Null = the binder''s.';
comment on column public.binder_pages.art_backing is 'This page''s backing behind its art pieces, #rrggbb. Null = the binder''s.';
comment on column public.binder_slots.sleeve is 'This pocket''s sleeve colour, #rrggbb. Null = the page''s, then the binder''s.';
comment on column public.binder_slots.art_backing is 'This pocket''s art backing, #rrggbb. Null = the page''s, then the binder''s.';

-- No RLS changes: a column inherits the table's policies.
