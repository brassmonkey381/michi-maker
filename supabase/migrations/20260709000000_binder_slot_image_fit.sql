-- ---------------------------------------------------------------------------
-- Persist how a custom-artwork slot fills its pocket
-- ---------------------------------------------------------------------------
-- 'cover' (default) fills the pocket edge-to-edge, cropping overflow to the image_crop window;
-- 'contain' shows the whole image at its original aspect (letterboxed, nothing cropped). Absent
-- ⇒ 'cover', so existing artwork slots keep their current appearance.
alter table public.binder_slots add column if not exists image_fit text;
