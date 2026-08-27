-- tcgscan-michi-maker: a share link that changes when its preview changes.
--
-- THE PROBLEM. Discord, Slack, iMessage and the rest cache an unfurl against the URL that was
-- posted, for a day or more, and nothing in the page can shorten that. `ogImageUrl` already busts
-- the IMAGE cache with the binder's updated_at, but a scraper that has seen /binder/<id> before
-- never re-fetches the page, so it never sees the new image URL. Re-warming the preview after an
-- edit therefore heated a CDN entry nobody would request: the embed people saw stayed the old one.
--
-- THE FIX is to make the shared URL itself different when the preview differs, so the scraper has
-- no cache entry to serve: /binder/<id>?v=3. This column is that v.
--
-- WHY A COUNTER AND NOT "bump it whenever we warm". Warming runs every time the share sheet opens,
-- so bumping there would climb v on mere opens, and a link copied yesterday would look stale for
-- no reason. The version has to track the PREVIEW's identity, which is exactly the two inputs
-- ogImageUrl reads: updated_at (any edit) and share_page_ids (which pages are featured). The
-- trigger below bumps on precisely those, so v changes when the picture changes and never
-- otherwise, and the same link copied twice with no edits between is the same link.
--
-- OLD LINKS KEEP WORKING. `?v=` is not read by the app; the SPA routes on the path alone and the
-- OG endpoint reads `id` from the rewrite. A link with a stale v (or none at all) resolves to the
-- same binder and unfurls with whatever that scraper cached, which is the pre-existing behaviour.

alter table public.binders
  add column if not exists share_version integer not null default 1;

comment on column public.binders.share_version is
  'Cache-busting version for the shared /binder/<id>?v=N link. Bumped by trigger when the preview '
  'changes (updated_at or share_page_ids); see 20260826150000.';

-- Bump when either preview input moves. Deliberately NOT "on any update": share_version itself,
-- removed_at, archived_at and is_public do not change the rendered image, and a link that churned
-- on a takedown or a privacy flip would be noise.
--
-- Fires AFTER binders_set_updated_at (BEFORE triggers run in name order, and 'set' < 'share'), so
-- new.updated_at already holds the new stamp by the time this compares it.
create or replace function public.binders_bump_share_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at is distinct from old.updated_at
     or new.share_page_ids is distinct from old.share_page_ids then
    new.share_version := coalesce(old.share_version, 1) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists binders_share_version on public.binders;
create trigger binders_share_version
  before update on public.binders
  for each row execute function public.binders_bump_share_version();
