-- A picture behind the share image.
--
-- The share image (api/og-image-binder.js) sits the page on a blurred enlargement of its own art.
-- The owner may put a picture of their choosing there instead: a hotlinked image address, drawn
-- edge to edge under the page. It is a SHARE setting, not a page setting (owner, 2026-09-15): the
-- editor's pages keep colours only, and this lives in the Share sheet beside the featured pages.
--
-- Nothing is fetched or checked here; the renderer shows what loads and the blur otherwise. The
-- share_version trigger already bumps on updated_at, so changing this changes the shared link.

alter table public.binders
  add column if not exists share_backdrop text;

comment on column public.binders.share_backdrop is
  'Hotlinked image address drawn behind the share image instead of the blurred page art. Null = the blur.';

-- No RLS changes: a column inherits the table's policies.
