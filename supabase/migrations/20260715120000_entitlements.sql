-- Purchased (or manually granted) product unlocks — the paid-features ledger. First product:
-- 'pdf_print', the one-time "print placeholder PDFs at home" unlock gating the Download button
-- in the Print placeholders sheet.
--
-- Writes are deliberately server-side only: there are NO insert/update/delete policies for
-- client roles, so a row can only be granted by the service role — today a manual SQL grant,
-- later a payment-provider webhook edge function (Stripe / Lemon Squeezy "checkout completed"
-- -> verify signature -> insert). The client just SELECTs its own rows.

create table public.entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Product key, e.g. 'pdf_print'. One row per (user, product) — an unlock is idempotent.
  product text not null,
  granted_at timestamptz not null default now(),
  -- Where the grant came from: 'manual' today; 'stripe' / 'lemonsqueezy' etc. once wired.
  source text not null default 'manual',
  primary key (user_id, product)
);

comment on table public.entitlements is
  'Per-user product unlocks (e.g. pdf_print). Granted server-side only (webhook / manual); clients read their own.';

alter table public.entitlements enable row level security;

create policy "Users can read their own entitlements"
  on public.entitlements for select
  to authenticated
  using (auth.uid() = user_id);
