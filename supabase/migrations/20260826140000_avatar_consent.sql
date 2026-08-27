-- tcgscan-michi-maker: nobody's Google photo is public until they say so.
--
-- WHAT HAPPENED. handle_new_user has copied the OAuth provider's avatar_url into
-- public.profiles since the beginning (20260707055603, narrowed to avatar-only in 20260713150000).
-- For a year that was inert: nothing rendered it, every avatar on every surface was an initial in
-- a circle. On 2026-08-26 the profile work started RENDERING avatar_url, on public profile pages,
-- in people search and in the account button. That turned a dormant column into publication of a
-- personal photograph that no one was asked about. 12 accounts, all on public profiles.
--
-- THE FIX IS NOT A BLUR. A blurred <Image> still ships the original bytes to the browser: the URL
-- sits in the DOM, the file is fetched, and right-click or devtools undoes the "obfuscation" in a
-- second. The only thing that actually stops publication is not serving the URL, so this nulls
-- public.profiles.avatar_url for every avatar we took rather than were given.
--
-- NOTHING IS LOST. The provider URL still lives where it came from, auth.users.raw_user_meta_data,
-- which only the account itself (and the service role) can read. So the consent prompt can offer
-- the user their own photo, and accepting simply writes it back to profiles.avatar_url. That is
-- also why no "stashed url" column exists here: a column on profiles would be readable by every
-- signed-in user under the table-level grant, which is the same leak one layer down.
--
-- WHO KEEPS THEIRS. An avatar hosted in our own `avatars` bucket was uploaded by hand through the
-- account sheet, which is a deliberate act by the owner and consent by any reading; those are kept
-- and stamped consented. Everything else goes dark until asked.
--
-- TAKES EFFECT WITHOUT A DEPLOY. Every avatar surface already falls back to the initial circle
-- when avatar_url is null, so the exposure ends the moment this runs; the consent prompt ships
-- afterwards on its own schedule.

-- ---------------------------------------------------------------------------
-- 1. The consent record
-- ---------------------------------------------------------------------------
-- When the owner agreed to show a photo publicly. Null = never asked, or asked and declined.
alter table public.profiles add column if not exists avatar_consented_at timestamptz;
-- When we last ASKED, so the prompt can be offered on a cadence instead of every launch (same
-- shape as rights_prompt_at from 20260826120000).
alter table public.profiles add column if not exists avatar_prompt_at timestamptz;

comment on column public.profiles.avatar_consented_at is
  'When the owner agreed their profile photo may be shown publicly. avatar_url is only ever set '
  'for a consented (or self-uploaded) avatar; see 20260826140000.';

-- ---------------------------------------------------------------------------
-- 2. Keep what was chosen, drop what was taken
-- ---------------------------------------------------------------------------
-- Self-uploaded avatars (our own bucket) are consent by action: the owner picked the file.
update public.profiles
   set avatar_consented_at = coalesce(avatar_consented_at, now())
 where avatar_url is not null
   and avatar_url like '%/storage/v1/object/public/avatars/%';

-- Everything else was copied from an identity provider without asking. Stop serving it.
update public.profiles
   set avatar_url = null
 where avatar_url is not null
   and avatar_url not like '%/storage/v1/object/public/avatars/%'
   and avatar_consented_at is null;

-- ---------------------------------------------------------------------------
-- 3. Stop the bleed
-- ---------------------------------------------------------------------------
-- A new OAuth signup no longer lands with a public photo. The provider's avatar stays in
-- auth.users.raw_user_meta_data, where the account can see its own and be offered it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A public avatar must be one we host
-- ---------------------------------------------------------------------------
-- Belt and braces on the consent flow: profiles.avatar_url may only ever point at our own avatars
-- bucket. An accepted OAuth photo is re-hosted by the client before it is written here (same rule
-- as binder art: we do not serve bytes we do not hold, and a provider URL in a public column is a
-- hotlink to a third party that can change under us). Null is always allowed.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_is_hosted') then
    alter table public.profiles add constraint profiles_avatar_is_hosted
      check (avatar_url is null or avatar_url like '%/storage/v1/object/public/avatars/%');
  end if;
end $$;
