# Cross-app synergy & pricing (michi-maker ⇄ tcgscan)

**Canonical doc.** tcgscan-app links here (`tcgscan-app/docs/SYNERGY.md`).

## What we charge, as of 2026-09-21

Verified against the live Stripe catalog on that date. These nine lookup keys are the entire
`SELLABLE` set in `stripe-checkout/index.ts`; anything not on this list is refused with
`400 unknown product`.

| what | lookup key | price |
| --- | --- | --- |
| michi-maker PRO | `michi_pro_monthly` / `michi_pro_yearly` | $5.99/mo · $49.99/yr |
| TCGScan Pro | `tcgscan_pro_monthly` / `tcgscan_pro_yearly` | $5.99/mo · $49.99/yr |
| Both apps, one subscription | `bundle_pro_monthly` / `bundle_pro_yearly` | $8.99/mo · $74.99/yr |
| Founder — lifetime PRO, one payment | `michi_pro_founder` / `tcgscan_pro_founder` | $119.99 once |
| One binder's print-ready PDF | `michi_binder_pdf` | $1.99 once |

**VIP is retired.** It is out of `SELLABLE` in both apps and has no column on either plans page.
michi-maker's VIP product is still *active* in Stripe for one reason only: a single legacy
subscription renews against it. TCGScan's is archived. A `tier_vip` / `tcgscan_vip` row that still
exists reads as PRO everywhere.

**PRO is unlimited**, not 12-of-anything: the 2026-09 rework set `tier_caps` to NULL for binders,
pages per binder, Slice Studio artworks, collections and cards per collection. **No plan includes
a print** — `includedPrintsPerMonth` is 0 on every tier and a PDF is $1.99 a binder regardless of
plan. The live table is the only authority; `npm run check:caps` in each app pins the client
mirrors to it and `deploy-web.ps1` gates on it.

## The shape: two apps, one account, one ledger

michi-maker (aesthetic/printable binders) and tcgscan (scan → ROI, price tracking, analysis) sell
to two different buyers — a **curator** and a **trader**. We keep them as **separate front-ends**
so each has its own landing page, onboarding, IA, and pricing story, and neither ships the other's
weight (tcgscan's ~45 MB tfjs/WebGL scanner has no business in a "pretty binders" bundle).

What we **do** unify is the layer underneath: a **shared Supabase account** and a **shared
`entitlements` ledger** (both in michi's app project `piikwvntldytjejxmcla`). That's the lever that
makes the synergy real without merging the apps:

- Each app reads the **other's** Pro grant → cross-unlocks and a bundle cross-sell.
- One identity → a user's collection (scanned in tcgscan) is the same collection michi builds
  binders from (shared `user_cards` — see the portfolio integration doc).

**Don't merge the webapps. Unify billing/entitlements, not the UI.**

## Entitlements = the single source of truth

`public.entitlements(user_id, product, granted_at, source, expires_at)` — owner-only SELECT via
RLS, **no client writes** (grants come from each app's payment webhook / manual SQL). `product` is
free text, so adding one is a code change, not a migration. Vocabulary (documented in
`supabase/migrations/20260715120000_entitlements.sql`, `..._entitlement_terms.sql`, and
`20260716210000_cross_app_products.sql`):

| product | sold by | what it unlocks |
| --- | --- | --- |
| `tier_pro` / `tier_vip` | michi | michi PRO/VIP (resolved to a `Tier` in `src/data/tiers.ts`) |
| `pdf_binder:<id>` | michi | one-time single-binder print unlock (no lifetime/grandfathered unlock) |
| `tcgscan_pro` | **tcgscan** | TCGScan Pro — ROI, price history, analytics. Written here so michi can read it. |
| `tcgscan_vip` | **tcgscan** | TCGScan VIP — unmetered scans, predictive insights, premium reveal themes |

A grant is **active** while `expires_at` is NULL (lifetime) or in the future. Michi resolves a
*tier* only from its own products; `tcgscan_pro` is checked directly via `hasTcgscanPro()`.

**A TCGScan VIP gets both rows** (`tcgscan_vip` *and* `tcgscan_pro`). That redundancy is
deliberate: every `hasTcgscanPro()` check already written in either repo keeps working without a
coordinated cross-repo change, which is exactly the kind of coupling you do not want on go-live
day. tcgscan's own `resolveTier` checks VIP first.

## Directionality is per feature

Each app owns a map of feature → required product, so a feature can require the **other** app's
product. Both directions are live:

| feature | app | unlocked by | direction |
| --- | --- | --- | --- |
| Build-a-binder **from your collection** (`BuildBinderSheet`) | michi | `tcgscan_pro` | scan → michi |
| Unlimited price history, ROI & portfolio analytics | tcgscan | `tcgscan_pro` | tcgscan → tcgscan |
| Full print, higher binder/page limits | michi | `tier_pro`/`tier_vip` | michi → michi |

The flagship bridge is **"binder from your collection"** — it needs *both* halves (real collection
data from scanning + michi's binder builder), so it's the natural cross-app upsell.

## Bundle cross-sell — RETIRED 2026-09. Replaced by the two-app bundle PRODUCT.

> **This whole section is history, kept because the reasoning still applies to any future
> cross-app offer.** `CROSS_DISCOUNT_RETIRED = true` in `stripe-checkout/index.ts` and in both
> apps' client code, so the coupon is refused server-side, both `<BundleOffer/>` components return
> `null` on their first line, and every banner described below is gated off. AGENTS.md names this
> file the canonical pricing doc, and it was still presenting the discount as live — with the
> coupon id — three weeks after the code stopped honouring it.
>
> **What replaced it:** one subscription that grants PRO in BOTH apps, sold as its own product at
> `$74.99/year` or `$8.99/month` (lookup keys `bundle_pro_yearly` / `bundle_pro_monthly`). It is a
> product with a price, not a discount on another plan, so none of the term-matching rules below
> apply to it. See `docs/TIER-REWORK.md`.

Holding one app's plan surfaced a **discounted add-on** of the other. Live Stripe coupon
`Si93JqYS` (60% off, `duration: once`), set as `STRIPE_BUNDLE_COUPON`; the discount was enforced
**server-side** in `stripe-checkout` (`bundleQualifies` re-checked the entitlement ledger — the
client asking for `bundle: true` proved nothing).

**The TERM must match; the TIER need not** (owner call 2026-07-28, `src/data/bundle.ts`):

| you hold | you can discount |
| --- | --- |
| a **yearly** sibling plan | yearly **or** monthly |
| a **monthly** sibling plan | monthly only |
| a manual/comp grant (no Stripe interval) | monthly only |
| **a trial** | **nothing — decided 2026-08-10, see below** |

Until then it was enough to hold *any* active sibling entitlement, which let a **$3.99** tcgscan
PRO monthly buy michi VIP **yearly** for $40 instead of $99.99 — a $59.99 discount off a $3.99
ticket, ~15x the entry price, and the same trick in both directions. A free 14-day trial did it
for $0. `duration: once` meant one shot rather than a permanent repricing, but one shot is the
whole margin on that sale. Pinned by `src/data/bundle.test.ts`.

- michi PRO/VIP **and not** `tcgscan_pro` → michi's `<BundleOffer/>`
  (`src/components/monetization/BundleOffer.tsx`), on Settings, in the post-checkout modal, **and
  standing on `/subscriptions`** for as long as the coupon is active.
- `tcgscan_pro` **and not** michi Pro → tcgscan's `<BundleOffer/>` (`src/components/cross-app.tsx`).

**The CTA hands over to the sibling's plans page, not into a checkout.** michi's offer opens
`tcgscan.ai/plans?bundle=1` with the coupon armed so the member chooses PRO or VIP for themselves;
pre-picking a tier skipped the comparison they were about to make. That page carries a
"← Go to TCGScan" link so a `?bundle=1` arrival isn't stranded without a route to the landing page.

## Cross-app SSO handoff (magic-link token hash)

A member following the bundle offer arrives at the sibling app **already signed in**, on the same
account. Mechanism: the `auth-handoff` edge function (`verify_jwt: true`) mints a one-time
magic-link token hash for **the caller's own non-guest account**, which is appended to the
destination URL and redeemed there via `verifyOtp`.

- Client helpers are **mirrors — keep them in sync**: michi `src/data/handoff.ts`, tcgscan
  `src/lib/handoff.ts` (`mintHandoffHash` / `withHandoffHash` / `redeemHandoffHashFromLocation`).
- The hash rides in the URL **fragment**, which never reaches a server.
- Guests are refused — a guest handoff would hand over an anonymous identity that the sibling app
  can't usefully adopt.
- **The sign-in button is the fallback, not a fallback of last resort.** The plans page still says
  "Arriving from michi-maker? Sign in with the same account…" and works fully if the handoff
  doesn't fire. Verified working across two real accounts.

See `docs/AUTH.md → Cross-app SSO handoff` for the auth-side detail.

## Both apps enforce (this bites now)

Both flags are **on** in the deployed builds — `LIMITS_ENFORCED` (michi, `src/data/tiers.ts`) and
`FEATURES_ENFORCED` / `LIMITS_ENFORCED` (tcgscan, `src/lib/entitlements.ts`). Caps and feature
locks are real for real users.

Because enforcement is real, both apps also share the **downgrade** story: a 14-day no-card PRO
trial, a warned 3-day grace, a keep-picker, and soft-archive of the excess (binders in michi,
collections in tcgscan), with auto-restore when the cap rises again. One design, two nouns — see
`docs/PRO-TRIALS.md`, whose last section covers the tcgscan port and the local-first sync trap it
had to avoid.

## Comping an account (manual grants)

Checkout is live, so this is for comps and support rather than demos. Grant as service role:

```sql
select id, email from auth.users where email = 'you@example.com';

-- grant TCGScan Pro for a month (unlocks the michi collection-binder + hides tcgscan's ProPerk,
-- and surfaces the "add Michi Pro" bundle offer in tcgscan)
insert into public.entitlements (user_id, product, source, expires_at)
values ('<uid>', 'tcgscan_pro', 'manual', now() + interval '1 month')
on conflict (user_id, product) do update set expires_at = excluded.expires_at;

-- grant michi PRO similarly ('tier_pro') to see michi's BundleOffer for TCGScan Pro
```

Clients re-read per identity/mount (`useTier().refresh()` / `useEntitlements().refresh()`), so a
fresh grant shows up next time the surface opens — no deploy.

## Settled (all four former open decisions)

1. **Provider: Stripe**, one account, one customer per user — which is what lets the bundle coupon
   key off an existing entitlement. ⚠️ A bundle customer therefore has **two subscriptions on one
   Stripe customer**; anything resolving "the current subscription" must filter by **app family**
   first. `stripe-checkout` v24 derives the family from the lookup key for exactly this reason.
2. **Discount: 60% off the second app**, evergreen while the coupon is active, applied as a Stripe
   coupon at checkout.
3. **Free-tier boundary**: settled per app — `TIER_LIMITS` in michi, the cap matrix in
   `tcgscan-app/docs/MONETIZATION-TIERS.md`.
4. **Enforcement**: both flags on, in production.

## Still open

- **tcgscan has never had a real-card smoke test** — its checkout, upgrade, and reclaim paths went
  live on code parity with michi, not on an exercised live purchase.
- **Should tcgscan VIP earn a deeper michi discount than tcgscan PRO does** (and vice versa)?
  Today the bundle is one flat 60% regardless of which TIER you hold — deliberately kept
  tier-agnostic on 2026-07-28 when the TERM was matched. Still open.
- ~~**Should a free trial earn the bundle discount at all?**~~ **DECIDED 2026-08-10: no, nowhere.**
  Term-matching had already stopped a trial unlocking a yearly plan, but a live trial still earned
  60% off a MONTHLY sibling plan having paid nothing. The bundle is a thank-you for paying, so it
  now requires a real subscription. Excluded on `source === 'trial'`, NOT on the null interval —
  manual/comp grants also have a null interval and stay eligible, because a comp is a deliberate
  gift from us rather than someone helping themselves. Enforced in `bundleQualifies` and in the
  `stripe-checkout` select (which had to start fetching `source` — without it every row reads
  undefined and the hole reopens silently), and mirrored on both plans pages so the advertised
  price matches what checkout charges. Pinned by `src/data/bundle.test.ts`.
