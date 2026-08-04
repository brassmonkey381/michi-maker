-- Reserve the "piplup" / "peeplup" handle family for the Michi Method's creator, the same way we
-- reserve "michi" (see 20260725170000 / _180000 / _190000). Held for the owner: blocked for
-- everyone else until handed over.
--
-- The normalize_username fold already covers the mechanical variants automatically, so we don't
-- enumerate them: p1plup (leet), pip_lup (separators), piiplup / peeeplup (collapsed repeats),
-- officialpiplup / teampeeplup (decorator words) all fold onto the stems below.
--
-- Match types follow the michi precedent:
--   * 'contains' on the two roots, so the name can't be carried anywhere in a handle (piplupfan,
--     teampeeplup). Per the reserve_michi_anywhere constraint a contains term must be stored
--     ALREADY NORMALISED, so peeplup is stored as its fold 'peplup'.
--   * 'exact' on phonetic near-misses (o / b vowel-and-consonant swaps), to refuse the
--     impersonating handle itself without the substring collateral a contains rule causes.
--
-- NOTE (deliberate, relax if unwanted): 'piplup' is a well-known Pokemon, so the CONTAINS rule
-- refuses every piplup-themed handle (piplupfan, shinypiplup, ...). That mirrors the aggressive
-- michi stance. To hold only the exact handle instead, switch it to 'exact':
--   update public.reserved_usernames set match_type = 'exact' where term = 'piplup';

insert into public.reserved_usernames (term, match_type, reason) values
  ('piplup', 'contains', 'held for its owner'),
  ('peplup', 'contains', 'held for its owner'),  -- normalize_username('peeplup') = 'peplup'
  ('piplop', 'exact',    'held for its owner'),   -- o-vowel near-miss (peeplop is already reserved)
  ('piplub', 'exact',    'held for its owner'),   -- b-consonant near-miss
  ('peplub', 'exact',    'held for its owner')    -- normalize_username('peeplub') = 'peplub'
on conflict (term) do nothing;

-- Grandfather anyone who already holds a handle these new rules would now catch (same mechanism as
-- reserve_michi_anywhere step 3): an 'exempt' row whitelists that exact handle for that one user.
-- The username trigger already leaves existing rows alone on unrelated updates; this also keeps the
-- pre-check RPC honest for their own handle. Idempotent.
insert into public.reserved_usernames (term, match_type, reason, claimable_by)
select p.username, 'exempt', 'grandfathered: claimed before the rule', p.id
from public.profiles p
where p.username is not null
  and public.username_reserved_reason(p.username, null) is not null
on conflict (term) do update
  set match_type = 'exempt', reason = excluded.reason, claimable_by = excluded.claimable_by;
