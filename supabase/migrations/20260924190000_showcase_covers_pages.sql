-- Showcase has to make the PAGES visible too, not just the binder.
--
-- THE BUG. "image" in Studio failed instantly with no useful message. The renderer answered
-- `{"error":"nothing to draw"}` even for a binder that was public and readable anonymously, because
-- api/og-image-binder.js reads the binder AS ANON and `binder_pages` carries its own `is_public`.
-- The puzzle binders were imported with every page `is_public = false` (scripts/connected-art and
-- scripts/puzzles both wrote false), so the nested select came back with an empty page list and the
-- renderer, correctly, had nothing to draw.
--
-- A binder that is public and whose pages are all private is a contradiction nobody asked for: it
-- renders no preview, shares no image, and shows an empty binder to anyone who opens the link.
-- Turning showcase on now means the whole thing is visible, which is what the word says.
--
-- SCOPED, AND IT MOVES PAGES BOTH WAYS. Turning showcase off puts the pages back to private with
-- the binder, because leaving them public would quietly keep them readable to anyone holding a page
-- link after the owner believed they had made the binder private again.

create or replace function public.admin_set_binder_showcase(p_binder_id uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  update public.binders
     set is_public = p_on, hidden_from_feeds = p_on
   where id = p_binder_id and owner_id = auth.uid();
  if not found then
    raise exception 'not your binder' using errcode = '42501';
  end if;

  -- The pages follow. Without this the binder is public and draws nothing.
  update public.binder_pages
     set is_public = p_on
   where binder_id = p_binder_id;
end;
$$;

revoke all on function public.admin_set_binder_showcase(uuid, boolean) from public;
grant execute on function public.admin_set_binder_showcase(uuid, boolean) to authenticated;

-- Repair what the import left behind: any binder already showcased (public and out of the feeds)
-- whose pages were written private. Deliberately narrow, so it cannot touch an ordinary binder
-- where a private page is a choice the owner made.
update public.binder_pages p
   set is_public = true
  from public.binders b
 where b.id = p.binder_id
   and b.is_public
   and b.hidden_from_feeds
   and not p.is_public;

comment on function public.admin_set_binder_showcase(uuid, boolean) is
  'Public enough for a share image and invisible to every feed. Moves the binder AND its pages: a '
  'public binder whose pages are private renders nothing and shows an empty binder.';
