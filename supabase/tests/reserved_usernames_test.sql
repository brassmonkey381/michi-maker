-- Reserved-username tests. READ-ONLY for part 1 (pure function calls); part 2 runs inside a DO
-- block ending in RAISE EXCEPTION, so it rolls back and leaves nothing behind. Safe on production.
--
-- Part 1 is the one that matters most: it asserts BOTH directions. Blocking impersonation is easy;
-- the hard part is not blocking real people. "michigan", "michiko", "michio" and "fakemichi" are
-- regression cases — a CONTAINS rule that normalised down to "michi" once blocked all of them.

-- ── Part 1: matching, both directions ──────────────────────────────────────────────────────
with cases(u, should_block) as (values
  -- impersonation (must ALL block)
  ('michimaker',true),('michi_maker',true),('m1ch1maker',true),('m1ch1m4k3r',true),
  ('rnichimaker',true),('michiimaker',true),('michimaker2026',true),('xxmichimakerxx',true),
  ('officialmichi',true),('themichi',true),('realmichi',true),('michi',true),('m_i_c_h_i',true),
  ('michihq',true),('michimethod',true),('m1ch1',true),('MICHIMAKER',true),('michimakerr',true),
  ('michi__maker',true),('michimakr',true),('michibinder',true),('teammichi',true),
  ('peeplop',true),('peep_lop',true),('p33plop',true),('peeeplop',true),('peplop',true),
  ('admin',true),('adm1n',true),('support',true),('m0derator',true),('n0reply',true),
  ('discover',true),('contest',true),('null',true),
  -- legitimate handles (must ALL be allowed)
  ('michigan',false),('michiko',false),('michio',false),('michelle',false),('mitchell',false),
  ('brassmonkey381',false),('fakemichi',false),('pokefan',false),('theresa',false),
  ('matthew',false),('mike',false),('modest_mouse',false),('binderqueen',false),
  ('michi_fan_2026',false),('notmichigan',false),('charizard',false)
)
select case when count(*) = 0 then 'PASS: all matching cases correct'
            else 'FAIL:' || string_agg(u || ' -> ' || coalesce(public.username_reserved_reason(u),'ALLOWED')
                                        || ' [norm=' || public.normalize_username(u) || ']', E'\n') end as result
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
    r := r || '[PASS] legitimate "michigan" allowed' || E'\n';
  exception when others then r := r || '[FAIL] legitimate name blocked: ' || sqlerrm || E'\n'; end;

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
