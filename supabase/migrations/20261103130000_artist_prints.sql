-- ARTIST PRINTS (owner, 2026-11-03: "make my account an artist account whose art is sharable,
-- viewable, and printable as displayed"). Until now every artist piece was preview only: the print
-- path printed a placeholder named for the artist instead of the picture. An artist an admin marks
-- `artist_prints` has said their pieces may be printed, so a placed piece of theirs prints as the
-- picture, exactly as an upload does. Per artist, not per piece: it is a standing permission the
-- artist gives, and the admin records.
--
-- The flag rides the same guard as is_admin / is_artist (admins only), reaches the pickers through
-- the artist_shelf view, and is stamped onto a placed piece's attribution as `printable`, so a
-- binder printed later does not have to look the artist up again.
--
-- Applied with `supabase db query --linked -f` (shared project; db push always stops).

alter table public.profiles
  add column if not exists artist_prints boolean not null default false;

comment on column public.profiles.artist_prints is
  'Admin-granted. The artist allows their approved pieces to be printed as pictures; off means preview only (a placeholder prints).';

-- The guard: one more admin-only column.
create or replace function public.profiles_guard_flags()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if (new.is_admin or new.is_artist or new.artist_prints) and not public.is_admin() then
      raise exception 'is_admin, is_artist and artist_prints are set by an admin';
    end if;
    return new;
  end if;
  if (new.is_admin is distinct from old.is_admin
      or new.is_artist is distinct from old.is_artist
      or new.artist_prints is distinct from old.artist_prints)
     and not public.is_admin() then
    raise exception 'is_admin, is_artist and artist_prints are set by an admin';
  end if;
  return new;
end;
$$;

-- The shelf carries the permission (create or replace keeps the view's grants).
create or replace view public.artist_shelf
with (security_invoker = true) as
  select pc.id, pc.title, pc.url, pc.width, pc.height, pc.surfaces, pc.created_at,
         pc.artist_id, p.username as artist_username, p.display_name as artist_name, p.artist_link,
         p.artist_prints as prints
    from public.artist_pieces pc
    join public.profiles p on p.id = pc.artist_id
   where pc.status = 'approved' and p.is_artist;

grant select on public.artist_shelf to anon, authenticated;

create or replace function public.admin_set_artist_prints(p_user uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.profiles set artist_prints = p_on where id = p_user;
end;
$$;

grant execute on function public.admin_set_artist_prints(uuid, boolean) to authenticated;
