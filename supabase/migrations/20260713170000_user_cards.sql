-- The collector's card inventory ("portfolio") — the pipe from tcgscan-app into michi-maker.
-- tcgscan-app (scanner) WRITES rows here as cards are scanned; michi-maker READS them for
-- "My collection" / build-from-my-collection features (UI intentionally not shipped yet).
-- See docs/TCGSCAN-PORTFOLIO.md for the full handoff contract.
--
-- card_id is a tcgscan-data catalog id (TCGPlayer product id, e.g. '704871') — the shared id
-- space both apps already render from. condition '' = unspecified (a future NM/LP/… enum can
-- backfill); one row per (owner, card, condition) with a quantity.

create table public.user_cards (
  owner_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null,
  condition text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  source text not null default 'manual' check (source in ('scan', 'import', 'manual')),
  acquired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, card_id, condition)
);

comment on table public.user_cards is
  'Card inventory (portfolio): written by tcgscan-app scans / michi imports, read by michi-maker. card_id = tcgscan-data catalog id.';

alter table public.user_cards enable row level security;

-- Owner-only in every direction: a portfolio is private (a public "show off my collection"
-- flag can come later — do NOT loosen these instead).
create policy "user_cards_select_own" on public.user_cards
  for select to authenticated using (owner_id = auth.uid());
create policy "user_cards_insert_own" on public.user_cards
  for insert to authenticated with check (owner_id = auth.uid());
create policy "user_cards_update_own" on public.user_cards
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "user_cards_delete_own" on public.user_cards
  for delete to authenticated using (owner_id = auth.uid());

create trigger user_cards_set_updated_at
  before update on public.user_cards
  for each row execute function public.set_updated_at();

create index user_cards_owner_idx on public.user_cards (owner_id);
