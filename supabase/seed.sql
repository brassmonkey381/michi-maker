-- poke-michi — local seed data
--
-- Run automatically by `supabase db reset`. This is a tiny hand-picked sample so the app
-- has something to render before the real catalogue is ingested from artofpkm.com
-- (see docs/DATA-MODEL.md). Only reference data is seeded — user data (binders) is created
-- through the app so that auth.uid() / RLS apply.

insert into public.pokemon (id, dex_number, name_en, name_ja) values
  ('bulbasaur', 1, 'Bulbasaur', 'フシギダネ'),
  ('charmander', 4, 'Charmander', 'ヒトカゲ'),
  ('squirtle', 7, 'Squirtle', 'ゼニガメ'),
  ('pikachu', 25, 'Pikachu', 'ピカチュウ'),
  ('eevee', 133, 'Eevee', 'イーブイ')
on conflict (id) do nothing;

insert into public.illustrators (id, name) values
  ('mitsuhiro-arita', 'Mitsuhiro Arita'),
  ('atsuko-nishida', 'Atsuko Nishida'),
  ('ken-sugimori', 'Ken Sugimori')
on conflict (id) do nothing;

insert into public.card_sets (id, name, series) values
  ('base', 'Base Set', 'Original'),
  ('sv1', 'Scarlet & Violet', 'Scarlet & Violet')
on conflict (id) do nothing;

insert into public.cards
  (id, name, set_id, illustrator_id, pokemon_id, number, rarity, orientation, dominant_color) values
  ('base-58', 'Pikachu', 'base', 'mitsuhiro-arita', 'pikachu', '58', 'Common', 'portrait', '#F4D03F'),
  ('base-25', 'Charmander', 'base', 'mitsuhiro-arita', 'charmander', '46', 'Common', 'portrait', '#E67E22'),
  ('sv1-001', 'Eevee', 'sv1', 'atsuko-nishida', 'eevee', '001', 'Common', 'portrait', '#C8A165')
on conflict (id) do nothing;
