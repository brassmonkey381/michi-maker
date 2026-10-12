-- What each entitlement row actually costs.
--
-- The ledger said WHO holds a tier and from WHICH provider, but never what they pay. On
-- 2026-10-11 PRO went from $49.99/yr and $5.99/mo to $24.99/yr and $2.99/mo, and nothing
-- downstream could tell a subscriber at the old price from one at the new - the morning email
-- said "1 paying" and could not say $49.99 or $24.99, let alone sum a monthly run-rate.
--
-- Three nullable, additive columns, stamped by the two webhooks at every grant and renewal:
--   price_lookup_key  the provider's price identity (Stripe lookup_key, Apple product id)
--   unit_amount_minor the amount in MINOR units (cents) for one billing interval of this
--                     price; for a bundle price that grants two products, BOTH rows carry the
--                     whole bundle amount and the studio counts it once per (user, lookup key)
--   currency          ISO 4217, lower case, as the provider reports it
--
-- Existing rows keep NULL, which reads as "price not recorded" and must never be rendered as $0.
-- A trial grant (source = 'trial') and a hand grant (source = 'manual') never carry a price.

alter table public.entitlements
  add column if not exists price_lookup_key text,
  add column if not exists unit_amount_minor integer,
  add column if not exists currency text;

comment on column public.entitlements.price_lookup_key is
  'Provider price identity that granted this row: Stripe price lookup_key, or the Apple product id via RevenueCat. NULL = not recorded (rows written before 2026-10-12, trials, manual grants).';
comment on column public.entitlements.unit_amount_minor is
  'Price of one billing interval in minor units (cents). A bundle price stamps the whole amount on every product row it grants; count once per (user_id, price_lookup_key). NULL = not recorded, never 0.';
comment on column public.entitlements.currency is
  'ISO 4217 currency of unit_amount_minor, lower case. NULL when the amount is NULL.';
