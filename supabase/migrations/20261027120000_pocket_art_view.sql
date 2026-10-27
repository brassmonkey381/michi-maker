-- The art view at three levels (owner, 2026-10-27): the binder, then a page, then a pocket.
--
-- "Binders need a binder wide setting for art view / mats. It's annoying to alter at each
-- individual page level. Might as well make it editable at the pocket level and multi-select
-- pocket level as well, like sleeves." The binder-wide choice lives in binders.page_style
-- (jsonb, key artView) beside the sleeve, so it needs no column. A page keeps its art_view, and
-- gains 'card': the full card said out loud, so a page can be plain inside a windowed binder.
-- A pocket gets the same column with 'card' or 'window' only: connected art is a page's shape.
-- Null everywhere still means "whatever the layer above says", which for every existing row is
-- exactly what it showed before. See src/data/artView.ts resolveArtView.

alter table public.binder_pages
  drop constraint if exists binder_pages_art_view_known;
alter table public.binder_pages
  add constraint binder_pages_art_view_known
  check (art_view is null or art_view in ('card', 'window', 'connected'));

comment on column public.binder_pages.art_view is
  'How this page shows its cards: null = the binder''s choice (page_style.artView, else the full '
  'card), card = the full card, window = the art window on a stock card, connected = bare art '
  'windows edge to edge. See src/data/artView.ts.';

alter table public.binder_slots
  add column if not exists art_view text;

alter table public.binder_slots
  drop constraint if exists binder_slots_art_view_known;
alter table public.binder_slots
  add constraint binder_slots_art_view_known
  check (art_view is null or art_view in ('card', 'window'));

comment on column public.binder_slots.art_view is
  'This pocket''s own art view: null = the page''s, card = the whole card, window = the art '
  'window on a stock card. A connected page overrides it. See src/data/artView.ts.';

-- No RLS changes: a column inherits the table's policies.
