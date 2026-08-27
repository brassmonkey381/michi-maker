-- tcgscan-michi-maker: the share link's cache-buster becomes a fingerprint, not a running count.
--
-- WHAT CHANGED AND WHY. 20260826150000 gave every binder `share_version`, an integer bumped
-- whenever the preview's inputs moved, so a re-shared link differs from one a scraper already
-- cached. That mechanism is right and is kept. The COUNTER is the part being replaced.
--
-- The day after it landed, 20260826160000 made page and slot writes touch the parent binder, so
-- the preview would stop going stale after an edit. Correct, and it also means every card placed,
-- moved or removed bumps the count: a binder six minutes old was already at ?v=157. Nothing broke
-- — but the number is not information anyone wants. It advertises how many times its owner has
-- fiddled with the page, it grows without bound, and "157" invites the reader to wonder what the
-- other 156 were.
--
-- A FINGERPRINT SAYS THE SAME THING AND NOTHING MORE. All the URL needs is to DIFFER when the
-- preview differs; it never needs to be ordered, comparable, or countable. So the value is now a
-- short hash of exactly the two inputs `ogImageUrl` reads — updated_at and share_page_ids — which
-- keeps the property that matters (same preview → same link, changed preview → new link) and
-- drops the one nobody asked for.
--
-- EIGHT HEX CHARACTERS is deliberate, not a rounding. The value only has to differ from THIS
-- binder's previous value; it is never compared across binders and never parsed. Even a collision
-- costs nothing worse than a scraper serving the embed it already had — the behaviour before any
-- of this existed. md5 is used because it is built in (no pgcrypto) and this is a cache key, not a
-- security boundary.
--
-- OLD LINKS KEEP WORKING, exactly as before: `?v=` is not read by the app, the SPA routes on the
-- path, and the OG endpoint reads `id` from the rewrite. A link carrying a stale integer v — every
-- link shared before this migration — still resolves to the same binder.

alter table public.binders
  add column if not exists share_key text;

comment on column public.binders.share_key is
  'Cache-busting fingerprint for the shared /binder/<id>?v=<key> link. A short md5 of the '
  'preview inputs (updated_at, share_page_ids), maintained by trigger; see 20260826170000.';

-- The fingerprint itself. One definition, used by both the trigger and the backfill below, so the
-- two can never drift.
create or replace function public.binder_share_key(
  p_updated_at timestamptz,
  p_share_page_ids uuid[]
)
returns text
language sql
immutable
set search_path = ''
as $$
  select substr(md5(coalesce(p_updated_at::text, '') || '|' || coalesce(p_share_page_ids::text, '')), 1, 8);
$$;

-- The old trigger and its function go entirely, rather than being re-bodied under a name that
-- would then be a lie: nothing called `bump_share_version` should be setting a hash.
drop trigger if exists binders_share_version on public.binders;
drop function if exists public.binders_bump_share_version();

-- Same firing conditions as 20260826150000 -- only what gets written changes. INSERT is now
-- covered too: a binder that has never been edited still needs a key, where the counter could
-- lean on its column default of 1.
create or replace function public.binders_set_share_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.updated_at is distinct from old.updated_at
     or new.share_page_ids is distinct from old.share_page_ids then
    new.share_key := public.binder_share_key(new.updated_at, new.share_page_ids);
  end if;
  return new;
end;
$$;

-- Fires AFTER binders_set_updated_at, as the counter's trigger did: BEFORE triggers run in name
-- order and 'set_updated_at' < 'set_share_key' is NOT true, so the name is chosen to sort after —
-- 'binders_set_updated_at' < 'binders_share_key' — leaving new.updated_at already stamped when
-- this reads it.
drop trigger if exists binders_share_key on public.binders;
create trigger binders_share_key
  before insert or update on public.binders
  for each row execute function public.binders_set_share_key();

-- Backfill every existing row. Written directly rather than by touching updated_at: a no-op
-- UPDATE that moved updated_at would change every binder's preview URL at once and cold-cache
-- every share on the site for nothing.
update public.binders
   set share_key = public.binder_share_key(updated_at, share_page_ids)
 where share_key is null;

-- share_version IS DELIBERATELY LEFT IN PLACE, and dropping it here would have been a mistake.
--
-- A migration and a deploy are not simultaneous. Whichever runs first, there is a window where the
-- other half of the system is the previous version: drop the column now and the currently deployed
-- api/og-binder.js still asks for it, PostgREST rejects the whole select, and every shared binder
-- unfurls as the generic fallback until the deploy lands. Adding a column breaks nobody in either
-- direction, so this migration is safe to run before OR after the deploy.
--
-- Its trigger is gone, so the counter is frozen at whatever it last reached and nothing reads it.
-- A follow-up migration drops it once the deploy carrying share_key is live. Two columns claiming
-- to version the same link is how one of them quietly becomes wrong — this is a short-lived
-- overlap, not a permanent arrangement.
