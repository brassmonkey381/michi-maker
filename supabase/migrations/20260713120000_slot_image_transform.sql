-- Artwork slots: rotation / mirror transform for the Slice Studio.
-- A slice is (image_url, image_crop, image_transform) — the source image is never re-encoded,
-- so the transform must persist alongside the crop window.
-- Shape: { "rot": 0 | 90 | 180 | 270, "flipH"?: boolean, "flipV"?: boolean }
alter table public.binder_slots
  add column if not exists image_transform jsonb;

comment on column public.binder_slots.image_transform is
  'Rotation/mirror applied to image_url before image_crop: {rot: 0|90|180|270, flipH?, flipV?}. Null = as-is.';
