-- Consent to receive product email, and the record of withdrawing it.
--
-- Until now there was nowhere to store either, which is why no campaign could honestly be sent:
-- every address in auth.users was collected to run an account, and nothing recorded a yes. The
-- privacy policies (michi 0a77d0f, tcgscan 5d28e6a) now promise a one-click unsubscribe and a
-- Settings toggle, and this is what makes both of those real.
--
-- THREE COLUMNS, NOT ONE. "Never said yes" and "said yes and then left" are different facts and
-- must not collapse into a single false. A withdrawal has to outlive a later re-tick so we can
-- prove when someone left, and a suppression must survive somebody re-importing a list. So:
--
--   marketing_consent          the live answer. Nothing is sent unless this is true.
--   marketing_consent_at       when they said yes. Null means they never have.
--   marketing_unsubscribed_at  when they last said stop. Never cleared by anything but an
--                              explicit new opt-in, and kept forever as the audit trail.
--
-- DEFAULT FALSE is the whole point: an existing row cannot become a recipient by migration.

alter table public.profiles
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_unsubscribed_at timestamptz;

comment on column public.profiles.marketing_consent is
  'Live answer to "may we send you product email". False by default; nothing is sent without it.';
comment on column public.profiles.marketing_unsubscribed_at is
  'When they last unsubscribed. Kept forever as the audit trail; cleared only by a new opt-in.';

-- ── the audience view ───────────────────────────────────────────────────────────────────────
-- One definition of "who may receive a campaign", so a send can never be assembled from a
-- hand-written query that forgets a condition. Deliberately NOT a security definer: it is read
-- with the secret key by the sending job, never by a client.
create or replace view public.marketing_recipients as
  select p.id as user_id, u.email, p.username, p.marketing_consent_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.marketing_consent
    and p.marketing_unsubscribed_at is null
    and not u.is_anonymous
    and u.email is not null
    and u.email_confirmed_at is not null;

revoke all on public.marketing_recipients from anon, authenticated;

-- ── withdrawal, callable without a session ──────────────────────────────────────────────────
-- The unsubscribe endpoint runs with the secret key and no user context: someone clicking an
-- unsubscribe link in a year-old email is not signed in, and requiring them to be would break the
-- promise the policy makes. Keeping the write in one function means the "consent off, timestamp
-- on" pair can never be set half way by a caller that forgot the second half.
create or replace function public.set_marketing_consent(p_user_id uuid, p_consent boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set marketing_consent = p_consent,
         marketing_consent_at = case when p_consent then now() else marketing_consent_at end,
         -- Opting back in clears the suppression; that is the ONLY thing that may clear it.
         marketing_unsubscribed_at = case when p_consent then null else now() end
   where id = p_user_id;
end; $$;

-- Nobody but the service role calls this. The Settings toggle writes through the normal
-- owner-scoped UPDATE policy on profiles instead, so a client can only ever change its own row.
revoke all on function public.set_marketing_consent(uuid, boolean) from public, anon, authenticated;
