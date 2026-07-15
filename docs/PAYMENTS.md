# Payments & entitlements

Paid features are gated by the `entitlements` table (`supabase/migrations/20260715120000_entitlements.sql`):
one row per `(user_id, product)`, owner-only SELECT via RLS, **no client write policies** —
a grant can only come from the service role. The client checks ownership with the
`useEntitlement(product)` hook and renders the locked/unlocked UI accordingly.

## Products

| key         | what it unlocks                                                        | where it's gated                       |
| ----------- | ---------------------------------------------------------------------- | -------------------------------------- |
| `pdf_print` | Placeholder-PDF downloads ("Print placeholders", any binder, forever) | `PrintPlaceholdersSheet` Download button |

The counts preview ("N placeholders across M sheets") stays free as the teaser; only the
Download button is behind the unlock.

## Granting manually (today's path)

Checkout isn't wired yet. To grant (or revoke) an unlock, run as service role
(SQL editor / MCP):

```sql
-- grant
insert into public.entitlements (user_id, product, source)
values ('<auth user id>', 'pdf_print', 'manual')
on conflict (user_id, product) do nothing;

-- look up a user id by email
select id, email from auth.users where email = 'someone@example.com';

-- revoke
delete from public.entitlements where user_id = '<auth user id>' and product = 'pdf_print';
```

The sheet re-checks on open (the hook re-queries per identity/mount), so a fresh grant shows
up the next time the user opens Print placeholders — no deploy needed.

## Wiring a payment provider (the open slot)

When a provider is chosen (Stripe or Lemon Squeezy were the candidates):

1. **Checkout**: hosted checkout page, launched from the locked box in
   `PrintPlaceholdersSheet` (replace the "purchases aren't open yet" note with a Buy button).
   Attach the Supabase user id — Stripe: `client_reference_id`; Lemon Squeezy:
   `checkout[custom][user_id]`.
2. **Webhook edge function** (`supabase/functions/payments-webhook`): verify the provider
   signature, then on the "checkout completed" event insert the entitlement **with the
   service role client**:
   `insert into entitlements (user_id, product, source) values (:uid, 'pdf_print', 'stripe')`.
   Keep it idempotent (`on conflict do nothing`) — providers redeliver webhooks.
3. **Client**: after returning from checkout, call the hook's `refresh()` (poll a few times —
   webhooks lag checkout by seconds).
4. Secrets go in Supabase function env (`supabase secrets set`), never in app code —
   same rule as the service key (see AGENTS.md).

Price lives entirely in the provider dashboard; the app never hardcodes it.
