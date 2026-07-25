-- Contest RLS / leaderboard test. NON-DESTRUCTIVE: everything runs inside a DO block that ends
-- with RAISE EXCEPTION, so the whole transaction rolls back and the results come back as the
-- error message. Safe to run against production; it leaves zero rows behind.
--
-- Run it from the Supabase SQL editor (or any psql session) and read the raised message: every
-- line should start with [PASS]. It borrows two existing profile ids to impersonate (their data
-- is never actually modified, since it all rolls back).
--
-- Covers: the public-page submission cap at entry, the final-category lock, contest_winners
-- being server-write-only, non-owners being unable to enter/withdraw your entry, entry
-- visibility, voting, and the leaderboard (vote count, category isolation, privacy drop-off).

do $$
declare
  ua uuid; ub uuid; b uuid; bbig uuid; r text := E'\n'; n int; cnt int;
begin
  select id into ua from public.profiles order by id limit 1;
  select id into ub from public.profiles where id <> ua order by id limit 1;
  update public.profiles set is_public = true where id in (ua, ub);

  -- Binder A: 16 public + 4 private pages → enterable (the cap counts PUBLIC pages).
  insert into public.binders (id, owner_id, title, is_public)
    values (gen_random_uuid(), ua, 'TEST contest binder', true) returning id into b;
  insert into public.binder_pages (binder_id, position, is_public) select b, g, true from generate_series(0,15) g;
  insert into public.binder_pages (binder_id, position, is_public) select b, g, false from generate_series(16,19) g;

  -- Binder B: 17 public pages → must be rejected.
  insert into public.binders (id, owner_id, title, is_public)
    values (gen_random_uuid(), ua, 'TEST oversized', true) returning id into bbig;
  insert into public.binder_pages (binder_id, position, is_public) select bbig, g, true from generate_series(0,16) g;

  ---------------- as the OWNER ----------------
  execute format('set local request.jwt.claims = %L', json_build_object('sub', ua)::text);
  set local role authenticated;

  begin
    insert into public.contest_entries (binder_id, owner_id, category) values (b, ua, 'aesthetic');
    r := r || '[PASS] owner can enter with 16 public pages (20 total)' || E'\n';
  exception when others then r := r || '[FAIL] enter 16-public rejected: ' || sqlerrm || E'\n';
  end;

  begin
    insert into public.contest_entries (binder_id, owner_id, category) values (bbig, ua, 'meme');
    r := r || '[FAIL] 17 public pages was ACCEPTED' || E'\n';
  exception when others then r := r || '[PASS] 17 public pages blocked at entry' || E'\n';
  end;

  begin
    update public.contest_entries set category = 'meme' where binder_id = b;
    get diagnostics n = row_count;
    if n > 0 then r := r || '[FAIL] category switch ALLOWED' || E'\n';
    else r := r || '[PASS] category switch changed 0 rows' || E'\n'; end if;
  exception when others then r := r || '[PASS] category switch denied (' || sqlstate || ')' || E'\n';
  end;

  begin
    insert into public.contest_winners (contest, category, place, binder_id, owner_id)
      values ('first-annual-2026','aesthetic',1,b,ua);
    r := r || '[FAIL] client could write contest_winners' || E'\n';
  exception when others then r := r || '[PASS] contest_winners write denied' || E'\n';
  end;

  ---------------- as SOMEONE ELSE ----------------
  reset role;
  execute format('set local request.jwt.claims = %L', json_build_object('sub', ub)::text);
  set local role authenticated;

  begin
    insert into public.contest_entries (binder_id, owner_id, category) values (bbig, ub, 'meme');
    r := r || '[FAIL] non-owner entered someone elses binder' || E'\n';
  exception when others then r := r || '[PASS] non-owner cannot enter your binder' || E'\n';
  end;

  delete from public.contest_entries where binder_id = b;
  get diagnostics n = row_count;
  r := r || case when n = 0 then '[PASS] non-owner cannot withdraw your entry'
                 else '[FAIL] non-owner DELETED your entry' end || E'\n';

  select count(*) into cnt from public.contest_entries where binder_id = b;
  r := r || case when cnt = 1 then '[PASS] public entry is visible to others'
                 else '[FAIL] entry not visible to others' end || E'\n';

  insert into public.binder_likes (binder_id, user_id) values (b, ub);
  r := r || '[PASS] other user can vote (like)' || E'\n';

  ---------------- leaderboard ----------------
  reset role;
  select count(*) into cnt from public.contest_leaderboard('first-annual-2026','aesthetic',100)
    where binder_id = b and like_count = 1;
  r := r || case when cnt = 1 then '[PASS] leaderboard shows entry with 1 vote'
                 else '[FAIL] leaderboard missing entry/vote' end || E'\n';

  select count(*) into cnt from public.contest_leaderboard('first-annual-2026','meme',100) where binder_id = b;
  r := r || case when cnt = 0 then '[PASS] entry absent from other categories'
                 else '[FAIL] entry leaked into another category' end || E'\n';

  update public.binders set is_public = false where id = b;
  select count(*) into cnt from public.contest_leaderboard('first-annual-2026','aesthetic',100) where binder_id = b;
  r := r || case when cnt = 0 then '[PASS] private binder drops off the leaderboard'
                 else '[FAIL] private binder still on leaderboard' end || E'\n';

  raise exception 'TEST RESULTS (all rolled back):%', r;
end $$;
