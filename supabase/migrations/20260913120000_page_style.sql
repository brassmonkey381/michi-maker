-- A binder's pages can be made of something.
--
-- The material of the page (a stitched fabric edge, a zip-around), a sleeve colour for every card
-- pocket, and a backing colour behind every art piece: {material, sleeve, artBacking}. One jsonb
-- column rather than three, for the same reason `cover` and `track` are one: it is read whole with
-- the binder and written whole by the look settings, and none of it is ever queried across binders.
--
-- Null means the plain page, which is every binder that exists today, so nothing is backfilled.
-- The client normalises whatever is here on the way in (src/data/pageStyle.ts), so an unknown
-- material or a bad colour reads as the plain page rather than failing in a renderer.

alter table public.binders
  add column if not exists page_style jsonb;

alter table public.binders
  drop constraint if exists binders_page_style_is_object;
alter table public.binders
  add constraint binders_page_style_is_object
  check (page_style is null or jsonb_typeof(page_style) = 'object');

comment on column public.binders.page_style is
  'How the pages are made: {material: classic|stitched|zip, sleeve: #rrggbb, artBacking: #rrggbb}. '
  'Null = the plain page. See src/data/pageStyle.ts.';

-- No RLS changes: a column inherits the table's policies.
