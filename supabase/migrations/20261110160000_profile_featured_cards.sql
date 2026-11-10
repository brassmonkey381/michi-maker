-- MIC-017 piece 11: a maker's three featured cards on their collector card.
-- ADDITIVE and nullable: no backfill, no policy change (the owner already updates their own profile
-- row under the existing policy, and public profiles are already readable). Until this runs the
-- app shows the first cards of the maker's most-liked binder instead.
alter table public.profiles add column if not exists featured_card_ids text[];
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_featured_card_ids_max3') then
    alter table public.profiles
      add constraint profiles_featured_card_ids_max3
      check (featured_card_ids is null or cardinality(featured_card_ids) <= 3);
  end if;
end $$;
