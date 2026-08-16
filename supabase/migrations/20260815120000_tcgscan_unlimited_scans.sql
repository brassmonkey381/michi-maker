-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- tcgscan: scanning is UNLIMITED on every tier (owner call 2026-08-15)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Scanning is tcgscan's front door, and the owner has made it free for everyone: guest, free,
-- PRO, and VIP all scan without a monthly cap from today. This is exactly the change tier_caps
-- exists for — one UPDATE, effective immediately, no function rewrites:
--
--   * tcgscan_scan_cap() → cap_value() reads these rows; NULL resolves to uncapped(), so
--     record_scan_event() never raises tier_cap_exceeded:cardScansPerMonth again and the
--     scan_events RLS insert policy (scan_credits_left > 0) never refuses.
--   * scan_events keeps recording one row per confirmed add — the meter survives as usage
--     analytics and the "N · Unlimited" line on the plans page, it just gates nothing.
--   * The client mirror (tcgscan-app src/lib/tiers.ts) ships Infinity for all four tiers in the
--     same change; tcgscan-app scripts/check-tier-caps.mjs pins the two together.
--
-- michi's caps are untouched. Reversible the same way: UPDATE these rows back to numbers.

update public.tier_caps
   set value = null, updated_at = now()
 where app = 'tcgscan' and limit_key = 'cardScansPerMonth';
