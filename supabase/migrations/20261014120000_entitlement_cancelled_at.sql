-- Whether a subscription will renew.
--
-- The ledger knew WHEN a term ends but not whether anything happens at that moment. A
-- subscriber who turns auto-renew off during a $0 trial kept reading as "first charge <date>"
-- in the morning email, when no charge is coming. The webhooks already learn this - Stripe's
-- cancel_at_period_end, RevenueCat's CANCELLATION - and used it only to drop the 3-day grace
-- from expires_at, which left the fact readable only as arithmetic.
--
-- One nullable, additive column, stamped by both webhooks on every event they write:
--   cancelled_at  when the subscriber turned renewal off (or the provider ended it). NULL means
--                 the subscription will renew, or the row is not a subscription (trial, grant).
--                 An UNCANCELLATION / renewal clears it back to NULL.
--
-- Existing rows keep NULL and read as "will renew" - the honest default, since every live
-- subscription event re-stamps this column within the day.

alter table public.entitlements
  add column if not exists cancelled_at timestamptz;

comment on column public.entitlements.cancelled_at is
  'When renewal was turned off (Stripe cancel_at_period_end / canceled_at, RevenueCat CANCELLATION). NULL = will renew at expires_at, or not a subscription. Cleared on UNCANCELLATION or a renewal.';
