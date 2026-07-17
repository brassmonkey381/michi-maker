-- Carry artwork provenance on saved slices so it survives Slice Studio → tray → placement.
-- Same shape as binder_slots.image_attribution: {artist?, sourceName, sourceUrl?}. The tray also
-- re-imports art from binder slots, so both sides now round-trip the credit a public binder needs.
alter table public.saved_slices
  add column if not exists attribution jsonb;

comment on column public.saved_slices.attribution is
  'Artwork provenance {artist?, sourceName, sourceUrl?} captured in Slice Studio; copied onto the slot when placed.';
