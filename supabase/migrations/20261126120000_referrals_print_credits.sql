-- MIC-069 (owner 2026-11-25): refer a friend, paid in free PDF prints.
--
-- Rules, in the owner's words where he gave them:
--   - The referrer gets 1 print "once the free trial is confirmed signed-up": the friend's
--     card-backed 3-day checkout trial has started (the webhook sees checkout.session.completed).
--   - If the friend pays, "they each get another": the first invoice with amount_paid > 0 on the
--     referred subscription gives the referrer +1 and the friend +1. 3 prints in total.
--   - "no caps": no monthly cap, no expiry. A card on file is the only gate.
--   - "refund voids the print codes": a full refund of the friend's subscription payment voids
--     the UNSPENT prints that payment earned (the two paid ones). A trial cancel voids nothing
--     ("069 A"). A print already spent stays spent: the binder unlock is not taken back.
--
-- Three tables, all read-own under RLS, all written only by the server:
--   referral_codes  one invite code per real (non-guest) account, made on first ask
--   referrals       who invited whom, one row per invitee, written by stripe-checkout
--   print_credits   the ledger; one row per free print, spent by redeem_print_credit()
--
-- A spent credit writes the SAME entitlement a $1.99 purchase writes (pdf_binder:<id>), with a
-- fresh granted_at, so the print sheet's snapshot logic treats it exactly like a purchase.

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
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  referral_id     uuid references public.referrals (id) on delete set null,
  reason          text not null check (reason in ('friend_trial', 'friend_paid', 'paid_with_invite')),
  granted_at      timestamptz not null default now(),
  spent_at        timestamptz,
  spent_binder_id uuid,
  voided_at       timestamptz,
  unique (referral_id, user_id, reason)
);
create index if not exists print_credits_user_idx on public.print_credits (user_id);
comment on table public.print_credits is
  'MIC-069: free PDF prints earned by inviting friends. One row per print; spent by redeem_print_credit(), voided on a refund of the paying invoice. No cap, no expiry (owner).';

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

-- The caller's invite code, made on first ask. Real accounts only: a guest's account is thrown
-- away with its session, and a guest cannot buy, so it has nothing to invite anyone to.
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
      -- Either the code collided (try another) or a parallel call made this user's row.
      select rc.code into c from public.referral_codes rc where rc.user_id = uid;
      if c is not null then return c; end if;
    end;
  end loop;
  raise exception 'could not make an invite code';
end $$;

-- Everything the invite page shows, in one read. No friend ids or names: only statuses and dates.
create or replace function public.my_referrals()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', (select rc.code from public.referral_codes rc where rc.user_id = auth.uid()),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('status', r.status, 'created_at', r.created_at) order by r.created_at desc)
      from public.referrals r where r.inviter_id = auth.uid()
    ), '[]'::jsonb),
    'credits_left', (
      select count(*) from public.print_credits pc
      where pc.user_id = auth.uid() and pc.spent_at is null and pc.voided_at is null
    ),
    'credits_used', (
      select count(*) from public.print_credits pc
      where pc.user_id = auth.uid() and pc.spent_at is not null
    ),
    -- The friend side: was this account invited, and did its payment earn prints a refund would void.
    'invited_status', (select r.status from public.referrals r where r.invitee_id = auth.uid())
  );
$$;

-- Spend one free print on one of the caller's own binders. Writes the same pdf_binder:<id>
-- entitlement a purchase writes, with granted_at = now() so a spend after an edit re-arms it.
-- An earlier PURCHASE row keeps its source and price (the money ledger still reads it as a sale).
create or replace function public.redeem_print_credit(p_binder_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  credit uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.binders b where b.id = p_binder_id and b.owner_id = uid) then
    raise exception 'That binder is not yours.';
  end if;
  select pc.id into credit
    from public.print_credits pc
   where pc.user_id = uid and pc.spent_at is null and pc.voided_at is null
   order by pc.granted_at
   limit 1
   for update skip locked;
  if credit is null then raise exception 'You have no free prints left.'; end if;
  update public.print_credits
     set spent_at = now(), spent_binder_id = p_binder_id
   where id = credit;
  insert into public.entitlements (user_id, product, source, granted_at, expires_at, price_lookup_key, unit_amount_minor)
  values (uid, 'pdf_binder:' || p_binder_id::text, 'referral', now(), null, 'pdf_binder', 0)
  on conflict (user_id, product) do update set granted_at = now();
end $$;

-- ── Server-only RPCs (payments-webhook, service role) ──────────────────────────────────────

-- The friend's card trial started: the referral moves pending -> trialled and the referrer gets
-- 1 print. A replayed event finds the row already trialled and grants nothing.
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
    insert into public.print_credits (user_id, referral_id, reason)
    values (inviter, p_referral_id, 'friend_trial')
    on conflict (referral_id, user_id, reason) do nothing;
  end if;
end $$;

-- The friend's first paid invoice: trialled (or pending, if the trial event was lost) -> paid,
-- and each side gets 1 print. Later renewals find the row already paid and grant nothing.
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
    insert into public.print_credits (user_id, referral_id, reason)
    values (r.inviter_id, p_referral_id, 'friend_paid'),
           (r.invitee_id, p_referral_id, 'paid_with_invite')
    on conflict (referral_id, user_id, reason) do nothing;
  end if;
end $$;

-- A full refund of the friend's subscription payment: the referral is voided and the UNSPENT
-- prints that payment earned are voided. The trial print stays ("069 A"); spent prints stay spent.
create or replace function public.referral_void_for_invitee(p_invitee_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  update public.referrals
     set status = 'voided', voided_at = now()
   where invitee_id = p_invitee_id and status = 'paid'
  returning id into rid;
  if rid is not null then
    update public.print_credits
       set voided_at = now()
     where referral_id = rid
       and reason in ('friend_paid', 'paid_with_invite')
       and spent_at is null and voided_at is null;
  end if;
end $$;

revoke all on function public.my_referral_code()                        from public, anon;
revoke all on function public.my_referrals()                            from public, anon;
revoke all on function public.redeem_print_credit(uuid)                 from public, anon;
revoke all on function public.referral_mark_trialled(uuid, text)        from public, anon, authenticated;
revoke all on function public.referral_mark_paid(uuid, text)            from public, anon, authenticated;
revoke all on function public.referral_void_for_invitee(uuid)           from public, anon, authenticated;
grant execute on function public.my_referral_code()                     to authenticated;
grant execute on function public.my_referrals()                         to authenticated;
grant execute on function public.redeem_print_credit(uuid)              to authenticated;
grant execute on function public.referral_mark_trialled(uuid, text)     to service_role;
grant execute on function public.referral_mark_paid(uuid, text)         to service_role;
grant execute on function public.referral_void_for_invitee(uuid)        to service_role;
