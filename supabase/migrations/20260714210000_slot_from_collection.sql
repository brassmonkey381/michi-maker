-- Provenance for placed cards: TRUE when the pocket was filled FROM the user's collection
-- ("My collection" adds / fill-from-my-collection), so a copy of an owned card counts against
-- the (free/owned) inventory and can be reclaimed. Cards placed through general browsing stay
-- null/false — aspirational pockets that don't consume owned copies.
alter table public.binder_slots
  add column if not exists from_collection boolean;

comment on column public.binder_slots.from_collection is
  'True = this pocket consumed a copy from the owner''s user_cards inventory (reclaimable). Null/false = placed from general browsing.';
