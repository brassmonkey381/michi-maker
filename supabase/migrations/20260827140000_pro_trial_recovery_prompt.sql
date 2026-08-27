-- Ask the people who saw the PRO trial at the wrong moment whether they still want it.
--
-- WHAT HAPPENED, in two overlapping halves.
--
-- BAD PLACEMENT. For three weeks the 14-day trial existed in exactly two places: /plans and the
-- print gate. Fourteen accounts ever saw the offer, twelve of them within twenty-five minutes of
-- signing up, holding one binder, blocked by nothing — an advert, not an answer to a question they
-- had asked. Thirteen never pressed the button.
--
-- THE STALE-CLAIM BUG (fixed by 20260824120000). A guest upgrade keeps the same uid and the same
-- access token, so `auth.jwt() ->> 'is_anonymous'` stayed true for up to an hour and the RPC
-- refused a real account as a guest. Checking each offer-seer's auth.identities lag against their
-- user row: FOUR real accounts saw the offer inside that hour before the fix (wallapaloo,
-- hi123456, noahx, xii_clear), one more sat on the boundary at 61 minutes (etrdyitfuoy), and three
-- were fresh signups that could never have been affected. It is a smaller set than the twelve.
--
-- WE WOULD KNOW IF THEY HAD CLICKED. trial.start_failed has been instrumented since 2026-08-05,
-- two days before the first impression, and every throw path (RPC refusal included) lands in the
-- same catch. The proof is not a code reading: brassmonkey382 clicked 1m44s after upgrading, dead
-- inside the window, and two trial.start_failed events landed. No such event exists for any of the
-- other thirteen. So the bug cost us roughly four people's goodwill; bad placement cost the rest.
--
-- Either way the remedy is the same, which is why one flag covers both: every account flagged here
-- is still trial-eligible today, and none of them has been asked at a moment that meant anything.
--
-- WHY A FLAG COLUMN rather than deriving the set in the app: the cohort is defined by analytics
-- impressions, which the client has no business querying, and it must be FIXED — a set that
-- recomputes would sweep in every future user and quietly become the standing nudge the owner
-- ruled out (2026-08-27: the offer belongs at a wall, or nowhere). Nothing in the app ever sets
-- this true; only this migration does.

alter table public.profiles
  add column if not exists pro_trial_offer_due boolean not null default false,
  add column if not exists pro_trial_prompt_at timestamptz;

comment on column public.profiles.pro_trial_offer_due is
  'One-time recovery cohort: was shown the PRO trial before it lived at the cap gates. Set only by '
  '20260827140000. The app never sets it true.';
comment on column public.profiles.pro_trial_prompt_at is
  'When the one-time trial recovery prompt was shown. Non-null retires it — this prompt asks once, '
  'and a second ask would be the nag the placement fix exists to avoid.';

-- The cohort: shown the offer, never trialed, never held a paid tier (i.e. start_pro_trial would
-- still say yes today). Guests excluded — the RPC refuses anonymous callers, so offering it to one
-- would be an offer we cannot honour.
update public.profiles p
   set pro_trial_offer_due = true
 where exists (
         select 1 from public.analytics_events e
          where e.user_id = p.id and e.app = 'michi' and e.name = 'pro.offer_shown')
   and exists (select 1 from auth.users au where au.id = p.id and au.is_anonymous = false)
   and not exists (select 1 from public.pro_trials t where t.user_id = p.id)
   and not exists (
         select 1 from public.entitlements en
          where en.user_id = p.id and en.product in ('tier_pro','tier_vip') and en.source <> 'trial');
