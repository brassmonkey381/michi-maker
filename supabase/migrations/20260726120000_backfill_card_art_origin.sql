-- Backfill: art cropped from OUR OWN card catalog was stamped origin 'external' (or left with no
-- attribution at all) by the generic URL-import path, which made any binder using it unshareable.
-- It was never third-party art we can't vouch for — it is the same image the app already renders
-- publicly in every binder and in Browse, so a crop of one is no different in kind from the whole
-- card. Restamp it with the new public-eligible provenance class, 'card'.
--
-- Deliberately NOT 'upload': that would assert the user supplied the file from their device, which
-- is false. The sharing gate's audit trail is only worth having if it records what actually
-- happened. See src/data/artAttributionCheck.ts (isCardCatalogArt / isPrivateArt) — the client
-- already treats these URLs as public-eligible regardless of the flag, so this migration is about
-- making the STORED provenance tell the truth.
--
-- Matching is on the catalog storage layout, so only genuine card images are touched: the user's
-- own /binder-art/ uploads and outside hotlinks are left exactly as they are (verified after
-- running: 70 external and 139 upload slots untouched).

-- jsonb_build_object rather than jsonb_set, because some rows have image_attribution SQL NULL and
-- a set-on-null leaves nothing behind.
update public.binder_slots s
   set image_attribution =
         coalesce(s.image_attribution, jsonb_build_object('sourceName', 'official card art'))
         || jsonb_build_object('origin', 'card')
 where s.slot_type = 'artwork'
   and s.image_url ~ '(/object/public/cards?/)|(/card-imgs/)'
   and s.image_attribution->>'origin' is distinct from 'card';

update public.saved_slices sl
   set attribution =
         coalesce(sl.attribution, jsonb_build_object('sourceName', 'official card art'))
         || jsonb_build_object('origin', 'card')
 where sl.image_url ~ '(/object/public/cards?/)|(/card-imgs/)'
   and sl.attribution->>'origin' is distinct from 'card';
