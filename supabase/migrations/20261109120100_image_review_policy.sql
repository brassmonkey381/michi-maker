-- MIC-029, PART 2 OF 2: visitors see a custom image only once the safety check approved it, and a
-- page held by moderation (a flagged picture on it) is not shown to visitors at all.
-- APPLY ONLY AFTER the backfill (part 1's queue) has finished, or existing public images blank
-- until they are checked. The owner's own policy ("Slots of owned binders are viewable") is
-- untouched: owners always see their own images, flagged or not. Anything reading as a visitor
-- (the share image API, the page renderer, Discover) inherits this.
drop policy if exists "Pages of public binders are viewable" on public.binder_pages;
create policy "Pages of public binders are viewable"
  on public.binder_pages for select to anon, authenticated
  using (
    binder_pages.is_public
    and not binder_pages.moderation_hold
    and exists (
      select 1 from public.binders b
      join public.profiles p on p.id = b.owner_id
      where b.id = binder_pages.binder_id
        and b.is_public and b.removed_at is null and coalesce(p.is_public, true)
    )
  );

drop policy if exists "Slots of public binders are viewable" on public.binder_slots;
create policy "Slots of public binders are viewable"
  on public.binder_slots for select to anon, authenticated
  using (
    exists (
      select 1 from public.binder_pages pg
      join public.binders b on b.id = pg.binder_id
      join public.profiles p on p.id = b.owner_id
      where pg.id = binder_slots.page_id
        and pg.is_public and not pg.moderation_hold and b.is_public and b.removed_at is null
        and coalesce(p.is_public, true)
    )
    -- MIC-029: a card slot, or an image the check approved. Pending, flagged and unchecked images
    -- read as an empty pocket.
    and (binder_slots.image_url is null or binder_slots.image_review = 'approved')
  );
