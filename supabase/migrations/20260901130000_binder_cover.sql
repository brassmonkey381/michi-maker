-- A binder can be dressed as a real one.
--
-- Which model it is (a Vault X 12-pocket XL, say), which colourway, and whatever the owner has
-- stuck to its four surfaces: front, inside front, inside back, back. One jsonb column rather than
-- a table, because none of it is ever queried across binders: it is read whole with the binder and
-- written whole by the cover editor, exactly like share_page_ids. When something here needs an
-- index, that is the signal it has outgrown a column.
--
-- Null means undressed, which is every binder that existed before this migration. The client falls
-- back to the plain page view for those, so nothing needs backfilling.

alter table public.binders
  add column if not exists cover jsonb;

-- An object or nothing. Cheap insurance against a client sending an array or a bare string, which
-- would then fail much further away, in a renderer.
alter table public.binders
  drop constraint if exists binders_cover_is_object;
alter table public.binders
  add constraint binders_cover_is_object
  check (cover is null or jsonb_typeof(cover) = 'object');

comment on column public.binders.cover is
  'How this binder is dressed: {modelId, colourway, surfaces:{front|frontInside|backInside|back: [sticker]}}. '
  'Model and colourway ids come from src/data/binderModels.ts; an unknown id falls back there rather '
  'than failing, so removing a model never bricks a saved binder. Null = undressed.';

-- No RLS changes: a column inherits the table's policies, and binders already restricts select to
-- the owner or a public binder, and every write to the owner.
