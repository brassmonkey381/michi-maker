-- ═══════════════════════════════════════════════════════════
-- tcgscan: share a collection by link (and QR code), read-only, for anyone
-- ═══════════════════════════════════════════════════════════
-- Owner decision of 2026-11-04: "PRO: share your collection with others. shareable links and QR
-- codes that open the collection for guests on mobile and web." tcgscan-app builds the link
-- ({site}/s/<token>) and the QR code; this is the server half.
--
-- ONE LIVE LINK PER COLLECTION. Asking again returns the same token, so a printed QR code keeps
-- working; stopping sharing revokes it, and sharing again mints a NEW token, so an old printout
-- stays dead. The token is 22 base64url characters of a v4 uuid (122 random bits): unguessable,
-- and the only thing that names the collection to a stranger.
--
-- WHAT A VIEWER SEES: the collection's name, its storage units (binder / box / stack codes and
-- nicknames, page shapes), and per lot the card, printing, condition, quantity, kind, place and
-- the saved scan picture's path (the bucket is public; the path is otherwise unlisted). NEVER what
-- the owner paid, when they bought it, who they are, or anything about other collections.
--
-- PRO WHILE IT IS LIVE. Making a link needs tcgscan PRO or VIP; a link whose owner is no longer
-- PRO stops resolving (it answers 'paused') and starts again if they come back. An archived or
-- deleted collection answers 'gone'.

create table if not exists public.collection_shares (
  token         text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  collection_id text not null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
comment on table public.collection_shares is
  'Read-only share links for tcgscan collections: /s/<token>. One live (unrevoked) row per '
  'collection. Written only through create_collection_share / revoke_collection_share.';

create unique index if not exists collection_shares_one_live
  on public.collection_shares (user_id, collection_id) where revoked_at is null;

-- Owners may read their own rows; nobody writes directly (the functions below are definers).
alter table public.collection_shares enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'collection_shares'
                   and policyname = 'Owners read their collection shares') then
    create policy "Owners read their collection shares" on public.collection_shares
      for select to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- ── make (or return) the link ────────────────────────────────────────────────────────────────
create or replace function public.create_collection_share(p_collection_id text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_token text;
begin
  if v_uid is null or public.request_is_anonymous() then
    raise exception 'share_needs_account' using errcode = 'P0001';
  end if;
  if public.tcgscan_tier(v_uid) not in ('pro', 'vip') and not public.is_staff(v_uid) then
    raise exception 'tier_feature_locked:shareCollection' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.collections c
                  where c.id = p_collection_id and c.user_id = v_uid and c.archived_at is null) then
    -- Not synced yet, or not theirs: the app says "try again in a moment" for the first.
    raise exception 'share_collection_not_found' using errcode = 'P0001';
  end if;
  select s.token into v_token from public.collection_shares s
   where s.user_id = v_uid and s.collection_id = p_collection_id and s.revoked_at is null;
  if v_token is not null then return v_token; end if;
  v_token := rtrim(translate(encode(uuid_send(gen_random_uuid()), 'base64'), '+/', '-_'), '=');
  insert into public.collection_shares (token, user_id, collection_id) values (v_token, v_uid, p_collection_id);
  return v_token;
end; $$;
revoke all on function public.create_collection_share(text) from public;
grant execute on function public.create_collection_share(text) to authenticated;

-- ── stop sharing ─────────────────────────────────────────────────────────────────────────────
create or replace function public.revoke_collection_share(p_collection_id text)
returns void language sql volatile security definer set search_path = public as $$
  update public.collection_shares set revoked_at = now()
   where user_id = auth.uid() and collection_id = p_collection_id and revoked_at is null;
$$;
revoke all on function public.revoke_collection_share(text) from public;
grant execute on function public.revoke_collection_share(text) to authenticated;

-- ── what the owner's app asks: is this collection shared, and by which token ──────────────────
create or replace function public.my_collection_share(p_collection_id text)
returns text language sql stable security definer set search_path = public as $$
  select s.token from public.collection_shares s
   where s.user_id = auth.uid() and s.collection_id = p_collection_id and s.revoked_at is null;
$$;
revoke all on function public.my_collection_share(text) from public;
grant execute on function public.my_collection_share(text) to authenticated;

-- ── what a viewer gets ───────────────────────────────────────────────────────────────────────
-- Anyone, signed in or not. A status, and the collection only when the status is 'ok'.
create or replace function public.shared_collection(p_token text)
returns json language plpgsql stable security definer set search_path = public as $$
declare s public.collection_shares; c public.collections;
begin
  select * into s from public.collection_shares where token = p_token and revoked_at is null;
  if s.token is null then return json_build_object('status', 'not_found'); end if;
  select * into c from public.collections where id = s.collection_id and user_id = s.user_id;
  if c.id is null or c.archived_at is not null then return json_build_object('status', 'gone'); end if;
  if public.tcgscan_tier(s.user_id) not in ('pro', 'vip') and not public.is_staff(s.user_id) then
    return json_build_object('status', 'paused');
  end if;
  return json_build_object(
    'status', 'ok',
    'name', c.name,
    'updated_at', c.updated_at,
    'units', coalesce((
      select json_agg(json_build_object(
        'id', u.id, 'kind', u.kind, 'name', u.name, 'code', u.code, 'parent_id', u.parent_id,
        'grid_rows', u.grid_rows, 'grid_cols', u.grid_cols) order by u.created_at)
      from public.storage_units u where u.user_id = s.user_id and u.collection_id = c.id), '[]'::json),
    'entries', coalesce((
      select json_agg(json_build_object(
        'id', e.id, 'card_id', e.card_id, 'variant', e.variant, 'condition', e.condition,
        'quantity', e.quantity, 'item_kind', e.item_kind, 'storage_id', e.storage_id,
        'storage_page', e.storage_page, 'storage_pos', e.storage_pos,
        'storage_rows', e.storage_rows, 'storage_cols', e.storage_cols,
        'scan_path', e.scan_path, 'added_at', e.added_at) order by e.added_at)
      from public.portfolio_entries e where e.user_id = s.user_id and e.collection_id = c.id), '[]'::json)
  );
end; $$;
revoke all on function public.shared_collection(text) from public;
grant execute on function public.shared_collection(text) to anon, authenticated;
