-- Structured provenance for a custom artwork slot: the illustrator + specific source page that
-- a bare image URL can't reveal. Captured at IMPORT (Slice Studio / art search), so a binder can
-- credit "suyari · The Art of Pokémon" or "Extra Vision · Pinterest" with a real link, not just
-- the host domain. Shape: {artist?, sourceName, sourceUrl?} (see src/data/artworkLibrary.ts).
-- NULL for slots placed before this existed — rendering falls back to deriveAttribution(imageUrl).
alter table public.binder_slots
  add column if not exists image_attribution jsonb;

comment on column public.binder_slots.image_attribution is
  'Artwork provenance {artist?, sourceName, sourceUrl?} captured at import. NULL = derive from image_url.';
