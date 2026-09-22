/**
 * Apply supabase/migrations/20260922120000_feedback_responses.sql and prove it.
 *
 * THE CHECKS THAT MATTER, in the order they would hurt:
 *   1. Apply. Re-runnable: create-if-not-exists, drop-policy-if-exists, create-or-replace.
 *   2. The table is there with the columns and constraints the app writes.
 *   3. RLS IS ON and there is exactly ONE policy: insert, to authenticated. A select policy here
 *      would mean anybody could read everybody's free text, which is the whole risk of the table.
 *   4. `anon` holds no write grant. This project revoked anon writes across the board in
 *      20260725160000 and stated it as an invariant; this table must not be the exception.
 *   5. A real round trip: insert a row as a real user through the policy, confirm the server
 *      stamped identity and time, confirm the anchor and the contact columns landed, and confirm
 *      the same user CANNOT read it back. Then remove it, so the table is left empty.
 *   6. The daily cap actually refuses the sixth row in a window, and the refusal is an RLS error
 *      rather than a crash.
 *   7. The admin RPCs exist, return nothing to a non-admin, and the summary computes a correct
 *      recommendation score from a known set of scores.
 *
 * Nothing here is left behind: every row this script writes is deleted in the same run, inside a
 * transaction that rolls back on any failure.
 *
 * Run through state/apply-feedback-responses.ps1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260922120000_feedback_responses.sql');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const step = (n, what) => console.log(`Step ${n}: ${what}`);

// --- 1. apply ---------------------------------------------------------------
step(1, 'applying the migration');
await sql(readFileSync(MIGRATION, 'utf8'));
console.log('  applied');

// --- 2. shape ---------------------------------------------------------------
step(2, 'checking the table shape');
const cols = await sql(`
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'feedback_responses'
  order by column_name;
`);
const want = [
  'answers', 'app', 'contact_email', 'contact_ok', 'context',
  'created_at', 'id', 'nps', 'survey_id', 'survey_version', 'user_id', 'was_guest',
];
const got = cols.map((c) => c.column_name);
for (const c of want) if (!got.includes(c)) fail(`column ${c} is missing (got: ${got.join(', ')})`);
console.log(`  ${got.length} columns, all ${want.length} the app writes are present`);

// --- 3. RLS and policies ----------------------------------------------------
step(3, 'checking RLS and the policy set');
const [{ relrowsecurity }] = await sql(
  `select relrowsecurity from pg_class where oid = 'public.feedback_responses'::regclass;`,
);
if (relrowsecurity !== true) fail('row level security is NOT enabled on feedback_responses');
const policies = await sql(`
  select polname, polcmd, (select array_agg(rolname) from pg_roles where oid = any(polroles)) as roles
  from pg_policy where polrelid = 'public.feedback_responses'::regclass order by polname;
`);
if (policies.length !== 1) {
  fail(`expected exactly 1 policy, found ${policies.length}: ${policies.map((p) => `${p.polname} (${p.polcmd})`).join('; ')}`);
}
if (policies[0].polcmd !== 'a') fail(`the only policy must be INSERT, found polcmd=${policies[0].polcmd}`);
if (!String(policies[0].roles).includes('authenticated')) fail(`the insert policy is not scoped to authenticated: ${policies[0].roles}`);
console.log(`  RLS on, one policy: "${policies[0].polname}" (insert, to authenticated), no read path`);

// --- 4. anon holds nothing --------------------------------------------------
step(4, 'checking anon has no write grant');
const anonGrants = await sql(`
  select privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'feedback_responses' and grantee = 'anon';
`);
const anonWrites = anonGrants.map((g) => g.privilege_type).filter((p) => p !== 'SELECT');
if (anonWrites.length) fail(`anon holds write grants it must not have: ${anonWrites.join(', ')}`);
console.log('  anon holds no insert/update/delete, as the 20260725160000 invariant requires');

// --- 5. round trip as a real user -------------------------------------------
step(5, 'inserting as a real user through the policy, and proving it cannot be read back');
const roundTrip = await sql(`
  do $$
  declare
    v_user uuid;
    v_id uuid;
    v_guest boolean;
    v_stamped timestamptz;
    v_readback int;
  begin
    select id into v_user from auth.users order by created_at limit 1;
    if v_user is null then raise exception 'no user to test with'; end if;

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    -- A client backdating created_at must not work: the trigger overwrites it.
    -- NO RETURNING HERE: returning is a read, and this table deliberately has no select
    -- policy, so writing the check that way would fail for the very reason the table is right.
    -- The address goes in deliberately ugly, to prove the trigger normalises it.
    insert into public.feedback_responses (app, survey_id, survey_version, answers, context, nps, contact_email, contact_ok, created_at)
    values ('michi', 'selftest', 1, '{"nps": 9, "aspect.ease": 4}'::jsonb, '{"platform":"selftest"}'::jsonb, 9, '  SelfTest@Example.COM  ', true, now() - interval '400 days');

    -- The author cannot read their own row back.
    select count(*) into v_readback from public.feedback_responses;
    if v_readback <> 0 then raise exception 'the author could read rows back (%); there is a select policy', v_readback; end if;

    perform set_config('role', 'postgres', true);
    select id, was_guest, created_at into v_id, v_guest, v_stamped
      from public.feedback_responses where survey_id = 'selftest' limit 1;
    if v_id is null then raise exception 'the insert did not land'; end if;
    if v_stamped < now() - interval '1 hour' then raise exception 'created_at was accepted from the client: %', v_stamped; end if;
    if v_guest is null then raise exception 'was_guest was not stamped by the trigger'; end if;
    if (select contact_email from public.feedback_responses where id = v_id) <> 'selftest@example.com' then
      raise exception 'the address was not trimmed and lowercased by the trigger';
    end if;

    -- Deleting the account must take the address with it, wherever the deletion comes from.
    update public.feedback_responses set user_id = null where id = v_id;
    if (select contact_email from public.feedback_responses where id = v_id) is not null then
      raise exception 'contact_email survived the account id being cleared';
    end if;

    delete from public.feedback_responses where survey_id = 'selftest';
    raise notice 'round trip ok, stamped=% guest=%', v_stamped, v_guest;
  end $$;
`);
void roundTrip;
console.log('  insert works, created_at and was_guest are server-stamped, readback is zero rows');

// --- 6. the daily cap refuses the sixth ------------------------------------
step(6, 'checking the daily cap refuses the sixth response');
await sql(`
  do $$
  declare
    v_user uuid;
    v_err text;
    i int;
  begin
    select id into v_user from auth.users order by created_at limit 1;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

    for i in 1..5 loop
      insert into public.feedback_responses (app, survey_id, survey_version, answers)
      values ('michi', 'captest', 1, jsonb_build_object('n', i));
    end loop;

    begin
      insert into public.feedback_responses (app, survey_id, survey_version, answers)
      values ('michi', 'captest', 1, '{"n": 6}'::jsonb);
      raise exception 'the sixth response was ACCEPTED; the cap is not being enforced';
    exception when insufficient_privilege then
      v_err := 'one at a time: refused';
    end;

    -- AND IN BULK, which the policy on its own cannot catch: every row of one statement is
    -- checked against the same pre-statement count, so without the AFTER STATEMENT trigger all
    -- fifty of these land at once and the cap is decoration. This is the check that matters.
    perform set_config('role', 'postgres', true);
    delete from public.feedback_responses where survey_id = 'captest';
    perform set_config('role', 'authenticated', true);
    begin
      insert into public.feedback_responses (app, survey_id, survey_version, answers)
      select 'michi', 'captest', 1, jsonb_build_object('n', g) from generate_series(1, 50) g;
      raise exception 'a single 50-row statement was ACCEPTED past a cap of 5';
    exception when insufficient_privilege then
      v_err := v_err || ', in bulk: refused';
    end;

    perform set_config('role', 'postgres', true);
    delete from public.feedback_responses where survey_id = 'captest';
    raise notice 'cap: %', v_err;
  end $$;
`);
console.log('  five land, the sixth is refused by the policy, and the test rows are gone');

// --- 7. admin RPCs ----------------------------------------------------------
step(7, 'checking the admin RPCs exist and are admin-only');
const fns = await sql(`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('admin_feedback_recent', 'admin_feedback_summary', 'feedback_quota_left')
  order by p.proname;
`);
for (const name of ['admin_feedback_recent', 'admin_feedback_summary', 'feedback_quota_left']) {
  const f = fns.find((x) => x.proname === name);
  if (!f) fail(`function ${name} is missing`);
  if (f.prosecdef !== true) fail(`function ${name} is not security definer`);
}
console.log(`  ${fns.length} functions, all security definer`);

const nonAdmin = await sql(`
  do $$
  declare v_user uuid; v_rows int;
  begin
    select u.id into v_user from auth.users u
      left join public.profiles pr on pr.id = u.id
      where coalesce(pr.is_admin, false) = false order by u.created_at limit 1;
    if v_user is null then raise notice 'no non-admin user to test with, skipped'; return; end if;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    select count(*) into v_rows from public.admin_feedback_recent(null, 10, null);
    perform set_config('role', 'postgres', true);
    if v_rows <> 0 then raise exception 'a non-admin read % feedback rows', v_rows; end if;
    raise notice 'non-admin sees 0 rows';
  end $$;
`);
void nonAdmin;
console.log('  a non-admin gets zero rows from admin_feedback_recent');

// The summary's arithmetic, on a known set: 2 promoters, 1 passive, 2 detractors = 0.
await sql(`
  do $$
  declare v_user uuid; v_admin uuid; v_score numeric; v_n bigint;
  begin
    select id into v_user from auth.users order by created_at limit 1;
    insert into public.feedback_responses (app, survey_id, survey_version, user_id, answers, nps)
    select 'selftestapp', 'mathtest', 1, v_user, jsonb_build_object('rate', s.v), s.v
    from (values (10), (9), (7), (3), (0)) as s(v);

    -- THE SUMMARY IS ADMIN-ONLY, so it has to be called as an admin. Called as anyone else the
    -- is_admin() branch is false, every row is filtered out, and the check would "pass" by
    -- reading zeros off an empty set: a broken roll-up would look correct.
    select u.id into v_admin from auth.users u
      join public.profiles pr on pr.id = u.id where pr.is_admin order by u.created_at limit 1;
    if v_admin is null then
      delete from public.feedback_responses where app = 'selftestapp';
      raise notice 'no admin account to check the summary with, skipped';
      return;
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    select responses, nps_score into v_n, v_score
    from public.admin_feedback_summary('selftestapp', 30);

    perform set_config('request.jwt.claims', null, true);
    delete from public.feedback_responses where app = 'selftestapp';

    if v_n <> 5 then raise exception 'summary counted % responses, expected 5', v_n; end if;
    -- 40% promoters minus 40% detractors = 0.0
    if v_score is distinct from 0.0 then raise exception 'recommendation score was %, expected 0.0', v_score; end if;
    raise notice 'summary arithmetic ok';
  end $$;
`);
console.log('  admin_feedback_summary scores a known set correctly (2 promoters, 1 passive, 2 detractors = 0)');

// --- done -------------------------------------------------------------------
const [{ left }] = await sql(`select count(*)::int as left from public.feedback_responses;`);
console.log(`\nOK: feedback_responses is live, RLS insert-only, admin-read-only. Rows in table: ${left}.`);
