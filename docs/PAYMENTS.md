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
| `pdf_print` | One-time LIFETIME full-print unlock (fill sheets, any binder, forever) | **GRANDFATHERED** — existing holders keep it |
| `tier_pro`  | PRO subscription — full print (1 included print/mo) + higher limits | `expires_at` per period |
| `tier_vip`  | VIP subscription — unlimited + 5 included prints/mo + priority | `expires_at` per period |
| `pdf_binder:<id>` | one-time single-binder fill-sheet PDF ($3.99 strawman) | future — no paid sample; the teaser is a free premade example sheet |
| `tcgscan_pro` | **CROSS-APP** — TCGScan Pro (sold by the sibling app). Unlocks scan-powered michi features (Build-a-binder-from-your-collection) + drives the bundle cross-sell | read via `hasTcgscanPro()`; michi never resolves a tier from it. See **docs/SYNERGY.md** |

Full print (`PrintPlaceholdersSheet` Download) unlocks for PRO/VIP **or** an active `pdf_print`
row. The counts preview stays free as the teaser; only the Download is behind the unlock.

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

-- grant a lifetime unlock (pdf_print)
insert into public.entitlements (user_id, product, source)
values ('<auth user id>', 'pdf_print', 'manual')
on conflict (user_id, product) do nothing;

-- grant a PRO tier for 1 month (subscriptions carry a term; NULL expires_at = lifetime)
insert into public.entitlements (user_id, product, source, expires_at)
values ('<auth user id>', 'tier_pro', 'manual', now() + interval '1 month')
on conflict (user_id, product) do update set expires_at = excluded.expires_at, source = excluded.source;

-- revoke
delete from public.entitlements where user_id = '<auth user id>' and product = 'tier_pro';
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

## Wiring Stripe (build checklist)

1. **Checkout**: hosted checkout page, launched from the locked box in
   `PrintPlaceholdersSheet` (replace the "purchases aren't open yet" note with a Buy button).
   Attach the Supabase user id — Stripe: `client_reference_id`; Lemon Squeezy:
   `checkout[custom][user_id]`.
2. **Webhook edge function** (`supabase/functions/payments-webhook`): verify the provider
   signature, then **with the service role client** upsert the entitlement.
   - one-time (`pdf_print`): `insert … values (:uid, 'pdf_print', :source) on conflict do nothing`.
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
