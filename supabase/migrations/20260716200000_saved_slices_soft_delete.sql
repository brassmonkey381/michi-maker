-- Soft-delete for saved slices. The tray now shows every art slice that exists anywhere in the
-- owner's account: on sync the app imports binder artwork slots it has never seen into
-- saved_slices. A hard DELETE would make a manually-removed slice resurrect on the next sync
-- (its art still sits in a binder slot), so tray removals set deleted_at instead and the
-- import skips any signature it has ever seen, deleted or not.

alter table public.saved_slices
  add column deleted_at timestamptz;

comment on column public.saved_slices.deleted_at is
  'Set when the owner removes the slice from the tray. Kept as a tombstone so the binder-art import does not resurrect it.';
