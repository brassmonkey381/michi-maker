-- SHARING NEEDS AN ACCOUNT (owner, 2026-10-16).
--
-- Guest mode signs a visitor in anonymously so binders save at once, and a guest may upgrade to
-- a real account later with the same user id (docs/AUTH.md). Until tonight a guest could also
-- flip a binder public from the Share sheet: three did, and the public viewer credited each to
-- "a collector", a binder credited to nobody. Likes and upvotes already refuse guests at the
-- policy; sharing now does too, the same way (`is_anonymous` in the JWT), so a guest's binder
-- is private until they sign up. Going private, and every other edit, is unchanged.
--
-- Re-runnable: policies are dropped and recreated; the row update is idempotent.

drop policy if exists "Users can create their own binders" on public.binders;
create policy "Users can create their own binders"
  on public.binders for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (not is_public or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  );

drop policy if exists "Owners can update their binders" on public.binders;
create policy "Owners can update their binders"
  on public.binders for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and (not is_public or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  );

-- The binders guests had already shared go private; they come back public when the guest signs
-- up (same user id) and flips them again.
update public.binders b
   set is_public = false
  from auth.users u
 where u.id = b.owner_id and u.is_anonymous and b.is_public;
