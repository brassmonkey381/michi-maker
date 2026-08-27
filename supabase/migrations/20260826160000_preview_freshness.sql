-- tcgscan-michi-maker: a binder's preview goes stale when its CARDS change, not just its title.
--
-- TWO THINGS FOUND BY THE share_version APPLIER, one of them older than that work.
--
-- 1. THE CORRECTION. 20260826150000 says share_version bumps on the preview's inputs and "not on
--    any update, which would churn every link on a takedown or a privacy flip". That is wrong, and
--    its own step 6 caught it: public.set_updated_at sets new.updated_at = now() UNCONDITIONALLY
--    on every update of a binders row, so there is no such thing as an update that leaves
--    updated_at alone. Any write to the row bumps the version.
--
--    That turns out to be the right behaviour rather than a bug to undo, because updated_at is
--    also the cache key in ogImageUrl: any write to the row already changes the image URL and
--    abandons the cached render. The version tracking it is exactly consistent. A privacy flip or
--    a takedown moving the version costs nothing, since old links keep resolving and the binder in
--    question is either newly shared or newly hidden.
--
-- 2. THE ACTUAL BUG. Editing the CARDS in a binder writes to binder_pages and binder_slots and
--    never touches the binders row, so updated_at did not move, so the preview image URL did not
--    change, so the CDN kept serving the OLD picture (s-maxage 300, stale-while-revalidate 86400)
--    and warming re-fetched that same stale entry while reporting success. Rearranging a page is
--    the most common meaningful edit there is, and it was the one edit the preview never noticed.
--    ogImageUrl's own comment assumes "editing a binder bumps updated_at"; for cards it did not.
--
--    So: page and slot writes now touch their parent binder. That fixes the stale preview, and
--    share_version inherits the fix for free.
--
-- COST. A slot write becomes a slot write plus a one-integer parent update. A twelve-pocket
-- auto-fill is twelve parent touches, which is cheap and, more to the point, is what makes the
-- twelve-pocket auto-fill show up in the preview at all. share_version climbs faster as a result;
-- it is a cache buster, not a version number anyone reads.
--
-- SECURITY INVOKER, like set_updated_at: the caller is already the binder's owner (that is what
-- the slot policies check), so the parent update is theirs to make. It sets only updated_at, so
-- binders_guard_removed_at (20260826120000) sees removed_at unchanged and stays quiet.

create or replace function public.touch_binder_from_page()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.binders
     set updated_at = now()
   where id = coalesce(new.binder_id, old.binder_id);
  return coalesce(new, old);
end;
$$;

create or replace function public.touch_binder_from_slot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.binders b
     set updated_at = now()
    from public.binder_pages p
   where p.id = coalesce(new.page_id, old.page_id)
     and b.id = p.binder_id;
  return coalesce(new, old);
end;
$$;

-- AFTER, not BEFORE: the child write should decide whether it succeeds on its own merits, and a
-- parent touch is a consequence of it, not a precondition.
drop trigger if exists binder_pages_touch_binder on public.binder_pages;
create trigger binder_pages_touch_binder
  after insert or update or delete on public.binder_pages
  for each row execute function public.touch_binder_from_page();

drop trigger if exists binder_slots_touch_binder on public.binder_slots;
create trigger binder_slots_touch_binder
  after insert or update or delete on public.binder_slots
  for each row execute function public.touch_binder_from_slot();
