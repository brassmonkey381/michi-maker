-- Label the accounts the opt-out DEFAULT enrols, instead of leaving them unlabelled.
--
-- 20260824190000 flipped `marketing_consent` to default true so new signups are enrolled like
-- everyone else, and documented three values for `marketing_consent_source`. Only two of them
-- could ever occur: the backfill wrote 'preexisting_optout', the Settings switch writes
-- 'settings', and 'signup_optout' was described but never written by anything. A profile created
-- after that migration therefore arrived with consent true and a NULL source.
--
-- Three such rows already exist. It is not ambiguous today (every pre-migration row carries
-- 'preexisting_optout', so NULL currently means "created since"), but that is an accident of
-- ordering rather than a fact the column states, and it stops being true the moment anything else
-- writes a NULL. The point of the source column is to answer "did this person actually agree?"
-- without having to reason about migration history.
--
-- The backfill deliberately does NOT name `marketing_consent` in its SET list: the
-- profiles_marketing_optout trigger is BEFORE UPDATE **OF marketing_consent**, and mentioning the
-- column would arm it even with an unchanged value.

alter table public.profiles
  alter column marketing_consent_source set default 'signup_optout';

update public.profiles
   set marketing_consent_source = 'signup_optout'
 where marketing_consent
   and marketing_consent_source is null;
