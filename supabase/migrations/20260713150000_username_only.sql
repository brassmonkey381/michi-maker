-- Retire display_name from every read path: the permanent @username is the one public name.
-- The profiles.display_name column stays (historical data) but nothing reads or writes it.

-- Featured ranking: author is the owner's username.
create or replace function public.featured_binders(p_limit integer default 12)
returns table(binder_id uuid, like_count bigint, author_name text)
language sql stable security definer set search_path = ''
as $$
  select l.binder_id, count(*) as like_count, max(p.username) as author_name
  from public.binder_likes l
  join public.binders b on b.id = l.binder_id
  join public.profiles p on p.id = b.owner_id
  where l.created_at >= now() - interval '3 days'
    and b.is_public
    and coalesce(p.is_public, true)
  group by l.binder_id
  order by like_count desc, l.binder_id
  limit greatest(p_limit, 0);
$$;

-- People search: match and rank by username only. Return type changes → drop first.
drop function if exists public.search_profiles(text, integer);
create function public.search_profiles(p_query text default '', p_limit integer default 30)
returns table(id uuid, username text, avatar_url text, upvotes bigint)
language sql stable security definer set search_path = ''
as $$
  select pr.id, pr.username, pr.avatar_url,
         (select count(*) from public.profile_upvotes u where u.profile_id = pr.id) as upvotes
  from public.profiles pr
  where coalesce(pr.is_public, true)
    and coalesce(pr.username, '') <> ''
    and (coalesce(p_query, '') = '' or pr.username ilike '%' || p_query || '%')
  order by upvotes desc, lower(pr.username) asc
  limit greatest(p_limit, 0);
$$;

-- New users: only the avatar is copied from the provider metadata now.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;
