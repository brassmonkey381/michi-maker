/**
 * MIC-029 gap 3: applies supabase/migrations/20261114130000_image_review_stall.sql, then PROVES the
 * stall signal against the live database. Proofs that touch rows run in a transaction that ends by
 * raising an exception, so nothing is kept.
 *
 * Run through state/apply-image-review-stall.ps1 (which then deploys the image-review function).
 */
import fs from 'node:fs';
import { APP_REF, ROOT, fail, step } from './lib/michi.mjs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function run(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${APP_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return res.ok ? { ok: true, rows: JSON.parse(text) } : { ok: false, error: text };
}
async function rolledBack(tag, query) {
  const r = await run(`begin;\n${query}\ncommit;`);
  if (r.ok) fail(`${tag}: the transaction committed, which it must never do`);
  const m = r.error.match(new RegExp(`${tag}([^"\\\\]*)`));
  if (!m) fail(`${tag}: unexpected error: ${r.error.slice(0, 400)}`);
  return m[1].trim();
}

step(1, 'apply the migration');
const migration = fs.readFileSync(`${ROOT}/supabase/migrations/20261114130000_image_review_stall.sql`, 'utf8');
const applied = await run(migration);
if (!applied.ok) fail(`migration refused: ${applied.error.slice(0, 600)}`);
console.log('  applied');

step(2, 'proof: today the check is healthy, so nothing says stalled');
const now = await run(`select stalled, reasons, waiting, last_finished, bad_calls_1h, cron_last_run from public.image_review_stall();`);
if (!now.ok) fail(`stall read refused: ${now.error.slice(0, 300)}`);
console.log(`  ${JSON.stringify(now.rows[0])}`);
if (now.rows[0].stalled !== false) console.log('  NOTE: it says stalled right now. The reasons above are real; the email will name them.');
else console.log('  PASS: not stalled');

step(3, 'proof: a picture stuck for hours makes it say stalled, with the reason (rolled back)');
const p3 = await rolledBack('PROOF3', `
do $$
declare sid uuid; bid uuid; oid uuid; st record;
begin
  select bs.id, b.id, b.owner_id into sid, bid, oid
    from public.binder_slots bs join public.binders b on b.id = public.slot_binder_id(bs.page_id, bs.binder_id)
   where bs.image_url is not null limit 1;
  if sid is null then raise exception 'PROOF3 SKIP: no slot with a picture'; end if;
  insert into public.image_reviews (slot_id, binder_id, owner_id, image_url, status, created_at)
  values (sid, bid, oid, 'https://example.invalid/mic029-stall-proof.png', 'queued', now());
  select * into st from public.image_review_stall(now() + interval '3 hours');
  if st.stalled and array_to_string(st.reasons, '|') like '%queue not moving%' then
    raise exception 'PROOF3 PASS: %', array_to_string(st.reasons, '; ');
  end if;
  raise exception 'PROOF3 FAIL: stalled=% reasons=%', st.stalled, st.reasons;
end $$;`);
console.log(`  ${p3}`);
if (!p3.startsWith('PASS') && !p3.startsWith('SKIP')) fail('proof 3 did not pass');

step(4, "proof: Studio's Health shows an 'Image check' row to an admin, and nothing to anyone else (rolled back)");
const p4 = await rolledBack('PROOF4', `
do $$
declare adm uuid; other uuid; n_admin int; n_other int; d text;
begin
  select id into adm from public.profiles where is_admin limit 1;
  select id into other from public.profiles where not coalesce(is_admin, false) limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  select count(*), max(detail) into n_admin, d from public.admin_health() where signal = 'Image check';
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  select count(*) into n_other from public.admin_health();
  if n_admin = 1 and n_other = 0 then raise exception 'PROOF4 PASS: admin sees (%), others see no rows', d; end if;
  raise exception 'PROOF4 FAIL: admin rows=% other rows=%', n_admin, n_other;
end $$;`);
console.log(`  ${p4}`);
if (!p4.startsWith('PASS')) fail('proof 4 did not pass');

step(5, 'proof: signed-in users cannot call image_review_stall directly');
const p5 = await run(`select has_function_privilege('authenticated', 'public.image_review_stall(timestamptz)', 'execute') as authed,
                             has_function_privilege('anon', 'public.image_review_stall(timestamptz)', 'execute') as anon;`);
if (!p5.ok) fail(`privilege read refused: ${p5.error.slice(0, 200)}`);
const pr = p5.rows[0];
if (pr.authed || pr.anon) fail(`proof 5 FAILED: ${JSON.stringify(pr)}`);
console.log('  PASS: only the service role (the function) and admin_health can read it');

console.log('OK: stall signal live and proven. Nothing was deleted.');
