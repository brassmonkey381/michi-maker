-- Term support for the entitlements ledger: subscriptions expire, one-time unlocks don't.
--
-- Backwards compatible: every existing row (all one-time `pdf_print` unlocks) keeps a NULL
-- `expires_at`, which means "lifetime". A subscription tier row carries a term end that the
-- payment webhook moves forward on renewal (and lets lapse on cancellation) — service role
-- only, same as every other write here (there are still NO client write policies; the owner
-- SELECT policy from 20260715120000 already covers this new column).

alter table public.entitlements
  add column if not exists expires_at timestamptz;

comment on column public.entitlements.expires_at is
  'Subscription term end. NULL = lifetime (one-time unlock). A grant is ACTIVE while expires_at is NULL or in the future. Renewals / cancellations move this via the payment webhook (service role only).';

-- Product vocabulary for the `product` text column. Documented here rather than constrained
-- by a CHECK / enum so a new product never needs a migration:
--
--   'pdf_print'         one-time LIFETIME full-print unlock. GRANDFATHERED — every existing
--                       holder (incl. the owner + test account) keeps full print forever.
--   'tier_pro'          PRO subscription   (expires_at set per billing period).
--   'tier_vip'          VIP subscription   (expires_at set per billing period).
--   'pdf_sample'        one-time single-sheet watermarked sample     (future).
--   'pdf_binder:<id>'   one-time full PDF for a single binder         (future).
--
-- The client resolves an effective tier from these rows (see src/data/tiers.ts / useTier);
-- PRO and VIP both imply full print, so they subsume `pdf_print` for new subscribers.
