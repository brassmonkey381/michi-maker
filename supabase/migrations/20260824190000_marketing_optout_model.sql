-- Switch product email from opt-IN to opt-OUT, and enrol the accounts that already exist.
--
-- Owner decision 2026-08-24: everyone with a real account is enrolled, and the unsubscribe link in
-- each message is the way out. That is the model CAN-SPAM assumes, and it is a legitimate choice.
-- The privacy policies are being changed in the same breath to describe it, because they currently
-- say product email arrives "only if you have said yes" and shipping this without that edit would
-- leave us doing the opposite of what we published.
--
-- ── Why a source column, rather than just flipping the boolean ────────────────────────────────
-- `marketing_consent = true` will now mean two very different things: "this person ticked a box"
-- and "this person was enrolled by default and has not left yet". Collapsing them destroys the
-- only fact that could ever answer "did they actually agree?" — which is exactly the question that
-- gets asked when a regulator, an acquirer, or an annoyed user asks it. So the boolean records
-- whether we may send, and `marketing_consent_source` records why we think so:
--
--   'preexisting_optout'  enrolled by this migration. Never affirmatively agreed.
--   'signup_optout'       created after the default flipped. Never affirmatively agreed.
--   'settings'            turned it on themselves. Actual consent.
--   'unsubscribe_link'    used when the flag is turned OFF, so a withdrawal names its route.
--
-- Keep this distinction. An EU or UK send, if one is ever contemplated, is defensible only to the
-- 'settings' group, and without this column that group is unrecoverable.
--
-- ── What this migration must NOT do ───────────────────────────────────────────────────────────
-- Re-enrol anyone who has unsubscribed. There are none today, but this file is the template for
-- the next backfill, and "a bulk update quietly resurrected the unsubscribed" is the single most
-- common way an email programme earns a spam complaint it cannot argue with. The WHERE clause
-- below is the guard, and it is not optional.

alter table public.profiles
  add column if not exists marketing_consent_source text;

comment on column public.profiles.marketing_consent is
  'May we send product email. Opt-out model: true by default. See marketing_consent_source for WHY.';
comment on column public.profiles.marketing_consent_at is
  'When the flag last became true. NOT proof of agreement on its own; read it with the source.';
comment on column public.profiles.marketing_consent_source is
  'How consent arose: preexisting_optout | signup_optout | settings. Only settings is a real yes.';

-- New accounts are enrolled the same way, so the model is consistent going forward rather than a
-- one-off backfill that new signups quietly opt out of.
alter table public.profiles
  alter column marketing_consent set default true;

-- The enrolment itself. Anyone who has ever unsubscribed is skipped, permanently.
update public.profiles p
   set marketing_consent = true,
       marketing_consent_at = now(),
       marketing_consent_source = 'preexisting_optout'
  from auth.users u
 where u.id = p.id
   and p.marketing_unsubscribed_at is null   -- the guard: never resurrect an unsubscribe
   and p.marketing_consent_source is distinct from 'settings'  -- never overwrite a real yes
   and not u.is_anonymous
   and u.email is not null;

-- ── the audience view, now carrying the distinction ─────────────────────────────────────────
create or replace view public.marketing_recipients as
  select p.id as user_id, u.email, p.username,
         p.marketing_consent_at, p.marketing_consent_source,
         -- True only for people who actively turned it on. The narrow, defensible-anywhere list.
         (p.marketing_consent_source = 'settings') as affirmative_consent
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.marketing_consent
    and p.marketing_unsubscribed_at is null
    and not u.is_anonymous
    and u.email is not null
    and u.email_confirmed_at is not null;

revoke all on public.marketing_recipients from anon, authenticated;

-- ── withdrawal, now naming its route ────────────────────────────────────────────────────────
-- Adding a defaulted parameter would make the two-argument call ambiguous against the old
-- signature, so the old one goes first. The unsubscribe function calls with two named arguments
-- and still resolves here through the default, so it keeps working before it is redeployed.
drop function if exists public.set_marketing_consent(uuid, boolean);

create or replace function public.set_marketing_consent(
  p_user_id uuid,
  p_consent boolean,
  p_source  text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set marketing_consent = p_consent,
         marketing_consent_at = case when p_consent then now() else marketing_consent_at end,
         marketing_consent_source = coalesce(
           p_source,
           case when p_consent then 'settings' else 'unsubscribe_link' end
         ),
         -- Opting back in clears the suppression; that is the ONLY thing that may clear it.
         marketing_unsubscribed_at = case when p_consent then null else now() end
   where id = p_user_id;
end; $$;

revoke all on function public.set_marketing_consent(uuid, boolean, text)
  from public, anon, authenticated;

-- ── the suppression stamp belongs to the TABLE, not to one caller ────────────────────────────
-- The enrolment backfill skips anyone with `marketing_unsubscribed_at` set. That guard only works
-- if every route to marketing_consent = false stamps it, and there are two routes: the RPC above,
-- and the Settings switch, which writes the row directly through the owner UPDATE policy. The
-- switch was setting the boolean and nothing else, so a person who turned product email off in
-- Settings had no suppression timestamp and the NEXT backfill would have quietly enrolled them
-- again. Someone opting out and then receiving more email is precisely the complaint we cannot
-- argue with.
--
-- Putting it in a trigger means the invariant holds for every writer, including ones not written
-- yet, rather than depending on each caller remembering. coalesce() so an explicit value from the
-- RPC still wins.
create or replace function public.profiles_stamp_marketing_optout()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(old.marketing_consent, false) and not new.marketing_consent then
    new.marketing_unsubscribed_at := coalesce(new.marketing_unsubscribed_at, now());
  elsif new.marketing_consent and not coalesce(old.marketing_consent, false) then
    -- Opting back in is the only thing that may clear a suppression.
    new.marketing_unsubscribed_at := null;
    new.marketing_consent_at := coalesce(new.marketing_consent_at, now());
  end if;
  return new;
end; $$;

drop trigger if exists profiles_marketing_optout on public.profiles;
create trigger profiles_marketing_optout
  before update of marketing_consent on public.profiles
  for each row execute function public.profiles_stamp_marketing_optout();
