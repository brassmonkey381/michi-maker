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
- **One-time purchases** stay possible alongside subscriptions: a cheap **PDF print sample**
  (e.g. one page of one binder) and a **full-binder PDF** at a higher one-time fee for
  people who won't subscribe.

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

## Suggested tier matrix (STRAWMAN — get owner sign-off on numbers before shipping)

| Capability | Guest | Free (signed in) | PRO | VIP |
| --- | --- | --- | --- | --- |
| Binders | 3 | 10 | 50 | unlimited |
| Pages per binder | 10 | 20 | 50 | unlimited |
| Catalog browse/search | server search | full catalog | full | full |
| ✨ Composer / auto-fill | — | 5 pages/mo | unlimited | unlimited |
| Slice Studio | ✓ | ✓ | ✓ | ✓ |
| Art uploads | — | 20 | 500 | unlimited |
| My Collection sync (tcgscan) | — | ✓ | ✓ | ✓ |
| CSV import | — | 1 portfolio | unlimited | unlimited |
| Fill-sheet PDF | — | sample page w/ watermark | full binders | full + priority features |
| Public sharing / likes | view only | ✓ | ✓ | ✓ + featured eligibility boost? |

Pricing strawman: PRO $4.99/mo or $39/yr; VIP $9.99/mo or $79/yr; sample PDF $1.99;
full-binder one-time $6.99. (Owner sets real numbers in the provider dashboard — the app
never hardcodes price; fetch or link to a pricing page.)

## Enforcement points (where limits plug in)

- Binder/page counts: `src/store/binders.tsx` `createBinder` / `addPage` / `duplicateBinder`
  — return a refusal the UI turns into an upgrade note (reuse the `SignInPerk` pattern with
  an "Upgrade" variant component).
- Composer: `AutoFillSheet` entry point.
- Print: `PrintPlaceholdersSheet` — replace the boolean `pdf_print` gate with tier logic +
  the sample/one-time paths. **Sample = first sheet only + a diagonal watermark** (the PDF
  engine `src/data/placeholderPdf.ts` makes this easy — cap `packTiles` output and stamp
  text). Keep the counts preview free as the teaser (existing pattern).
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
