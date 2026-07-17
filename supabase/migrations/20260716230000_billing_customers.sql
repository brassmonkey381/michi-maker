-- Supabase user ↔ Stripe customer mapping. Written by the payments-webhook edge function when
-- a checkout completes (service role only — same invariant as entitlements: NO client write
-- policies). Read server-side to open Customer Portal sessions and to resolve the user on
-- subscription renewal events that don't carry our metadata.

create table public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.billing_customers is
  'Stripe customer id per user (test + live share the column; ids are mode-prefixed by Stripe). Service-role writes only, from the payments webhook.';

alter table public.billing_customers enable row level security;

create policy "Users can read their own billing customer"
  on public.billing_customers for select
  to authenticated
  using (auth.uid() = user_id);
