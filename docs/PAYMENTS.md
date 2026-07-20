# Payments & entitlements

Paid features are gated by the `entitlements` table (`supabase/migrations/20260715120000_entitlements.sql`
+ `20260715130000_entitlement_terms.sql`): one row per `(user_id, product)`, owner-only SELECT
via RLS, **no client write policies** — a grant can only come from the service role. The client
resolves an effective **tier** from these rows with the `useTier()` hook and renders locked/
unlocked/upgrade UI accordingly. (`useEntitlement(product)` still exists for a single-product
boolean check, but tier-aware surfaces should prefer `useTier`.)

## Tiers & products

Tiers resolve from entitlement rows in `src/data/tiers.ts` (`resolveTier`): **vip > pro >
free (signed-in) > guest**. Subscriptions carry an `expires_at` term (NULL = lifetime); a row is
active while `expires_at` is NULL or in the future.

| product key | what it is / unlocks | notes |
| ----------- | -------------------- | ----- |
| `tier_pro`  | PRO subscription — full print (1 included print/mo) + higher limits | `expires_at` per period |
| `tier_vip`  | VIP subscription — unlimited + 3 included prints/mo + priority | `expires_at` per period |
| `pdf_binder:<id>` | one-time single-binder fill-sheet PDF ($3.99) — a **SNAPSHOT license**: the binder as it is when the purchase is spent (first download), re-downloadable forever; later edits need a new purchase | checked directly (`products.includes('pdf_binder:<id>')`); spend/fingerprint/archive in `src/data/pdfSnapshot.ts` + `binder_pdf_snapshots` + the `binder-pdfs` bucket; re-purchase re-arms via `granted_at` (webhook bumps it) |
| `tcgscan_pro` | **CROSS-APP** — TCGScan Pro (sold by the sibling app). Unlocks scan-powered michi features (Build-a-binder-from-your-collection) + drives the bundle cross-sell | read via `hasTcgscanPro()`; michi never resolves a tier from it. See **docs/SYNERGY.md** |

Subscription rows also carry **`interval`** (`'month'` | `'year'`) and **`period_start`**
(`20260719120000_billing_interval_and_print_pool.sql`), both written by the webhook from the
Stripe price and subscription. They exist because the ledger previously could not tell a yearly
subscriber from a monthly one (both lookup keys collapse to the same product), and because the
included-print meter needs the real billing term to count over. See **Included prints & the
annual pool** below.

Printing your OWN binder (`PrintPlaceholdersSheet` Download) is a **PRO/VIP subscription** perk
(subject to the included-print allocation) **or** a per-binder one-time purchase
(`pdf_binder:<id>`). There is **no lifetime all-binder unlock and no grandfathering** — prints are
only subscriptions or per-binder purchases. Non-payers get the counts preview plus a **free
example** — the curated 6-page sampler in `src/data/exampleFillSheetBinder.ts` (4 placeholder
pages + 2 art pages), which downloads as the same two files a real export produces — never their
own binders.

Every export is **two separate PDFs** (`buildFillSheetPdfs`): a plain-paper **placeholders** file
(card placeholders + inserts) and a matte-cardstock **art** file (the binder's art pieces), each
with its own cover. A section with no pieces is omitted (a card-only binder is one file). The
snapshot `sheets` count and the archived bytes stay TOTAL/first-file respectively; re-downloads
regenerate both files from the stored version content.

The per-binder purchase is a **snapshot license with version history**: the first download after
buying records the binder's content fingerprint and archives those exact PDF bytes as a purchased
VERSION (`binder_pdf_snapshots` row + `binder-pdfs` bucket, one archive per version). While the
binder matches any purchased version the PDF can be regenerated freely; after an edit the print
sheet lists **every purchased version for re-download (forever)** and printing the edited version
requires buying the binder again (the webhook bumps `granted_at`, which re-arms the spend) or a
plan. This is what stops edit → reprint → repeat turning one $3.99 unlock into unlimited prints,
while multi-buy users keep a picker of everything they've paid for.

### Included prints & the annual pool

PRO includes 1 full-binder print per period, VIP 3 (`tiers.ts includedPrintsPerMonth`). WHICH
period that is comes from `src/data/printWindow.ts` (`resolvePrintWindow`), which both the print
sheet and the plan meters read through so they can never quote different numbers:

| window | when | allocation |
| --- | --- | --- |
| `calendar` | no `period_start` (manual grant, lifetime unlock, pre-migration row) | monthly |
| `month` | any subscriber, sliced from the billing anniversary | monthly |
| `year` | yearly subscriber who unlocked their pool | `term_print_allocation` (PRO 12, VIP 36 on a full year) |

The `month` slice replaced a plain calendar-month count, which handed out two allocations in four
days to anyone who subscribed on the 28th. Slicing from `period_start` (rather than trusting it to
be current) also means a lagging renewal webhook can't strand someone on a stale window.

**The annual pool** lets a yearly subscriber release the whole term's prints at once instead of
one month at a time — they already paid for them. Two rules, both enforced by the INSERT policy on
`print_pool_unlocks`, not by client code:

1. **Yearly + active + exactly this term.** `interval = 'year'` on a live `tier_pro`/`tier_vip`
   row whose `period_start` matches the row being inserted.
2. **Spend one first.** At least one `print_events` row in the current term. Releasing a year of prints
   to an account that never printed anything is the chargeback shape we care about; requiring one
   real print first means every unlock follows actual use of the feature. Scoped to the term, so a
   renewal re-proves it with a print the user was going to take anyway.

It is **irreversible within a term** by construction: the table has no UPDATE or DELETE policies,
so there is no "re-lock" path (there is no honest answer to "what's my monthly allowance now?"
after someone has burned 8 of 12). Renewal writes a new `period_start`, which has no unlock row —
the pool resets to monthly release with no cleanup job.

**Mid-term upgrades are prorated** (`20260719160000_term_print_allocation.sql`). The pool total is
NOT `rate × 12` off the current tier — that let someone 11 months into PRO buy a ~$5 prorated VIP
upgrade and release a full VIP year. `entitlements.term_print_allocation`, written by the webhook,
holds the real figure:

```
allocation = oldRate × monthsElapsed + newRate × monthsRemaining
```

You keep your old rate for months already served and get the new rate for months still to come.
Upgrading to VIP yearly 8 months into a PRO year gives `1×8 + 3×4 = 20`, which is the owner's
framing (full PRO year 12, plus 4 months of VIP 12, minus the 4 PRO months replaced 4). A fresh
subscriber is the `monthsElapsed = 0` case, so the column is always populated for a yearly term.

The webhook recomputes ONLY on a real product change (an ACTIVE sibling tier on the same
`period_start`); otherwise it preserves the stored value, because `customer.subscription.updated`
fires for payment-method and dunning events too and recomputing would walk the allocation down as
`monthsElapsed` grows. NULL falls back to `rate × 12`.

Caveat to keep in mind: `print_events` is **client-reported**, so rule 2 proves intent, not
fulfilment. It is a friction gate, not a security boundary — the right weight while prints are
client-generated PDFs with near-zero marginal cost. Revisit if print-on-demand ships and a pool
unlock starts carrying real fulfilment liability.

Month-to-month subscribers have no pool; they get one line pointing at yearly billing
(`ANNUAL_POOL.monthlyUpsell`), not a recurring nag.

### Tier limits (caps) are behind a feature flag

`src/data/tiers.ts` also holds `TIER_LIMITS` (binder/page counts, composer quota, uploads) and a
**master switch `LIMITS_ENFORCED` (currently `false`)**. While off, every cap reads as unlimited,
so nothing new restricts users; the store already consults the limits (`useBinders().limits` /
`atBinderLimit` / `pageLimitReached`) and the UI shows an inline `UpgradePerk` note when a cap is
hit. Flip the switch to `true` **only after pricing/checkout is live and the numbers are signed
off**. The print unlock is independent of this switch (it only ever grants access).

## Granting manually (today's path)

Checkout isn't wired yet. To grant (or revoke) an unlock or a tier, run as service role
(SQL editor / MCP):

```sql
-- look up a user id by email
select id, email from auth.users where email = 'someone@example.com';

-- grant a per-binder print unlock (one-time; product key carries the binder id)
insert into public.entitlements (user_id, product, source)
values ('<auth user id>', 'pdf_binder:<binder id>', 'manual')
on conflict (user_id, product) do nothing;

-- grant a PRO tier for 1 month (subscriptions carry a term; NULL expires_at = lifetime)
insert into public.entitlements (user_id, product, source, expires_at)
values ('<auth user id>', 'tier_pro', 'manual', now() + interval '1 month')
on conflict (user_id, product) do update set expires_at = excluded.expires_at, source = excluded.source;

-- grant a YEARLY tier — set interval + period_start too, or the annual print pool can't be
-- offered and the print meter falls back to calendar months.
insert into public.entitlements (user_id, product, source, expires_at, interval, period_start)
values ('<auth user id>', 'tier_vip', 'manual', now() + interval '1 year', 'year', now())
on conflict (user_id, product) do update
  set expires_at = excluded.expires_at, source = excluded.source,
      interval = excluded.interval, period_start = excluded.period_start;

-- revoke
delete from public.entitlements where user_id = '<auth user id>' and product = 'tier_pro';

-- undo a pool unlock (support only — there is deliberately no in-app path)
delete from public.print_pool_unlocks where user_id = '<auth user id>';
```

The client re-checks per identity/mount (and `useTier().refresh()` re-polls), so a fresh grant
shows up next time the user opens the gated surface — no deploy needed.

## Provider: STRIPE (decided 2026-07-16, building in TEST MODE)

Account: `acct_1TtzOWH8KZaf7tNO` ("TCGScan"). Accepted integration plan (Stripe
implementation planner, guide `iguide_61V3NTkB3BlVzjmQZ41H8KZaf7tNO`): Stripe-hosted
**Checkout** (subscription mode for tiers, payment mode for the one-time PDF), no-code
**Customer Portal** for manage/cancel/payment-method, **freemium** (no card-on-file trials),
**Smart Retries** defaults for failed-payment recovery. No Elements, no custom payment UI.

Test-mode catalog (recreate the same lookup_keys in live mode before launch — code references
lookup keys and `metadata.michi_product`, never raw price ids):

| lookup_key | price | product (metadata.michi_product) |
| --- | --- | --- |
| `michi_pro_monthly` | $3.99/mo | michi-maker PRO (`tier_pro`) |
| `michi_pro_yearly` | $39.99/yr | michi-maker PRO (`tier_pro`) |
| `michi_vip_monthly` | $9.99/mo | michi-maker VIP (`tier_vip`) |
| `michi_vip_yearly` | $99.99/yr | michi-maker VIP (`tier_vip`) |
| `michi_binder_pdf` | $3.99 one-time | Full-binder fill-sheet PDF (`pdf_binder`) |
| `tcgscan_pro_monthly` | TBD/mo | **CROSS-APP** TCGScan Pro (`tcgscan_pro`) — needs creating |
| `tcgscan_pro_yearly` | TBD/yr | **CROSS-APP** TCGScan Pro (`tcgscan_pro`) — needs creating |

#### Product descriptions (Stripe-side copy — keep in sync with `tiers.ts`)

These show on Stripe Checkout and on every invoice, so a stale one is customer-facing. Corrected
2026-07-19: VIP still said "5 included prints" after the cut to 3, and **PRO said "100 artworks
kept" when PRO's cap is 1,000** (100 is the Free limit) — wrong since the catalog was created.

- **michi-maker PRO** (`prod_Utn8JzwQXHhDjn`): 12 binders, 40 pages each, full card catalog,
  similarity matching and every composer method, 1,000 Slice Studio artworks kept, full-binder
  fill-sheet PDFs with 1 included print a month (12 a year on yearly billing, usable whenever you
  want). Move up to VIP any time, prorated.
- **michi-maker VIP** (`prod_Utn8x7GCeGVKMw`): unlimited binders and pages, unlimited Slice Studio
  artworks, similarity matching and every composer method, full-binder fill-sheet PDFs with 3
  included prints a month (36 a year on yearly billing, usable whenever you want). Plus first in
  line for print extras and a featured eligibility boost.

**These are TEST-mode products.** Live mode has its own product objects — recreate the same
descriptions there at go-live, same as the price catalog above.

### Cross-app bundle (code is live; two dashboard steps remain)

`stripe-checkout` sells BOTH apps' products and applies a server-verified **bundle discount**
(`bundle: true` in the request): owning an active michi tier discounts TCGScan Pro and vice-versa
(`bundleSiblingsFor`). The webhook grants `tcgscan_pro` from its lookup keys and never lets the
PRO↔VIP sibling hygiene touch it. Surfaces: michi `BundleOffer` (Settings + post-checkout upsell
on /subscriptions), tcgscan `ProPerk`/`BundleOffer` (Settings + Home). To finish:

1. **Create the TCGScan Pro product** (Test mode): metadata `michi_product=tcgscan_pro`, two
   recurring prices with lookup keys `tcgscan_pro_monthly` / `tcgscan_pro_yearly`.
2. **Create the bundle coupon** (percent-off, e.g. 30%) and set it:
   `supabase secrets set STRIPE_BUNDLE_COUPON=<coupon id>`.

Until both exist, a bundle CTA fails gracefully ("price not found in this Stripe mode" /
no discount applied).

## Wiring Stripe (build checklist)

1. **Checkout**: hosted checkout page, launched from the locked box in
   `PrintPlaceholdersSheet` (replace the "purchases aren't open yet" note with a Buy button).
   Attach the Supabase user id — Stripe: `client_reference_id`; Lemon Squeezy:
   `checkout[custom][user_id]`.
2. **Webhook edge function** (`supabase/functions/payments-webhook`): verify the provider
   signature, then **with the service role client** upsert the entitlement.
   - one-time per-binder (`pdf_binder:<id>`): `insert … values (:uid, 'pdf_binder:'||:binderId, :source) on conflict do nothing`.
   - subscription (`tier_pro`/`tier_vip`): on activation/renewal **upsert `expires_at`** to the
     period end (`on conflict (user_id, product) do update set expires_at = excluded.expires_at`);
     on cancellation either delete the row or set `expires_at` to the term end (it lapses on its own).
   Keep it idempotent — providers redeliver webhooks.
3. **Client**: after returning from checkout, call `useTier().refresh()` (poll a few times —
   webhooks lag checkout by seconds). Replace the `UpgradePerk` "coming soon" toggle + the
   `PrintPlaceholdersSheet` locked box with a real Buy/Upgrade launch into hosted checkout.
4. Secrets go in Supabase function env (`supabase secrets set`), never in app code —
   same rule as the service key (see AGENTS.md).

Price lives entirely in the provider dashboard; the app never hardcodes it.
