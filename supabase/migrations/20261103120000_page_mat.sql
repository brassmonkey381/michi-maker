-- A page can style its art window mats on its own (owner, 2026-11-03).
--
-- The art view's stock card is the MAT: the plain card the art window sits on, with the card's
-- name and references under it. The binder styles every mat at once (binders.page_style ->> mat,
-- jsonb, no column needed); this column lets one page say otherwise, as a whole. The shape is
-- src/data/matStyle.ts: { paper, picture, ink, font, fields }. Null is the binder's mat.

alter table public.binder_pages
  add column if not exists mat jsonb;

comment on column public.binder_pages.mat is
  'This page''s own art window mat style, replacing the binder''s whole: { paper, picture, ink, font, fields }. '
  'Null = the binder''s mat (binders.page_style.mat), else the stock card. See src/data/matStyle.ts.';

-- No RLS changes: a column inherits the table's policies.
