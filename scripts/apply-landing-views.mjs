/**
 * MKT-040 landing.view: applies supabase/migrations/20261118120000_landing_views.sql, then PROVES it
 * against the live database. Proofs that write run in a transaction that ends by raising, so they
 * keep nothing. With --live <utm_source>, instead checks that a real landing load (the ship wrapper
 * drives one with utm_medium=qa) wrote its row.
 *
 * Run through state/ship-mkt040-beacon.ps1. Reads SUPABASE_ACCESS_TOKEN via lib/michi.mjs, silently.
 */
import fs from 'node:fs';
import { appSql, fail, ROOT, step } from './lib/michi.mjs';

const live = process.argv.indexOf('--live');
if (live > -1) {
  const src = process.argv[live + 1];
  if (!/^[a-z0-9_]+$/.test(src || '')) fail('--live needs a utm_source made of a-z, 0-9, _');
  step('L', `a landing view with utm_source=${src} landed in the last 15 minutes`);
  const rows = await appSql(`select count(*)::int n, bool_and(is_qa) qa, max(ts) last
    from public.landing_views where params->>'utm_source' = '${src}' and ts > now() - interval '15 minutes';`);
  const r = rows[0];
  if (!r || r.n < 1) fail(`no landing_views row for utm_source=${src}`);
  if (!r.qa) fail('the row is not marked is_qa');
  console.log(`  PASS: ${r.n} row(s), is_qa, last ${r.last}`);
  process.exit(0);
}

async function rolledBack(tag, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/piikwvntldytjejxmcla/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `begin;\n${body}\ncommit;` }),
  });
  const text = await res.text();
  if (res.ok) fail(`${tag}: the transaction committed, which it must never do`);
  let msg = text;
  try { msg = JSON.parse(text).message ?? text; } catch {}
  const at = msg.indexOf(`${tag} {`);
  if (at < 0) fail(`${tag}: unexpected error: ${text.slice(0, 400)}`);
  const json = msg.slice(at + tag.length + 1, msg.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

step(1, 'apply 20261118120000_landing_views.sql');
await appSql(fs.readFileSync(`${ROOT}/supabase/migrations/20261118120000_landing_views.sql`, 'utf8'));
console.log('  applied');

step(2, 'proof: RLS on with no policies; anon may call the function and nothing else');
const [g] = await appSql(`select
  (select relrowsecurity from pg_class where oid = 'public.landing_views'::regclass) rls,
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'landing_views') policies,
  has_function_privilege('anon', 'public.log_landing_view(text,jsonb,text,int,boolean,text)', 'execute') anon_exec,
  has_table_privilege('anon', 'public.landing_views', 'select') anon_select_grant;`);
console.log(`  ${JSON.stringify(g)}`);
if (!g.rls || g.policies !== 0 || !g.anon_exec) fail('proof 2 FAILED');
console.log('  PASS (any table grant to anon is inert: RLS on, zero policies)');

step(3, 'proof: as anon, junk is trimmed and a direct read sees nothing (rolled back)');
const p3 = await rolledBack('PROOF3', `
do $$
declare r record; seen int;
begin
  set local role anon;
  perform public.log_landing_view('not-a-uuid',
    '{"utm_medium":"qa","utm_source":"proof3","code":"x","evil":"y","utm_long":"${'z'.repeat(300)}"}'::jsonb,
    'Bad Host/with path', 99999, null, 'javascript:alert(1)');
  select count(*) into seen from public.landing_views;
  reset role;
  select * into r from public.landing_views order by ts desc limit 1;
  raise exception 'PROOF3 %', json_build_object('anon_sees', seen, 'device', r.device_id, 'keys',
    (select array_agg(k order by k) from jsonb_object_keys(r.params) k), 'long_len', length(r.params->>'utm_long'),
    'ref', r.referrer_host, 'width', r.width, 'page', r.page, 'qa', r.is_qa, 'headless', r.headless);
end $$;`);
console.log(`  ${JSON.stringify(p3)}`);
const ok3 = p3.anon_sees === 0 && p3.device === null && JSON.stringify(p3.keys) === '["code","utm_long","utm_medium","utm_source"]'
  && p3.long_len === 128 && p3.ref === null && p3.width === null && p3.page === '/landing-v2' && p3.qa === true && p3.headless === false;
if (!ok3) fail('proof 3 FAILED');
console.log('  PASS');
console.log('DONE: landing_views and log_landing_view are live.');
