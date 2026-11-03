-- ARTISTS (owner, 2026-11-03): real artists share their work so collectors can preview it on the
-- surfaces the app already decorates (art slots and inserts, sleeves, art backings, page
-- backgrounds, binder covers, and the stock card of an art window). Preview only: nothing here
-- can be printed or bought. Self-serve, behind two gates the owner holds:
--
--   1. profiles.is_artist   - flipped by an admin in Studio (admin_set_artist). An artist account
--                             gets an Artist panel in the account sheet and may upload pieces.
--   2. artist_pieces.status - every upload is 'pending' until an admin approves it in Studio
--                             (admin_review_piece). Only 'approved' pieces are offered to anyone.
--
-- The pictures live in the artist's own folder of the binder-art bucket (existing policies), so
-- a removed artist takes their files with them. Attribution on a placed piece is the artist's
-- username and link, origin 'artist'; the print path prints a placeholder for that origin.
--
-- ALSO CLOSES A HOLE. "Users can update their own profile" is a whole-row policy and the table
-- grant is whole-table, so until now an authenticated user could PATCH their own is_admin. The
-- guard trigger below refuses any non-admin change to is_admin or is_artist.
--
-- Applied with `supabase db query --linked -f` (shared project; db push always stops).

-- ── 1. profile flags ────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_artist boolean not null default false,
  add column if not exists artist_link text;

comment on column public.profiles.is_artist is
  'Admin-granted. Shows the Artist panel and allows uploads to artist_pieces. Set by admin_set_artist().';
comment on column public.profiles.artist_link is
  'Where to commission or buy from the artist (their shop, Reddit or Pinterest). Shown as the credit link.';

-- NOT security definer: current_user must stay the caller's role, so the SQL editor and the
-- owner's scripts (role postgres) are not guarded, and PostgREST callers (anon/authenticated) are.
create or replace function public.profiles_guard_flags()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if (new.is_admin or new.is_artist) and not public.is_admin() then
      raise exception 'is_admin and is_artist are set by an admin';
    end if;
    return new;
  end if;
  if (new.is_admin is distinct from old.is_admin or new.is_artist is distinct from old.is_artist)
     and not public.is_admin() then
    raise exception 'is_admin and is_artist are set by an admin';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_flags on public.profiles;
create trigger profiles_guard_flags
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_flags();

-- ── 2. the pieces ───────────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.artist_piece_status as enum ('pending', 'approved', 'rejected', 'removed');
exception when duplicate_object then null; end $$;

create table if not exists public.artist_pieces (
  id          uuid primary key default gen_random_uuid(),
  artist_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  -- The hosted picture (binder-art bucket, the artist's own folder) and its size.
  url         text not null check (url like 'https://%'),
  width       integer check (width is null or width > 0),
  height      integer check (height is null or height > 0),
  -- Where the artist offers it: 'slot' (art slots and inserts), 'sleeve', 'backing',
  -- 'background' (page), 'cover' (binder cover), 'mat' (the stock card of an art window).
  surfaces    text[] not null default '{}'
              check (surfaces <@ array['slot', 'sleeve', 'backing', 'background', 'cover', 'mat']::text[]),
  status      public.artist_piece_status not null default 'pending',
  review_note text,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.artist_pieces is
  'Pieces artists offer for preview. Only approved rows are offered; the artist sees their own rows at any status.';

create index if not exists artist_pieces_artist_idx on public.artist_pieces (artist_id, created_at desc);
create index if not exists artist_pieces_offered_idx on public.artist_pieces (created_at desc) where status = 'approved';

drop trigger if exists artist_pieces_set_updated_at on public.artist_pieces;
create trigger artist_pieces_set_updated_at
  before update on public.artist_pieces
  for each row execute function public.set_updated_at();

-- Status is the admin's column. An artist may withdraw a piece ('removed'); any other change to
-- status by a non-admin is refused, and an edit to the picture or title of an approved piece sends
-- it back to 'pending' so nothing goes live unreviewed.
create or replace function public.artist_pieces_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if public.is_admin() then
    if new.status is distinct from old.status then new.reviewed_at := now(); end if;
    return new;
  end if;
  if new.status is distinct from old.status and new.status <> 'removed' then
    raise exception 'status is set by review';
  end if;
  if new.artist_id is distinct from old.artist_id then
    raise exception 'a piece cannot change artist';
  end if;
  if old.status = 'approved' and (new.url is distinct from old.url or new.title is distinct from old.title) then
    new.status := 'pending';
    new.review_note := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists artist_pieces_guard on public.artist_pieces;
create trigger artist_pieces_guard
  before update on public.artist_pieces
  for each row execute function public.artist_pieces_guard();

alter table public.artist_pieces enable row level security;

drop policy if exists "Anyone reads approved pieces" on public.artist_pieces;
create policy "Anyone reads approved pieces"
  on public.artist_pieces for select to anon, authenticated
  using (status = 'approved');

drop policy if exists "Artists read their own pieces" on public.artist_pieces;
create policy "Artists read their own pieces"
  on public.artist_pieces for select to authenticated
  using ((select auth.uid()) = artist_id);

drop policy if exists "Admins read every piece" on public.artist_pieces;
create policy "Admins read every piece"
  on public.artist_pieces for select to authenticated
  using (public.is_admin());

drop policy if exists "Artists add pending pieces" on public.artist_pieces;
create policy "Artists add pending pieces"
  on public.artist_pieces for insert to authenticated
  with check (
    (select auth.uid()) = artist_id
    and status = 'pending'
    and coalesce((select p.is_artist from public.profiles p where p.id = (select auth.uid())), false)
  );

drop policy if exists "Artists edit their own pieces" on public.artist_pieces;
create policy "Artists edit their own pieces"
  on public.artist_pieces for update to authenticated
  using ((select auth.uid()) = artist_id)
  with check ((select auth.uid()) = artist_id);

drop policy if exists "Admins review pieces" on public.artist_pieces;
create policy "Admins review pieces"
  on public.artist_pieces for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Artists delete their own pieces" on public.artist_pieces;
create policy "Artists delete their own pieces"
  on public.artist_pieces for delete to authenticated
  using ((select auth.uid()) = artist_id);

grant select, insert, update, delete on public.artist_pieces to authenticated;
grant select on public.artist_pieces to anon;

-- ── 3. the shelf: what the pickers read ─────────────────────────────────────────────────────
-- security_invoker, so the piece policies above decide what each caller sees (approved rows for
-- everyone); the profile columns joined are already public reads.
create or replace view public.artist_shelf
with (security_invoker = true) as
  select pc.id, pc.title, pc.url, pc.width, pc.height, pc.surfaces, pc.created_at,
         pc.artist_id, p.username as artist_username, p.display_name as artist_name, p.artist_link
    from public.artist_pieces pc
    join public.profiles p on p.id = pc.artist_id
   where pc.status = 'approved' and p.is_artist;

grant select on public.artist_shelf to anon, authenticated;

-- ── 4. admin calls ──────────────────────────────────────────────────────────────────────────
create or replace function public.admin_set_artist(p_user uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.profiles set is_artist = p_on where id = p_user;
end;
$$;

create or replace function public.admin_review_piece(p_piece uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_status not in ('approved', 'rejected', 'removed', 'pending') then raise exception 'bad status'; end if;
  update public.artist_pieces
     set status = p_status::public.artist_piece_status, review_note = p_note, reviewed_at = now()
   where id = p_piece;
end;
$$;

-- Every piece at every status, newest first, for the Studio queue.
create or replace function public.admin_artist_pieces(p_status text default 'pending', p_limit integer default 100)
returns table (
  id uuid, artist_id uuid, artist_username text, artist_name text, title text, url text,
  width integer, height integer, surfaces text[], status text, review_note text, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select pc.id, pc.artist_id, p.username, p.display_name, pc.title, pc.url, pc.width, pc.height,
         pc.surfaces, pc.status::text, pc.review_note, pc.created_at
    from public.artist_pieces pc
    join public.profiles p on p.id = pc.artist_id
   where public.is_admin()
     and (p_status = 'all' or pc.status::text = p_status)
   order by pc.created_at desc
   limit least(greatest(p_limit, 1), 500);
$$;

grant execute on function public.admin_set_artist(uuid, boolean) to authenticated;
grant execute on function public.admin_review_piece(uuid, text, text) to authenticated;
grant execute on function public.admin_artist_pieces(text, integer) to authenticated;
