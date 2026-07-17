-- CROSS-APP entitlement products. The `entitlements` ledger is SHARED across the two apps that
-- sit on this project (michi-maker + tcgscan / idontgitit.com). `product` is free text (no CHECK),
-- so no DDL is needed to introduce a product — this migration only documents the shared vocabulary
-- so both codebases agree on the keys. See docs/SYNERGY.md.
--
--   'tier_pro' / 'tier_vip'  michi-maker subscriptions (resolved to a Tier by src/data/tiers.ts)
--   'pdf_print'              michi one-time lifetime print unlock (grandfathered)
--   'tcgscan_pro'            TCGScan Pro subscription — SOLD BY THE SIBLING APP, written here so
--                            michi can unlock scan-powered features (e.g. Build-a-binder-from-
--                            your-collection). expires_at carries the term. michi never sells or
--                            resolves a tier from it; it's read directly via hasTcgscanPro().
--
-- Writes stay service-role-only (each app's payment webhook upserts here); clients read their own
-- rows via the existing owner-SELECT RLS policy — no schema change, so nothing to alter.

comment on table public.entitlements is
  'SHARED per-user product unlocks across michi-maker + tcgscan (tier_pro/tier_vip/pdf_print/tcgscan_pro). Granted server-side only (each app''s webhook / manual); clients read their own rows. See docs/SYNERGY.md.';
