-- MIC-069 (owner 2026-11-25): refer a friend, paid in free PDF print CODES.
--
-- Rules, in the owner's words where he gave them:
--   - The referrer gets 1 print "once the free trial is confirmed signed-up": the friend's
--     card-backed checkout trial has started (the webhook sees checkout.session.completed).
--   - If the friend pays, "they each get another": the first invoice with amount_paid > 0 on the
--     referred subscription gives the referrer +1 and the friend +1. 3 prints in total.
--   - "no caps": no monthly cap. Owner 2026-11-25: "referal gift codes expire a year from grant"
--     (and the MIC-073 thank-you codes too; the MIC-074 holiday codes end Jan 31).
--   - "refund voids the print codes": a full refund of the friend's subscription payment voids
--     the UNUSED codes that payment earned (the two paid ones). A trial cancel voids nothing
--     ("069 A"). A code already used stays used.
--   - Review 2026-11-25: every free print is ITS OWN unique code, "generated uniquely as gift
--     codes are granted", entered at Stripe checkout. /invite lists each code, whether it was
--     redeemed, and its expiry. Codes are transferable: anyone signed in can use one.
--
-- Three tables, all read-own under RLS, all written only by the server:
--   referral_codes  one invite code per real (non-guest) account, made on first ask
--   referrals       who invited whom, one row per invitee, written by stripe-checkout
--   print_credits   one row per free print. The row is granted here; its Stripe promotion code
--                   (6 characters, 100% off the binder PDF only, one use) is minted by the edge
--                   functions (payments-webhook right after a grant, stripe-checkout's
--                   "print_codes" action when /invite loads) and written back to the row.
--                   Redemption is recorded by payments-webhook from the completed PDF checkout.
--
-- The same ledger carries the holiday thank-you codes (MIC-073) and gift codes (MIC-074) later;
-- their reasons are allowed here so those items need no second migration.

begin;

create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code       text not null unique check (code ~ '^[a-z0-9]{6,16}$'),
  created_at timestamptz not null default now()
);
comment on table public.referral_codes is
  'MIC-069: one invite code per real account (link /r/<code>). Made by my_referral_code(); no client writes.';

create table if not exists public.referrals (
  id                     uuid primary key default gen_random_uuid(),
  inviter_id             uuid not null references auth.users (id) on delete cascade,
  invitee_id             uuid not null unique references auth.users (id) on delete cascade,
  code                   text not null,
  status                 text not null default 'pending'
                           check (status in ('pending', 'trialled', 'paid', 'voided')),
  stripe_subscription_id text,
  created_at             timestamptz not null default now(),
  trialled_at            timestamptz,
  paid_at                timestamptz,
  voided_at              timestamptz,
  check (inviter_id <> invitee_id)
);
create index if not exists referrals_inviter_idx on public.referrals (inviter_id);
comment on table public.referrals is
  'MIC-069: one row per invited friend. pending = checkout started with the code; trialled = card trial started (referrer +1); paid = first paid invoice (both +1); voided = that payment was refunded. Written by stripe-checkout and payments-webhook only.';

create table if not exists public.print_credits (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  referral_id              uuid references public.referrals (id) on delete set null,
  reason                   text not null
                             check (reason in ('friend_trial', 'friend_paid', 'paid_with_invite', 'subscriber_thanks', 'holiday_gift')),
  granted_at               timestamptz not null default now(),
  -- When the code stops working (referral and thank-you codes: a year from grant, owner 2026-11-25;
  -- holiday gift codes: Jan 31). NULL = never. The Stripe promotion code carries the same expiry.
  expires_at               timestamptz,
  -- The checkout code (upper case, 6 characters) and its Stripe id; NULL until minted.
  code                     text unique check (code ~ '^[A-Z0-9]{6}$'),
  stripe_promotion_code_id text unique,
  redeemed_at              timestamptz,
  redeemed_by              uuid references auth.users (id) on delete set null,
  voided_at                timestamptz
);
create index if not exists print_credits_user_idx on public.print_credits (user_id);
create index if not exists print_credits_unminted_idx on public.print_credits (granted_at) where code is null and voided_at is null;
-- One referral grant per reason per person, so a replayed webhook never mints twice.
create unique index if not exists print_credits_referral_grant_uidx
  on public.print_credits (referral_id, user_id, reason) where referral_id is not null;
comment on table public.print_credits is
  'MIC-069: one free binder PDF per row, each with its own one-use Stripe promotion code (minted by the edge functions). Redeemed at checkout; voided on a refund of the paying invoice.';

alter table public.referral_codes enable row level security;
alter table public.referrals      enable row level security;
alter table public.print_credits  enable row level security;

drop policy if exists "Users read their own invite code" on public.referral_codes;
create policy "Users read their own invite code"
  on public.referral_codes for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users read referrals they are part of" on public.referrals;
create policy "Users read referrals they are part of"
  on public.referrals for select to authenticated
  using (auth.uid() = inviter_id or auth.uid() = invitee_id);

drop policy if exists "Users read their own print credits" on public.print_credits;
create policy "Users read their own print credits"
  on public.print_credits for select to authenticated
  using (auth.uid() = user_id);

-- ── Client RPCs ─────────────────────────────────────────────────────────────────────────────

-- The caller's invite code, made on first ask. Real accounts only.
create or replace function public.my_referral_code()
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  anon boolean;
  c    text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select coalesce(u.is_anonymous, false) into anon from auth.users u where u.id = uid;
  if anon then raise exception 'Create an account to get your invite link.'; end if;
  select rc.code into c from public.referral_codes rc where rc.user_id = uid;
  if c is not null then return c; end if;
  for i in 1..8 loop
    c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    begin
      insert into public.referral_codes (user_id, code) values (uid, c);
      return c;
    exception when unique_violation then
      select rc.code into c from public.referral_codes rc where rc.user_id = uid;
      if c is not null then return c; end if;
    end;
  end loop;
  raise exception 'could not make an invite code';
end $$;

-- Everything the invite page shows, in one read. No friend ids or names: statuses and dates only.
-- Each code's state: making (not minted yet), ready, redeemed, expired, voided.
create or replace function public.my_referrals()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', (select rc.code from public.referral_codes rc where rc.user_id = auth.uid()),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('status', r.status, 'created_at', r.created_at) order by r.created_at desc)
      from public.referrals r where r.inviter_id = auth.uid()
    ), '[]'::jsonb),
    'print_codes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', pc.code,
               'reason', pc.reason,
               'granted_at', pc.granted_at,
               'expires_at', pc.expires_at,
               'redeemed_at', pc.redeemed_at,
               'state', case
                 when pc.voided_at is not null then 'voided'
                 when pc.redeemed_at is not null then 'redeemed'
                 when pc.expires_at is not null and pc.expires_at <= now() then 'expired'
                 when pc.code is null then 'making'
                 else 'ready' end)
             order by pc.granted_at desc)
      from public.print_credits pc where pc.user_id = auth.uid()
    ), '[]'::jsonb),
    -- The friend side: was this account invited, and where its referral stands (refund warning).
    'invited_status', (select r.status from public.referrals r where r.invitee_id = auth.uid())
  );
$$;

-- ── Server-only RPCs (edge functions, service role) ────────────────────────────────────────

-- The friend's card trial started: pending -> trialled and the referrer is granted 1 print.
-- A replayed event finds the row already trialled and grants nothing.
create or replace function public.referral_mark_trialled(p_referral_id uuid, p_subscription_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare inviter uuid;
begin
  update public.referrals
     set status = 'trialled', trialled_at = now(), stripe_subscription_id = p_subscription_id
   where id = p_referral_id and status = 'pending'
  returning inviter_id into inviter;
  if inviter is not null then
    insert into public.print_credits (user_id, referral_id, reason, expires_at)
    values (inviter, p_referral_id, 'friend_trial', now() + interval '1 year')
    on conflict (referral_id, user_id, reason) where referral_id is not null do nothing;
  end if;
end $$;

-- The friend's first paid invoice: trialled (or pending, if the trial event was lost) -> paid,
-- and each side is granted 1 print. Later renewals find the row already paid and grant nothing.
create or replace function public.referral_mark_paid(p_referral_id uuid, p_subscription_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update public.referrals
     set status = 'paid', paid_at = now(),
         stripe_subscription_id = coalesce(stripe_subscription_id, p_subscription_id)
   where id = p_referral_id and status in ('pending', 'trialled')
  returning inviter_id, invitee_id into r;
  if r.inviter_id is not null then
    insert into public.print_credits (user_id, referral_id, reason, expires_at)
    values (r.inviter_id, p_referral_id, 'friend_paid', now() + interval '1 year'),
           (r.invitee_id, p_referral_id, 'paid_with_invite', now() + interval '1 year')
    on conflict (referral_id, user_id, reason) where referral_id is not null do nothing;
  end if;
end $$;

-- A full refund of the friend's subscription payment: the referral is voided and the UNUSED codes
-- that payment earned are voided. Returns their Stripe promotion code ids so the webhook can turn
-- them off in Stripe. The trial code stays ("069 A"); a code already used stays used.
create or replace function public.referral_void_for_invitee(p_invitee_id uuid)
returns setof text
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  update public.referrals
     set status = 'voided', voided_at = now()
   where invitee_id = p_invitee_id and status = 'paid'
  returning id into rid;
  if rid is null then return; end if;
  return query
    update public.print_credits
       set voided_at = now()
     where referral_id = rid
       and reason in ('friend_paid', 'paid_with_invite')
       and redeemed_at is null and voided_at is null
    returning stripe_promotion_code_id;
end $$;

-- A completed PDF checkout used this promotion code: record who redeemed it and when.
create or replace function public.print_code_mark_redeemed(p_promotion_code_id text, p_user_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.print_credits
     set redeemed_at = now(), redeemed_by = p_user_id
   where stripe_promotion_code_id = p_promotion_code_id and redeemed_at is null;
$$;

revoke all on function public.my_referral_code()                          from public, anon;
revoke all on function public.my_referrals()                              from public, anon;
revoke all on function public.referral_mark_trialled(uuid, text)          from public, anon, authenticated;
revoke all on function public.referral_mark_paid(uuid, text)              from public, anon, authenticated;
revoke all on function public.referral_void_for_invitee(uuid)             from public, anon, authenticated;
revoke all on function public.print_code_mark_redeemed(text, uuid)        from public, anon, authenticated;
grant execute on function public.my_referral_code()                       to authenticated;
grant execute on function public.my_referrals()                           to authenticated;
grant execute on function public.referral_mark_trialled(uuid, text)       to service_role;
grant execute on function public.referral_mark_paid(uuid, text)           to service_role;
grant execute on function public.referral_void_for_invitee(uuid)          to service_role;
grant execute on function public.print_code_mark_redeemed(text, uuid)     to service_role;

commit;
