-- Reserved-username tests. READ-ONLY for part 1 (pure function calls); part 2 runs inside a DO
-- block ending in RAISE EXCEPTION, so it rolls back and leaves nothing behind. Safe on production.
--
-- Part 1 asserts BOTH directions. Blocking impersonation is easy; the hard part is not blocking
-- real people. Note "michi" is reserved ANYWHERE by policy, so michigan/michiko ARE refused —
-- that is intended, and existing holders are grandfathered (part 2).
--
-- The teamichi / batmichi / notmichigan rows are regression cases: decorator stripping used to
-- eat the "tm"/"team" inside them and hide the michi, until matching began testing both the full
-- and the light normalisation.

-- ── Part 1: matching, both directions ──────────────────────────────────────────────────────
with cases(u, should_block) as (values
  -- impersonation (must ALL block)
  ('michimaker',true),('michi_maker',true),('m1ch1maker',true),('m1ch1m4k3r',true),
  ('rnichimaker',true),('michiimaker',true),('michimaker2026',true),('xxmichimakerxx',true),
  ('officialmichi',true),('themichi',true),('realmichi',true),('michi',true),('m_i_c_h_i',true),
  ('michihq',true),('michimethod',true),('m1ch1',true),('MICHIMAKER',true),('michimakerr',true),
  ('michi__maker',true),('michimakr',true),('michibinder',true),('teammichi',true),
  -- michi anywhere, incl. the decorator-strip evasions
  ('michigan',true),('michiko',true),('michio',true),('notmichigan',true),('teamichi',true),
  ('batmichi',true),('michi_fan_2026',true),('rnichi',true),('michellemichi',true),
  ('peeplop',true),('peep_lop',true),('p33plop',true),('peeeplop',true),('peplop',true),
  ('admin',true),('adm1n',true),('support',true),('m0derator',true),('n0reply',true),
  ('discover',true),('contest',true),('null',true),
  -- phonetic near-misses: read as the brand without containing "michi" (exact rules)
  ('mitchi',true),('mishi',true),('meechi',true),('michee',true),('mychi',true),
  ('mitchimaker',true),('m1tch1',true),('mitchii',true),
  -- legitimate handles (must ALL be allowed) — the near-miss rules are EXACT precisely so these
  -- names, which sit right next to them, stay claimable.
  ('michelle',false),('mitchell',false),('mishima',false),('michaela',false),('mitch',false),
  ('michel',false),('missy',false),('brassmonkey381',false),('pokefan',false),
  ('theresa',false),('matthew',false),('mike',false),('modest_mouse',false),
  ('binderqueen',false),('charizard',false)
)
select case when count(*) = 0 then 'PASS: all matching cases correct'
            else 'FAIL:' || string_agg(u || ' -> ' || coalesce(public.username_reserved_reason(u),'ALLOWED')
                                        || ' [full=' || public.normalize_username(u)
                                        || ' light=' || public.normalize_username_light(u) || ']', E'\n') end as result
from cases
where (public.username_reserved_reason(u) is not null) <> should_block;

-- ── Part 2: enforcement (trigger + holder exemption), all rolled back ──────────────────────
do $$
declare victim uuid; official uuid; r text := E'\n';
begin
  select id into official from auth.users where email = 'official@michi-maker.com';
  select id into victim from public.profiles where id <> official order by id limit 1;
  update public.profiles set username = null where id = victim;  -- simulate an unclaimed account

  begin
    update public.profiles set username = 'm1ch1_maker' where id = victim;
    r := r || '[FAIL] leetspeak impersonation was CLAIMED' || E'\n';
  exception when others then r := r || '[PASS] trigger blocked m1ch1_maker' || E'\n'; end;

  begin
    update public.profiles set username = 'peeplop' where id = victim;
    r := r || '[FAIL] held name claimed by a stranger' || E'\n';
  exception when others then r := r || '[PASS] trigger blocked peeplop (held)' || E'\n'; end;

  begin
    update public.profiles set username = 'michigan' where id = victim;
    r := r || '[FAIL] "michigan" was claimed (michi is reserved anywhere)' || E'\n';
  exception when others then r := r || '[PASS] trigger blocked michigan (michi anywhere)' || E'\n'; end;

  begin
    update public.profiles set username = 'charizardfan' where id = victim;
    r := r || '[PASS] an unrelated handle is still claimable' || E'\n';
  exception when others then r := r || '[FAIL] unrelated handle blocked: ' || sqlerrm || E'\n'; end;

  -- Grandfathering: the accounts that held a now-reserved handle keep it.
  r := r || case when public.username_reserved_reason(
                        'fakemichi', (select id from auth.users where email='bstockman1@gmail.com')) is null
                 then '[PASS] @fakemichi grandfathered for its owner'
                 else '[FAIL] existing account locked out of its own handle' end || E'\n';
  r := r || case when public.username_reserved_reason('fakemichi', victim) is not null
                 then '[PASS] the exemption does not leak to other users'
                 else '[FAIL] exemption leaked' end || E'\n';

  r := r || case when public.username_reserved_reason('michimaker', official) is null
                 then '[PASS] @michimaker can still hold its own name'
                 else '[FAIL] brand account locked out of its own handle' end || E'\n';
  r := r || case when public.username_reserved_reason('michimaker', victim) is not null
                 then '[PASS] a stranger cannot take michimaker'
                 else '[FAIL] stranger could take michimaker' end || E'\n';

  begin
    update public.profiles set is_public = is_public where id = official;
    r := r || '[PASS] unrelated profile update unaffected' || E'\n';
  exception when others then r := r || '[FAIL] trigger fired on unrelated update: ' || sqlerrm || E'\n'; end;

  raise exception 'ENFORCEMENT TESTS (all rolled back):%', r;
end $$;
