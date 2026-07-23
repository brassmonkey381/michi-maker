# Go-live checklist — billing & subscriptions (michi-maker **and** tcgscan)

> ## ✅ CUTOVER COMPLETE — 2026-07-22. Both apps are LIVE and selling.
> ## ✅ SMOKE-TESTED WITH REAL MONEY — 2026-07-22.
>
> Live catalog (5 products / 9 prices, lookup keys mirroring test), live bundle coupon
> `Si93JqYS`, live webhook endpoint `we_1Tw4YEH8KZaf7tNOd0et9nZL`, and the three live secrets are
> all in place; §5 test-data cleanup ran and the PRO-trials/reclaim migration is applied with its
> nightly `pg_cron` job. Boot checks pass (webhook `400 missing signature`, checkout `401`).
>
> **§6 needed no action — and that is the one thing this checklist got wrong.** It assumed
> `EXPO_PUBLIC_CHECKOUT_OPEN` had to be flipped in Vercel, but michi's `vercel.json` has baked
> `EXPO_PUBLIC_CHECKOUT_OPEN=1` into `buildCommand` since 4fe687d (2026-07-16), exactly like
> tcgscan. Both deployed bundles were verified to compile `CHECKOUT_OPEN` and `LIMITS_ENFORCED`
> to `true`. So **both apps went live at the same instant the live `STRIPE_SECRET_KEY` was set** —
> there was no separate per-app front-end switch to stagger. If you ever need to close checkout
> again, edit `vercel.json`'s `buildCommand` and redeploy; a Vercel env var alone will not do it.
>
> **Closed since the cutover** (2026-07-22 → 07-23):
> - §2 live **Customer Portal** configured (Subscription update OFF, per the reasoning below).
> - §7 **real-card smoke test** ran on michi: PRO yearly bought → entitlement landed in seconds ·
>   one included print spent · in-app **PRO→VIP upgrade charged the quoted $60.00 to the cent
>   without re-entering Checkout** (server-driven `change_plan` on the existing subscription — the
>   legal basis is the pre-authorised payment method plus the priced confirm step in-app; it is a
>   subscription *modification*, not a new sale) · cancel → cancel-at-period-end.
> - Every `[PLACEHOLDER]` in `src/app/legal/*` is filled, including `terms.tsx`'s
>   billing/renewal/**refund** clause, and beta-era messaging is retired app-wide.
> - **support@michi-maker.com** is live and wired into the legal pages and the DMCA notice; a DMCA
>   agent (**"Copyright Compliance Agent"**) is registered with the U.S. Copyright Office.
>
> **Still open** (none of it blocks selling):
> - Delete the local `sk_live.txt` / `supabase_token.txt` handoff files. ⚠️ **These are live
>   credentials sitting in `C:\Users\Brian\` — highest-value item on this list.**
> - Add `support@michi-maker.com` to Stripe → Settings → Business → Public details (it shows on
>   receipts and in the portal).
> - Refund the smoke-test charges in the live dashboard if you want the money back (the
>   subscription is cancelled, but the PRO-yearly and upgrade charges stand).
> - Delete the test-mode test clock and its rig customers (cosmetic).
> - **tcgscan has NOT had a real-card smoke test.** Its checkout, upgrade path, and over-cap
>   reclaim went live on code parity with michi, not on an exercised live purchase — see
>   `tcgscan-expo/docs/MONETIZATION-TIERS.md`.

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
| `tcgscan_pro_monthly` | $3.99 / mo | **CROSS-APP** TCGScan Pro · `tcgscan_pro` |
| `tcgscan_pro_yearly` | $39.99 / yr | **CROSS-APP** TCGScan Pro · `tcgscan_pro` |
| `tcgscan_vip_monthly` | $9.99 / mo | **CROSS-APP** TCGScan VIP · `tcgscan_vip` |
| `tcgscan_vip_yearly` | $99.99 / yr | **CROSS-APP** TCGScan VIP · `tcgscan_vip` |

tcgscan's price points **mirror michi's exactly** — that is deliberate, and it is what keeps the
bundle maths legible ("60% off the second app" reads the same in both directions).

The cross-app bundle **is built and shipped** (tcgscan VIP went live 2026-07-21; `stripe-checkout`
sells all four `tcgscan_*` keys and applies the bundle coupon), so the `tcgscan_*` products are
**required** for a joint go-live, not optional. Confirm the tcgscan prices/descriptions with the
tcgscan side before creating them.

- [x] PRO product + monthly & yearly prices, lookup keys set
- [x] VIP product + monthly & yearly prices, lookup keys set
- [x] One-time full-binder PDF price, lookup key `michi_binder_pdf`
- [x] **Product descriptions** copied from `docs/PAYMENTS.md → Product descriptions` (they show on
      Checkout and every invoice; the test-mode ones were corrected 2026-07-19 — VIP is 3 prints,
      PRO keeps 1,000 artworks not 100)
- [x] **TCGScan** Pro + VIP products, monthly & yearly prices, lookup keys `tcgscan_pro_*` /
      `tcgscan_vip_*`, `metadata.michi_product` = `tcgscan_pro` / `tcgscan_vip`, with tcgscan-side
      descriptions

---

## 2. Customer Portal configuration (live mode)

Dashboard → Settings → Billing → Customer portal. **There is no API for this** — it must be done
by hand, per mode.

- [x] Payment method update: **on**
- [x] Invoice history: **on**
- [x] Cancellation: **on**, mode **at end of billing period** (the webhook's dunning/grace logic
      assumes this — immediate cancel would strand a yearly subscriber who released their pool)
- [x] Business info: link Terms `https://www.michi-maker.com/legal/terms` and Privacy
      `https://www.michi-maker.com/legal/privacy`
- [x] **Subscription update: OFF.** Upgrades are driven server-side by the app's `change_plan`
      action, which charges the exact whole-month price ($60.00). The portal bills Stripe's
      second-accurate proration ($59.54) — leaving portal updates on means two paths quote two
      different prices for the same upgrade. Let the portal do cancellation and payment methods
      only. (If you deliberately want portal-driven downgrades, enable it with proration
      `always_invoice` and accept the cents-level discrepancy.)

---

## 3. Webhook endpoint (live mode)

Dashboard → Developers → Webhooks → Add endpoint (in **live** mode).

- [x] URL: `https://piikwvntldytjejxmcla.supabase.co/functions/v1/payments-webhook`
- [x] Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`,
      `customer.subscription.deleted` (exactly the four the handler switches on)
- [x] Copy the endpoint's **live signing secret** (`whsec_…`) for §4

---

## 4. Secrets & keys (Supabase)

Single-valued, shared by the deployed functions — setting these is the cutover to live.

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...        # flips BOTH apps' functions to LIVE
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...      # the LIVE endpoint secret from §3
supabase secrets set STRIPE_BUNDLE_COUPON=<live coupon id># the bundle is live — create the coupon
```

- [x] `STRIPE_SECRET_KEY` = live key (⚠️ this is the shared cutover — lights up michi AND tcgscan)
- [x] `STRIPE_WEBHOOK_SECRET` = **live** endpoint secret (the test one will not verify live events)
- [x] `STRIPE_BUNDLE_COUPON` = the **live** bundle coupon id (percent-off; the bundle cross-sell ships)
- [x] Confirm `verify_jwt` is unchanged after any redeploy: **payments-webhook = false**
      (Stripe can't send a Supabase JWT — the signature is the auth), **stripe-checkout = true**,
      **auth-handoff = true** (it mints a sign-in link for *the caller's own* account — see
      `docs/AUTH.md → Cross-app SSO handoff`). `stripe-checkout` is on **v24** (app-family-generic
      upgrade paths); a plain CLI `functions deploy` keeps these defaults — never pass
      `--no-verify-jwt` to checkout or auth-handoff.
- [x] `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` already set — no change

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

- [x] Reviewed the entitlements list and decided comps
- [x] Ran the reset (or a chosen subset)
- [ ] In Stripe **test** mode: delete/stop the test clock and its rig customers (cosmetic, but tidy)
- [x] Applied `20260721120000_pro_trials_and_reclaim.sql` (michi trials + binder reclaim) and
      enabled its nightly `pg_cron` job — this was deliberately held back until after the cleanup
      above so no test-mode entitlement could hand out a trial or trip the reclaim grace

> Note: even if you skip `billing_customers` cleanup, it self-heals — the webhook upserts the new
> live customer id on first live checkout (`on conflict user_id`). But "Manage billing" would error
> for a stale-mapped user until they re-subscribe, so cleaning is safer.

---

## 6. Flip each app on (last) — ⚠️ SEE THE BANNER: no action was needed

> Both apps already baked `EXPO_PUBLIC_CHECKOUT_OPEN=1` into their `vercel.json` `buildCommand`,
> so this section's premise was wrong — there was no separate front-end flip and no way to
> stagger the two apps. Kept below for the return-origin notes and for the (real) mechanics if
> checkout ever needs closing again.


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
- [x] `npx tsc --noEmit` clean
- [x] `npm test` green (the billing maths — 31 assertions)
- [x] `npm run lint` — clean of errors (3 unrelated warnings remain; the old `ColorPicker.tsx`
      `react-hooks/refs` errors were cleared 2026-07-20 by moving its Animated.Value to lazy state)
- [x] `npx expo export -p web` succeeds (proves the shared-module `.ts` imports bundle)

**Post-flip, live smoke test (real card, then refund) — RAN 2026-07-22 on michi:**
- [x] Boot-check the live functions resolve: an unauthed POST to `payments-webhook` returns
      `400 bad signature` (not a 500); a publishable-key POST to `stripe-checkout` returns
      `401 not signed in`. A 500 means a secret or import is wrong.
- [x] One real PRO yearly checkout → entitlement lands within seconds, plan page shows PRO
- [x] One real upgrade PRO→VIP → invoice equals the quoted whole-month price to the cent
      ($60.00, charged in-app without a second Checkout — see the banner)
- [x] "Manage billing" opens the live portal
- [x] Cancel → subscription shows cancel-at-period-end, access holds to term end
- [ ] Refund the smoke-test charges in the live dashboard
- [ ] **The same pass on tcgscan** — buy TCGScan PRO, upgrade PRO→VIP, cancel. Never run.

**Not covered by any smoke test yet:** the over-cap reclaim path in either app (it needs a lapsed
subscription plus a real over-cap account), and tcgscan's archive behaviour **across two devices**,
which is the step that actually proves the sync half of the design.

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

- **Cross-app bundle** — DONE. Live coupon `Si93JqYS` (**60% off**) is set as
  `STRIPE_BUNDLE_COUPON`, and the live catalog carries all four `tcgscan_*` prices. The offer has a
  standing home on michi's `/subscriptions` (not just a one-time post-checkout banner), and the CTA
  now hands the member to **tcgscan's plans page with the coupon armed** so they choose PRO or VIP
  themselves, rather than dropping them into a pre-picked checkout. See `docs/SYNERGY.md`.
- **Cross-interval changes** (monthly↔yearly) and **downgrades** are intentionally routed to the
  portal, not `change_plan`. Monthly plans are otherwise **untested** — no monthly customer has
  been driven through checkout, window slicing, or the cross-interval refusal.
- **The upgrade path is now identical in both apps.** `stripe-checkout` v24 is app-family-generic:
  it derives the family from the lookup key, so TCGScan PRO→VIP runs the same preview → confirm →
  server-driven `change_plan` flow michi does. Before v24 that path did not exist on the tcgscan
  side at all. One thing to keep in mind when reading the function: a bundle customer has **two
  subscriptions on one Stripe customer**, so anything that resolves "the current subscription"
  must filter by app family first.
- **`ColorPicker.tsx` lint errors** — RESOLVED 2026-07-20 (Animated.Value moved to lazy state).
  `npm run lint` is now error-clean (3 unrelated warnings remain).
