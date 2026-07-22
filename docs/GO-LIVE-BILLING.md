# Go-live checklist — billing & subscriptions (michi-maker **and** tcgscan)

How to take billing from Stripe **test mode** to **live mode**. Pair with `docs/PAYMENTS.md` (how
the system works), `docs/SYNERGY.md` (the cross-app shape), and `docs/roadmap/MONETIZATION-TIERS.md`
(the numbers).

## ⚠️ This is a SHARED cutover across both apps

michi-maker and tcgscan are **separate front-ends over one shared billing spine** (see
`docs/SYNERGY.md`): **one Stripe account, one Supabase project (`piikwvntldytjejxmcla`), one set of
edge functions (`stripe-checkout` / `payments-webhook`), one webhook endpoint, one Customer Portal
config, one entitlements ledger, one bundle coupon.** So:

- **The backend cutover is done ONCE and lights up BOTH apps.** §1–5 are shared. The live catalog
  must include **both** `michi_*` and `tcgscan_*` products; the live secret, webhook endpoint,
  portal config, and test-data cleanup all serve both.
- **Setting the live `STRIPE_SECRET_KEY` flips both apps' functions to live at the same instant** —
  you cannot take one app's backend live without the other's.
- **What's per-app is only the front-end flip** (§6): each app has its **own**
  `EXPO_PUBLIC_CHECKOUT_OPEN` flag + its own Vercel deploy (michi-maker.com vs the tcgscan domain).
  That flag is what decides which app actually *sells*, so you can flip them together or stagger.

Net: **one shared backend cutover + two front-end flips.**

## The other thing to understand first

**Almost everything in Stripe is per-mode.** Products, prices, the Customer Portal configuration,
and webhook endpoints all exist separately in test and live mode and **do not copy over**. Live
mode starts empty. Most of this checklist is recreating in live what already exists in test.

**The Supabase project is NOT per-mode.** There is one database (`piikwvntldytjejxmcla`) and one
set of edge-function secrets. So:

- All migrations are already applied — nothing to re-run. (Exception: the PRO-trial + over-cap
  reclaim migration `20260721120000_pro_trials_and_reclaim.sql` is intentionally NOT applied yet —
  apply it during §5, after the test-data cleanup, then enable `pg_cron`. See `docs/PRO-TRIALS.md`.)
- Setting `STRIPE_SECRET_KEY` to a live key makes the **deployed functions operate in live mode
  immediately**. There is no separate "live deploy". This is the real cutover moment.
- The `entitlements` / `billing_customers` / `print_events` rows written during test-mode testing
  are still in the production DB and grant real access. Decide what to do with them (§5).

Because the functions flip the instant the live secret is set, sequence matters: build the live
Stripe catalog first (§1–3), set secrets (§4), clean test data (§5), then flip **each app's** flag
**last** (§6).

---

## 1. Products & prices (live mode)

Recreate every product and price with the **same `lookup_key`** — the code resolves prices by
lookup key and never by price id, so matching keys is what makes the same build work in live mode.
Set each product's `metadata.michi_product` (the webhook maps tiers from it as a fallback).

| lookup_key | price | product · `michi_product` |
| --- | --- | --- |
| `michi_pro_monthly` | $3.99 / mo | michi-maker PRO · `tier_pro` |
| `michi_pro_yearly` | $39.99 / yr | michi-maker PRO · `tier_pro` |
| `michi_vip_monthly` | $9.99 / mo | michi-maker VIP · `tier_vip` |
| `michi_vip_yearly` | $99.99 / yr | michi-maker VIP · `tier_vip` |
| `michi_binder_pdf` | $3.99 one-time | Full-binder fill-sheet PDF · `pdf_binder` |
| `tcgscan_pro_monthly` | TBD | **CROSS-APP** TCGScan Pro · `tcgscan_pro` |
| `tcgscan_pro_yearly` | TBD | **CROSS-APP** TCGScan Pro · `tcgscan_pro` |
| `tcgscan_vip_monthly` | TBD | **CROSS-APP** TCGScan VIP · `tcgscan_vip` |
| `tcgscan_vip_yearly` | TBD | **CROSS-APP** TCGScan VIP · `tcgscan_vip` |

The cross-app bundle **is built and shipped** (tcgscan VIP went live 2026-07-21; `stripe-checkout`
sells all four `tcgscan_*` keys and applies the bundle coupon), so the `tcgscan_*` products are
**required** for a joint go-live, not optional. Confirm the tcgscan prices/descriptions with the
tcgscan side before creating them.

- [ ] PRO product + monthly & yearly prices, lookup keys set
- [ ] VIP product + monthly & yearly prices, lookup keys set
- [ ] One-time full-binder PDF price, lookup key `michi_binder_pdf`
- [ ] **Product descriptions** copied from `docs/PAYMENTS.md → Product descriptions` (they show on
      Checkout and every invoice; the test-mode ones were corrected 2026-07-19 — VIP is 3 prints,
      PRO keeps 1,000 artworks not 100)
- [ ] **TCGScan** Pro + VIP products, monthly & yearly prices, lookup keys `tcgscan_pro_*` /
      `tcgscan_vip_*`, `metadata.michi_product` = `tcgscan_pro` / `tcgscan_vip`, with tcgscan-side
      descriptions

---

## 2. Customer Portal configuration (live mode)

Dashboard → Settings → Billing → Customer portal. **There is no API for this** — it must be done
by hand, per mode.

- [ ] Payment method update: **on**
- [ ] Invoice history: **on**
- [ ] Cancellation: **on**, mode **at end of billing period** (the webhook's dunning/grace logic
      assumes this — immediate cancel would strand a yearly subscriber who released their pool)
- [ ] Business info: link Terms `https://www.michi-maker.com/legal/terms` and Privacy
      `https://www.michi-maker.com/legal/privacy`
- [ ] **Subscription update: OFF.** Upgrades are driven server-side by the app's `change_plan`
      action, which charges the exact whole-month price ($60.00). The portal bills Stripe's
      second-accurate proration ($59.54) — leaving portal updates on means two paths quote two
      different prices for the same upgrade. Let the portal do cancellation and payment methods
      only. (If you deliberately want portal-driven downgrades, enable it with proration
      `always_invoice` and accept the cents-level discrepancy.)

---

## 3. Webhook endpoint (live mode)

Dashboard → Developers → Webhooks → Add endpoint (in **live** mode).

- [ ] URL: `https://piikwvntldytjejxmcla.supabase.co/functions/v1/payments-webhook`
- [ ] Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`,
      `customer.subscription.deleted` (exactly the four the handler switches on)
- [ ] Copy the endpoint's **live signing secret** (`whsec_…`) for §4

---

## 4. Secrets & keys (Supabase)

Single-valued, shared by the deployed functions — setting these is the cutover to live.

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...        # flips BOTH apps' functions to LIVE
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...      # the LIVE endpoint secret from §3
supabase secrets set STRIPE_BUNDLE_COUPON=<live coupon id># the bundle is live — create the coupon
```

- [ ] `STRIPE_SECRET_KEY` = live key (⚠️ this is the shared cutover — lights up michi AND tcgscan)
- [ ] `STRIPE_WEBHOOK_SECRET` = **live** endpoint secret (the test one will not verify live events)
- [ ] `STRIPE_BUNDLE_COUPON` = the **live** bundle coupon id (percent-off; the bundle cross-sell ships)
- [ ] Confirm `verify_jwt` is unchanged after any redeploy: **payments-webhook = false**
      (Stripe can't send a Supabase JWT — the signature is the auth), **stripe-checkout = true**.
      Both functions were last deployed 2026-07-21 (`stripe-checkout` v20 for tcgscan VIP); a
      plain CLI `functions deploy` keeps these defaults — never pass `--no-verify-jwt` to checkout.
- [ ] `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` already set — no change

---

## 5. Clean the test-mode data from the production DB

Test-mode webhooks wrote real rows granting real access to accounts that never paid real money,
and mapped users to **test-mode** Stripe customer ids that don't exist in live mode. Decide and
clean **before** opening checkout.

Owner decision — comp anyone (e.g. yourself) or start fully clean? Recommended: start clean; a
comped account can be re-granted with the manual SQL in `docs/PAYMENTS.md`.

```sql
-- Inspect first.
select u.email, e.product, e.source, e.expires_at from public.entitlements e
join auth.users u on u.id = e.user_id order by u.email;

-- Full reset of Stripe-sourced paid state (service role). Leaves user accounts + binders intact.
delete from public.print_pool_unlocks;
delete from public.print_events;
delete from public.billing_customers;          -- test customer ids; self-heal on first live checkout anyway
delete from public.entitlements where source = 'stripe';   -- keep manual comps if any

-- The throwaway test-clock rig user (never a real login).
delete from auth.users where email = 'billing.clock.rig@example.com';
```

- [ ] Reviewed the entitlements list and decided comps
- [ ] Ran the reset (or a chosen subset)
- [ ] In Stripe **test** mode: delete/stop the test clock and its rig customers (cosmetic, but tidy)

> Note: even if you skip `billing_customers` cleanup, it self-heals — the webhook upserts the new
> live customer id on first live checkout (`on conflict user_id`). But "Manage billing" would error
> for a stale-mapped user until they re-subscribe, so cleaning is safer.

---

## 6. Flip each app on (last) — the ONLY per-app step

`EXPO_PUBLIC_*` vars are baked at **build time** for Expo web, so changing them requires a Vercel
**redeploy**, not just an env edit. Each app has its **own** flags and its **own** Vercel project —
flip them together, or stagger (the backend is already live from §4, so an un-flipped app simply
keeps showing its "coming soon" note).

**michi-maker (this repo, michi-maker.com):**
- [ ] `EXPO_PUBLIC_LIMITS_ENFORCED=1` in Vercel Production (already set — confirm)
- [ ] `EXPO_PUBLIC_CHECKOUT_OPEN=1` in Vercel Production — **the final switch**; CTAs stop showing
      the "coming soon" note and launch real checkout
- [ ] Trigger a production redeploy so both flags take effect
- [ ] Confirm return-URL origins in `stripe-checkout` `ALLOWED_RETURN_ORIGINS` cover the live
      domain (currently includes `https://www.michi-maker.com` **and** the tcgscan domains)

**tcgscan (sister repo/Vercel project):**
- [ ] Flip tcgscan's own checkout-open flag + any limits flag, then redeploy its Vercel project
- [ ] Confirm tcgscan's live domain is in `ALLOWED_RETURN_ORIGINS` (already includes
      `https://www.tcgscan.ai` / `https://tcgscan.ai`)

---

## 7. Verify (before and after the flip)

**Pre-flip, local:**
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` green (the billing maths — 31 assertions)
- [ ] `npm run lint` — clean of errors (3 unrelated warnings remain; the old `ColorPicker.tsx`
      `react-hooks/refs` errors were cleared 2026-07-20 by moving its Animated.Value to lazy state)
- [ ] `npx expo export -p web` succeeds (proves the shared-module `.ts` imports bundle)

**Post-flip, live smoke test (real card, then refund):**
- [ ] Boot-check the live functions resolve: an unauthed POST to `payments-webhook` returns
      `400 bad signature` (not a 500); a publishable-key POST to `stripe-checkout` returns
      `401 not signed in`. A 500 means a secret or import is wrong.
- [ ] One real PRO yearly checkout → entitlement lands within seconds, plan page shows PRO
- [ ] One real upgrade PRO→VIP → invoice equals the quoted whole-month price to the cent
- [ ] "Manage billing" opens the live portal
- [ ] Cancel → subscription shows cancel-at-period-end, access holds to term end
- [ ] Refund the smoke-test charges in the live dashboard

---

## What's been verified in test mode (confidence going in)

This billing system was exercised end to end against live test-mode Stripe, including with Stripe
test clocks for time-dependent paths. Verified: fresh checkout · in-app upgrade at 12 months and
mid-term (prorated price **and** prints) · failed-payment void (no charge, no plan change) · portal
cancel · **renewal** · **dunning** · **lapse** · **resubscribe** · the annual-pool consumption state
machine through the real UI. Five money bugs were found and fixed along the way (duplicate
subscription, string-compare proration, payment-method resolution, unpaid-renewal year, and two
month-arithmetic drifts between copies). The money maths lives in one unit-tested module
(`src/data/proration.ts`, imported by the app and both edge functions).

## Known open items (decide, don't discover)

- **Cross-app bundle** (`tcgscan_pro` / `tcgscan_vip`, `STRIPE_BUNDLE_COUPON`) **is now built and
  shipped** (tcgscan VIP live 2026-07-21). So the live catalog MUST include the `tcgscan_*` products
  and a live bundle coupon, and the joint go-live lights up both apps at once (§4). Coordinate the
  tcgscan prices/descriptions with the tcgscan side; without the coupon the bundle CTA still degrades
  gracefully.
- **Cross-interval changes** (monthly↔yearly) and **downgrades** are intentionally routed to the
  portal, not `change_plan`. Monthly plans are otherwise **untested** — no monthly customer has
  been driven through checkout, window slicing, or the cross-interval refusal.
- **`ColorPicker.tsx` lint errors** — RESOLVED 2026-07-20 (Animated.Value moved to lazy state).
  `npm run lint` is now error-clean (3 unrelated warnings remain).
