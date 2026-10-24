-- A page can show its cards as their artwork.
--
-- Every card on a page is a different frame design: a 2003 promo, a HeartGold border, a Mega
-- Evolution border, side by side. The art view puts the ART first: 'window' crops each card to
-- its illustration window and sets it on a plain black stock card with the card's name, set and
-- number; 'connected' lays the bare windows edge to edge with no pockets, for pages whose cards
-- share one continuing illustration. Null is the plain page every binder has today, so nothing
-- is backfilled. See src/data/artView.ts for what each value draws.
--
-- A column on the page, not on the binder: this is a composition choice per page, like its sleeve,
-- and the same binder can hold a connected-art page beside a plain one.

alter table public.binder_pages
  add column if not exists art_view text;

alter table public.binder_pages
  drop constraint if exists binder_pages_art_view_known;
alter table public.binder_pages
  add constraint binder_pages_art_view_known
  check (art_view is null or art_view in ('window', 'connected'));

comment on column public.binder_pages.art_view is
  'How this page shows its cards: null = the full card, window = the art window on a stock card, '
  'connected = bare art windows edge to edge. See src/data/artView.ts.';

-- No RLS changes: a column inherits the table's policies.
