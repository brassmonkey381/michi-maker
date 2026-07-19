# Monetization — Free / PRO / VIP tiers + print gating

## STATUS — foundation SHIPPED (2026-07-15)

Steps 1, 2 (dormant), and 4 below are done and on `main`:

- **Schema:** `20260715130000_entitlement_terms.sql` adds `expires_at` (NULL = lifetime) +
  documents the product vocabulary. **Must be applied to the live DB** (piikwvntldytjejxmcla)
  before subscription rows are written — the client reads defensively (`select('*')`) so it
  can't regress print if the column isn't there yet, but subscription terms need the column.
- **Config:** `src/data/tiers.ts` — `Tier`, `PRODUCTS`, `TIER_LIMITS` (the strawman numbers),
  `resolveTier` / `hasFullPrint` / `limitsForTier`, and the master switch
  **`LIMITS_ENFORCED = false`** (permissive until pricing is live).
- **Hook:** `src/hooks/use-tier.ts` — `useTier()` → `{ tier, limits, hasFullPrint, isPaid,
  loading, refresh }`.
- **Upgrade note:** `src/components/monetization/UpgradePerk.tsx` (SignInPerk sibling; honest
  "coming soon" since checkout isn't wired).
- **Print gate:** `PrintPlaceholdersSheet` unlocks printing your own binder for PRO/VIP **or** a
  per-binder `pdf_binder:<id>` purchase (live, not flag-gated — only ever adds access). No lifetime
  all-binder unlock and no grandfathering. Non-payers get a free short example PDF as the teaser.
- **Limit enforcement (dormant):** `useBinders()` exposes `tier` / `limits` / `binderCount` /
  `atBinderLimit` / `pageLimitReached`; guards live in the store (`createBinder` paths via UI
  pre-check, `duplicateBinder` + `addPage` internally) and surface `UpgradePerk` / toasts.
  All no-ops while `LIMITS_ENFORCED` is false.

**Also shipped (2026-07-16):** the public plan page at **`/subscriptions`** (renamed from
/pricing, which now redirects) — the approved comparison-sheet layout (PlanComparison component,
data in `src/data/subscriptions.ts`), plus **usage meters** on the Your-plan section: binders,
artworks kept (live `saved_slices` count), and included prints used this month (new
`print_events` ledger, migration `20260716220000_print_events.sql`, recorded on every fill-sheet
download — advisory, client-reported).

**Also shipped (2026-07-19): billing interval + the annual print pool.** The ledger now records
HOW a subscription is billed and WHEN its term started, and yearly subscribers can release the
whole year's prints at once. See **docs/PAYMENTS.md → Included prints & the annual pool** for the
full rules; the short version:

- **Schema** `20260719120000_billing_interval_and_print_pool.sql` — `entitlements.interval`
  (`'month'`/`'year'`) + `entitlements.period_start`, plus the `print_pool_unlocks` table.
  **APPLIED to the live DB (piikwvntldytjejxmcla) 2026-07-19**, webhook redeployed (v9). Reads are
  defensive anyway, so a environment without it degrades to calendar-month metering.
- **Backfill:** the one pre-existing Stripe subscription row (bstockman1@hotmail.com, `tier_pro`)
  was written before the columns existed, so it was backfilled from the live Stripe subscription
  `sub_1Tu6tIH8KZaf7tNOSSNOBEFi` (`michi_pro_yearly`, `recurring.interval='year'`,
  `current_period_start=1784275982` → 2026-07-17 08:13:02Z) rather than inferred from `expires_at`.
  **Any future subscription row created before this migration needs the same treatment** — a NULL
  interval otherwise persists until the next webhook event, which for a yearly plan is a year away.
- **RLS verified live** (impersonated JWTs, all state restored afterwards): non-yearly grant
  rejected · mismatched `period_start` rejected · no-print-this-term rejected · eligible yearly
  subscriber accepted · and the user could neither UPDATE nor DELETE the unlock row (0 rows each),
  so irreversibility holds in production, not just by intent.
- **Webhook** writes both columns from the Stripe PRICE's `recurring.interval` and the
  subscription's `current_period_start` — the lookup-key `_yearly` suffix is a naming convention,
  not a source of truth.
- **Windowing** `src/data/printWindow.ts` — the included-print meter now counts over the real
  billing term (sliced monthly from the anniversary), fixing a calendar-month bug that gave anyone
  subscribing on the 28th two allocations in four days.
- **The pool** — a yearly PRO gets 12, a yearly VIP 36 (VIP cut 5→3/mo, owner 2026-07-19),
  released on an explicit confirm. Mid-term upgrades are PRORATED via `term_print_allocation`.
  **Irreversible for the term** and resets at renewal (enforced by schema shape, not code), and
  gated on having spent at least one included print in the term (owner decision: proof the user
  actually used the feature before we hand over a year of it).
- **Surfaces** — the plan section (`PlanUsageSection`, primary home) and the print sheet's
  out-of-credits box, both through the shared `usePrintAllowance` hook so the meter and the print
  button can never disagree. Month-to-month subscribers get one yearly-billing line, not a nag.

**Not done (next):** provider decision + checkout/webhook (step 3) — the /subscriptions CTAs
reveal the honest coming-soon note until `CHECKOUT_OPEN` flips; included-prints ENFORCEMENT
(ledger + meter + windowing exist, nothing blocks past the allocation yet); art-upload/sharing
gates. Also open: **plan CHANGES have no mechanism** — Checkout would start a second subscription
(now 409-blocked) and this Stripe account has no Customer Portal configuration at all, which also
means today's "Manage billing" link would fail. Needs a portal config with `subscription_update`
enabled, or a server-side `subscriptions.update()` with proration.

## Goal

Evolve the current single one-time unlock into a tier system:

- **Free** — full core experience with limits; a taste of print.
- **PRO** — monthly subscription (or discounted yearly), higher limits, full print access.
- **VIP** — top tier, effectively unlimited + future perks (early features, print-on-demand
  discounts when that ships).
- **One-time purchases** stay possible alongside subscriptions: a **full-binder fill-sheet
  PDF** ($3.99) for people who won't subscribe. No paid sample — the teaser is a free
  premade EXAMPLE sheet (our cards, not the user's binder).

Owner's stated preferences: monthly subscription models, or a full year at a discount.

## What already exists (build on it, don't replace)

- **`entitlements` table** (migration `20260715120000_entitlements.sql`): PK (user_id,
  product), `source`, `granted_at`. Owner-only SELECT via RLS; **no client write policies** —
  grants are service-role only (manual SQL today, webhook later). Print products are the PRO/VIP
  subscriptions (`tier_pro`/`tier_vip`) and the per-binder `pdf_binder:<id>` one-time purchase.
- **`useEntitlement(product)`** hook (`src/hooks/use-entitlement.ts`): resolved answer keyed
  to the uid it was fetched for; `refresh()` for post-checkout polling.
- **`docs/PAYMENTS.md`**: manual grant SQL + the webhook-slot design (checkout carries the
  Supabase user id; signature-verified webhook edge function inserts idempotently).
- Payment provider is **still undecided** (Stripe vs Lemon Squeezy — LS is merchant of
  record, simpler taxes, higher fees). Confirm with the owner before wiring checkout.
- Existing gates elsewhere: catalog features are signed-in-only ("guest tier" already
  exists conceptually — see `useCatalog().guestGated` + `SignInPerk`); the rule is ALWAYS
  show an inline "sign in / upgrade to use this" note, never a silent no-op or dead spinner.

## Schema direction

Subscriptions need expiry; the entitlements table is grant-shaped, not term-shaped. Suggested:

```sql
-- add term support to entitlements (backwards compatible: null = lifetime)
alter table public.entitlements add column expires_at timestamptz; -- null = never
-- product keys become a small vocabulary:
--   'tier_pro'  (subscription, expires_at set per period, renewed by webhook)
--   'tier_vip'  (subscription)
--   'pdf_binder:<binderId>' (one-time full PDF for one binder — the only one-time print product;
--                            no lifetime all-binder unlock, no grandfathering. A SNAPSHOT license:
--                            covers the binder as spent, forever; edits need a new purchase — see
--                            src/data/pdfSnapshot.ts)
```

A `tier()` helper resolves the user's effective tier: vip > pro > (signed-in) free > guest.
Client: extend the hook family with `useTier()` reading all rows once. Keep the server-side
"no client writes" invariant; renewals/cancellations land via provider webhooks updating
`expires_at`.

## Tier matrix (owner-revised 2026-07-17; mirrors `src/data/tiers.ts` TIER_LIMITS)

Guest is NOT an advertised plan — it's the pre-sign-in taste (1 binder, 6 pages) and the
prompt beyond it is SignInPerk ("sign in, free"), never an upgrade pitch. The comparison
sheet shows Free / PRO / VIP only. Page counts are plain APP pages (no double-sided language).

| Capability | Guest (unadvertised) | Free (signed in) | PRO | VIP |
| --- | --- | --- | --- | --- |
| Binders | 1 | 3 | 12 | unlimited |
| Pages per binder | 6 | 16 | 40 | unlimited |
| Card capacity (4×4) | ~96 | over 750 | over 7,500 | unlimited |
| Catalog browse/search | server search | full catalog | full | full |
| ✨ Similarity matching + composer methods | — | INCLUDED (no quota) | INCLUDED + upgraded composers (coming soon) | INCLUDED + upgraded composers (coming soon) |
| Slice Studio | ✓ | ✓ | ✓ | ✓ |
| Slice Studio artworks kept (at a time) | — | 100 | 1,000 | unlimited |
| Build from cards you really own (TCGScan sync) | — | ✓ | ✓ + TCGScan bundle discounts | ✓ + TCGScan bundle discounts |
| Fill-sheet PDF | — | example-sheet preview only | full binders, 1 print/mo included | full binders, 3 prints/mo included + first in line for print extras |
| Public sharing / likes | view only | share + like | share + like | share + like + featured eligibility boost |

`LIMITS_ENFORCED` is now ENV-DRIVEN (`EXPO_PUBLIC_LIMITS_ENFORCED=1`) — on locally for gate
testing, set in Vercel at go-live. Every user-facing TCGScan mention links to
https://tcgscan.ai/welcome (TcgscanLink / TCGSCAN_URL).

Owner decisions 2026-07-16 (sheet draft v4): the composer monthly QUOTA is dropped — similarity
matching + composer methods are included at every signed-in tier, and PRO/VIP differentiate via
UPGRADED binder composers when those ship. CSV import is off the comparison sheet entirely (it's
a TCGScan-side concern). The real-collection row is a HIGHLIGHTED all-tier item and cross-sells
the TCGScan partner app (inventory tracking, set analytics, historical price history) — see
docs/SYNERGY.md for the cross-app entitlement (`tcgscan_pro`).

Pricing (owner-set 2026-07-16): PRO $3.99/mo or **$39.99/yr (most popular)**; VIP $9.99/mo
or **$99.99/yr (best value)**; one-time full-binder fill-sheet PDF $3.99. There is NO paid
sample PDF — the free preview is a premade EXAMPLE sheet (our cards, not theirs), not a
watermarked page of their binder. (Prices still live in the provider dashboard — the app
never hardcodes price; fetch or link to a pricing page.)

"Included prints per month" is the one remaining metered quantity. The counter and the window
resolution both exist now (`print_events` + `src/data/printWindow.ts`), and yearly subscribers can
release the full year at once — but nothing BLOCKS past the allocation yet, so `fullPrint` alone
still gates the Download button for PRO/VIP.

## Enforcement points (where limits plug in)

- Binder/page counts: `src/store/binders.tsx` `createBinder` / `addPage` / `duplicateBinder`
  — return a refusal the UI turns into an upgrade note (reuse the `SignInPerk` pattern with
  an "Upgrade" variant component).
- Composer: no gate — included at every signed-in tier (quota dropped 2026-07-16). The future
  UPGRADED composers gate at their own entry points when they ship.
- Print: `PrintPlaceholdersSheet` — tier logic (done) + the one-time per-binder path.
  The free teaser = counts preview (existing) + a premade EXAMPLE sheet PDF (static asset,
  our cards — no watermarking of the user's binder needed).
- Server-side backstop for the things that matter (binder count) via RLS-adjacent checks or
  a trigger — client limits alone are advisory.

## Sequencing

1. Schema (`expires_at`, product vocabulary) + `useTier()` + upgrade-note component.
2. Enforce limits (behind a feature flag defaulting to permissive until pricing is live).
3. Provider decision → checkout page + webhook edge function (`supabase/functions/`,
   pattern documented in `docs/PAYMENTS.md`; `art-proxy/index.ts` is a working edge-fn
   example incl. the tsconfig exclusion for Deno).
4. No grandfathering: printing your own binder is only a PRO/VIP subscription perk or a per-binder
   `pdf_binder:<id>` purchase; there is no lifetime all-binder unlock.
5. Pricing/upgrade UI (pairs with LANDING-PAGE.md).

## Verify

Test account `composer.test.…@example.com` — use SQL to grant/revoke a `tier_pro` row or a
`pdf_binder:<id>` row and drive each gate through the UI (locked note + free example → grant →
unlocked), same pattern as the original entitlement verification.

**Annual pool** (needs `EXPO_PUBLIC_LIMITS_ENFORCED=1`, or the allocation is Infinity and no
pool language renders at all). Grant a yearly tier with `interval`/`period_start` set (SQL in
docs/PAYMENTS.md), then walk the four states on /subscriptions and in the print sheet:

1. **needsFirstPrint** — fresh term, no prints. Both surfaces say "use one first"; no unlock
   control anywhere. Confirm a hand-written `insert into print_pool_unlocks` is REJECTED by RLS.
2. **available** — take one included print, reload. The unlock link appears on the plan page and
   the print sheet's out-of-credits box leads with the pool, not the $3.99 buy.
3. **unlocked** — confirm. The meter flips to "used this year" out of 12 (PRO) / 60 (VIP), and the
   print button reads "N of 60 left this year". Reload to confirm it survives.
4. **reset** — push `period_start` forward a year in SQL. The pool offer returns to
   needsFirstPrint with no unlock row, and the meter is back to the monthly slice.

Also check a MONTHLY grant shows the one-line yearly nudge and never an unlock control, and that
a manual grant with NULL `interval`/`period_start` still meters on the calendar month.
