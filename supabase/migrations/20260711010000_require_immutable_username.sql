-- Usernames: a permanent, unique handle chosen at sign-up.
--
-- Format: 3–20 chars, lowercase letters / digits / underscore. Uniqueness is already enforced by
-- the profiles.username unique index (init migration). Once set, a username can NEVER change — an
-- immutability trigger rejects any update that alters a non-null username (other profile fields,
-- e.g. display_name / is_public, still update freely). The claim itself (null → value) is a normal
-- self-update permitted by the existing "Users can update their own profile" policy.

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

create or replace function public.enforce_username_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.username is not null and new.username is distinct from old.username then
    raise exception 'username cannot be changed once set';
  end if;
  return new;
end;
$$;

create trigger profiles_username_immutable
  before update on public.profiles
  for each row execute function public.enforce_username_immutable();
