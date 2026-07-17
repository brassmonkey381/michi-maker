# Cross-app synergy & pricing (michi-maker ⇄ tcgscan)

**Canonical doc.** tcgscan-app links here (`tcgscan-app/docs/SYNERGY.md`).

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

A grant is **active** while `expires_at` is NULL (lifetime) or in the future. Michi resolves a
*tier* only from its own products; `tcgscan_pro` is checked directly via `hasTcgscanPro()`.

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

## Bundle cross-sell (bidirectional)

Holding one Pro surfaces a **discounted add-on** of the other:

- michi PRO/VIP **and not** `tcgscan_pro` → `<BundleOffer/>` (michi `src/components/monetization/BundleOffer.tsx`) offers TCGScan Pro at a launch discount → opens `idontgitit.com`.
- `tcgscan_pro` **and not** michi Pro → tcgscan's `<BundleOffer/>` (`src/components/cross-app.tsx`) offers Michi Pro at a discount → opens `michi-maker.com`.

The *discount* itself is enforced at checkout (a coupon/price in the payment provider, keyed off
the existing entitlement) — not in app code. Until checkout is wired, the buttons open the sibling
app rather than a purchase flow.

## Nothing bites yet (reversible by design)

Both apps gate **behind a flag that's currently off**, so wiring gates now changes nothing for
current users:

- michi: `LIMITS_ENFORCED = false` (`src/data/tiers.ts`).
- tcgscan: `FEATURES_ENFORCED = false` (`src/lib/entitlements.ts`).

While off, every gated feature reads as allowed; only the **CTAs** render (and they only ever add
an offer). The synergy note on `BuildBinderSheet` is likewise non-blocking. Flip the flags only
once checkout is live and pricing is signed off.

## Demoing the flow today (manual grants)

Checkout isn't wired (provider TBD — see `docs/PAYMENTS.md`). Grant as service role to see the
cross-app UI change:

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

## Open decisions

1. **Checkout provider** (Stripe / Lemon Squeezy) + one shared customer so the bundle coupon can
   key off an existing entitlement. One webhook per app upserts into this ledger (service role).
2. **Discount mechanics** — percentage, launch-only vs evergreen, and whether the add-on is
   monthly-discounted or a one-time coupon.
3. **Free-tier boundary** per app (which analytics/ROI features are the paywall in tcgscan; the
   `TIER_LIMITS` caps in michi).
4. **Enforcement** — flip `LIMITS_ENFORCED` / `FEATURES_ENFORCED` only after 1–3 are settled.
