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
- **Print gate:** `PrintPlaceholdersSheet` now unlocks for PRO/VIP **or** grandfathered
  `pdf_print` (live, not flag-gated — only ever adds access).
- **Limit enforcement (dormant):** `useBinders()` exposes `tier` / `limits` / `binderCount` /
  `atBinderLimit` / `pageLimitReached`; guards live in the store (`createBinder` paths via UI
  pre-check, `duplicateBinder` + `addPage` internally) and surface `UpgradePerk` / toasts.
  All no-ops while `LIMITS_ENFORCED` is false.

**Not done (next):** provider decision + checkout/webhook (step 3), composer **monthly-usage
metering** (the quota needs a usage counter — table or RPC — not yet built; the limit number
exists but isn't enforced), art-upload/CSV/sharing gates, and pricing/upgrade UI (step 5, pairs
with LANDING-PAGE.md). Owner still to sign off on the strawman numbers before flipping the flag.

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
  grants are service-role only (manual SQL today, webhook later). First product: `pdf_print`
  (currently a lifetime unlock gating the fill-sheet Download button).
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
--   'pdf_print' (lifetime full-print unlock — GRANDFATHERED; existing holders keep it)
--   'pdf_sample' (one-time; consider a per-binder variant later)
--   'pdf_binder:<binderId>' (one-time full PDF for one binder)
```

A `tier()` helper resolves the user's effective tier: vip > pro > (signed-in) free > guest.
Client: extend the hook family with `useTier()` reading all rows once. Keep the server-side
"no client writes" invariant; renewals/cancellations land via provider webhooks updating
`expires_at`.

## Tier matrix (owner-revised 2026-07-16; mirrors `src/data/tiers.ts` TIER_LIMITS)

Guest is NOT an advertised plan — it's the pre-sign-in taste (1 binder, 6 pages) and the
prompt beyond it is SignInPerk ("sign in, free"), never an upgrade pitch. The comparison
sheet shows Free / PRO / VIP only.

Page counts below are DOUBLE-SIDED sheets (marketing language); the app counts sides, so
"20 double-sided pages" = `pagesPerBinder: 40` in tiers.ts.

| Capability | Guest (unadvertised) | Free (signed in) | PRO | VIP |
| --- | --- | --- | --- | --- |
| Binders | 1 | 3 | 12 | unlimited |
| Pages per binder | 6 sides | 20 double-sided | 20 double-sided | unlimited |
| Card capacity (4×4) | ~96 | up to 1,920 | over 7,500 | unlimited |
| Catalog browse/search | server search | full catalog | full | full |
| ✨ Similarity matching + composer methods | — | INCLUDED (no quota) | INCLUDED + upgraded composers (coming soon) | INCLUDED + upgraded composers (coming soon) |
| Slice Studio | ✓ | ✓ | ✓ | ✓ |
| Art uploads kept (at a time) | — | 10 | 100 | unlimited |
| Build from cards you really own (TCGScan sync) + binder progress | — | INCLUDED | INCLUDED | INCLUDED |
| Fill-sheet PDF | — | example-sheet preview only | full binders, 1 print/mo included | full binders, 5 prints/mo included + first in line for print extras |
| Public sharing / likes | view only | view only | share + like | share + like + featured eligibility boost |

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

"Included prints per month" is the one remaining metered quantity and needs a usage counter —
until that exists, `fullPrint` alone gates the Download button for PRO/VIP.

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
4. Grandfather clause: existing `pdf_print` holders (incl. the owner + test account) keep
   full print forever.
5. Pricing/upgrade UI (pairs with LANDING-PAGE.md).

## Verify

Test account `composer.test.…@example.com` exists with a `pdf_print` grant — use SQL to
flip its tier rows and drive each gate through the UI (locked note → grant → unlocked),
same pattern as the original entitlement verification.
