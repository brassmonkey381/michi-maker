-- Contest: the 16-page cap counts PUBLIC pages, not total pages. A 40-page binder can enter by
-- hiding pages down to 16 public ones; contest views only ever show an entry's public pages
-- (the viewer additionally caps at the first 16). The client blocks flipping a 17th page public
-- on an entered binder (with a toast); this INSERT gate is the server-side floor at entry time.

drop policy if exists "Users can enter their own binders" on public.contest_entries;
create policy "Users can enter their own binders"
  on public.contest_entries for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.binders b
      where b.id = contest_entries.binder_id and b.owner_id = (select auth.uid())
    )
    and (
      select count(*) from public.binder_pages pg
      where pg.binder_id = contest_entries.binder_id and pg.is_public
    ) <= 16
  );
