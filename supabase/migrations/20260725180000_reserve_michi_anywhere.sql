-- "michi" is reserved ANYWHERE in a handle (a deliberate, aggressive brand rule), with existing
-- holders grandfathered.
--
-- 1. GUARD SWAP. The old rule required a CONTAINS term to be >=6 chars after normalisation — a
--    proxy for "don't let a term secretly fold down to something short" (the michiofficial ->
--    michi bug). The honest guard is to require a CONTAINS term to be stored ALREADY NORMALISED,
--    so what you write is exactly what matches. That prevents the surprise and still allows a
--    short term chosen on purpose, like 'michi'.
alter table public.reserved_usernames drop constraint if exists reserved_usernames_contains_long_enough;
alter table public.reserved_usernames drop constraint if exists reserved_usernames_match_type_check;
alter table public.reserved_usernames
  add constraint reserved_usernames_match_type_check
  check (match_type in ('exact', 'contains', 'exempt'));
alter table public.reserved_usernames
  add constraint reserved_usernames_contains_is_normalised
  check (match_type <> 'contains'
         or (term = public.normalize_username(term) and length(term) >= 4));

-- 2. michi: exact -> contains. michigan / michiko / notmichigan are refused too. That is the
--    intent: no handle may carry the brand's name at all.
update public.reserved_usernames set match_type = 'contains' where term = 'michi';

-- 3. GRANDFATHERING. A row with match_type 'exempt' whitelists ONE normalised handle for ONE user,
--    overriding every other rule — how accounts predating a rule keep their name, and how a held
--    name is granted to a person later. Seeded from whoever a rule would now catch.
insert into public.reserved_usernames (term, match_type, reason, claimable_by)
select p.username, 'exempt', 'grandfathered: claimed before the rule', p.id
from public.profiles p
where p.username is not null
  and public.username_reserved_reason(p.username, null) is not null
on conflict (term) do update
  set match_type = 'exempt', reason = excluded.reason, claimable_by = excluded.claimable_by;

-- 4. EVASION FIX. Stripping decorator words ("official", "team", "tm"…) can CONSUME letters of the
--    protected term and silently un-match an impersonation:
--      notmichigan -> no[tm]ichigan -> "noichigan"   (michi gone)
--      teamichi    -> [team]ichi    -> "ichi"        (michi gone)
--      batmichi    -> ba[tm]ichi    -> "baichi"      (michi gone)
--    Stripping is still wanted for the opposite case (officialmichi, themichi, michimakerhq), so
--    rather than drop it we test BOTH readings: the full fold, and a "light" fold that keeps
--    decorator words. A term matches if EITHER matches, so stripping can only add matches.
create or replace function public.normalize_username_light(p text)
returns text language sql immutable strict set search_path = '' as $$
  select regexp_replace(regexp_replace(collapsed, '^[0-9]+', ''), '[0-9]+$', '')
  from (
    select regexp_replace(shapes, '(.)\1+', '\1', 'g') as collapsed
    from (
      select replace(replace(leet, 'rn', 'm'), 'vv', 'w') as shapes
      from (
        select translate(bare, '013456789', 'oieasgtbg') as leet
        from (select replace(lower(p), '_', '') as bare) s1
      ) s2
    ) s3
  ) s4;
$$;

comment on function public.normalize_username_light(text) is
  'Confusable fold WITHOUT decorator-word stripping; paired with normalize_username so stripping '
  'can never consume the letters of a reserved term and hide a match.';

create or replace function public.username_reserved_reason(p_username text, p_user uuid default null)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  n_full  text := public.normalize_username(p_username);
  n_light text := public.normalize_username_light(p_username);
begin
  if p_user is not null and exists (
    select 1 from public.reserved_usernames r
    where r.match_type = 'exempt' and r.claimable_by = p_user
      and (r.term_norm = n_full or r.term_norm = n_light)
  ) then
    return null;
  end if;
  return (
    select r.reason from public.reserved_usernames r
    where r.match_type <> 'exempt'
      and (r.claimable_by is null or r.claimable_by is distinct from p_user)
      and ( (r.match_type = 'exact'    and (n_full = r.term_norm or n_light = r.term_norm))
         or (r.match_type = 'contains' and (n_full like '%' || r.term_norm || '%'
                                         or n_light like '%' || r.term_norm || '%')) )
    limit 1
  );
end;
$$;

grant execute on function public.normalize_username_light(text) to anon, authenticated;
