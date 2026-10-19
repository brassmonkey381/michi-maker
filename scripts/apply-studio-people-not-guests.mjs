/**
 * Apply supabase/migrations/20261019120000_studio_people_not_guests.sql and prove it.
 *
 * /studio stops counting guests (anonymous auth users) in the user list, where-sessions-end and
 * the two "event recorded" health signals, and stops counting our own and QA accounts in the
 * community-growth strip.
 *
 *   1. Apply. Re-runnable: create or replace, and admin_dropoffs is dropped before it is recreated.
 *   2. The four functions exist, authenticated yes, anon no.
 *   3. Each body runs inside the 8s authenticated timeout (measured without the is_admin() gate,
 *      which the Management API cannot satisfy) and the exclusions did something:
 *      no anonymous user in the list, no guest session in the drop-offs, growth totals at or
 *      below the public totals for the same day.
 *
 * No row is written. Run with SUPABASE_ACCESS_TOKEN in the environment:
 *   node scripts/apply-studio-people-not-guests.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261019120000_studio_people_not_guests.sql');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set.');

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

const migration = readFileSync(MIGRATION, 'utf8');
const FNS = ['admin_recent_users', 'admin_dropoffs', 'admin_health', 'admin_community_growth'];

console.log('Step 1: apply the migration');
await sql(migration);
console.log('  applied');

console.log('Step 2: the functions exist, authenticated only');
const fns = await sql(`
  select p.proname,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
         has_function_privilege('anon', p.oid, 'execute') as anon_ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (${FNS.map((f) => `'${f}'`).join(', ')});
`);
if (fns.length !== FNS.length) fail(`expected ${FNS.length} functions, found ${fns.length}: ${fns.map((f) => f.proname).join(', ')}`);
for (const f of fns) {
  if (!f.auth_ok) fail(`${f.proname} is not executable by authenticated`);
  if (f.anon_ok) fail(`${f.proname} is executable by anon`);
}
console.log('  all four present; authenticated yes, anon no');

// The bodies, with `public.is_admin()` replaced by true so they run from here.
const body = (name) => {
  const m = migration.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([^$]*?\\$\\$([\\s\\S]*?)\\$\\$;`));
  if (!m) fail(`could not find the body of ${name} in the migration`);
  return m[1].replace(/public\.is_admin\(\)/g, 'true');
};
const timed = async (label, q) => {
  const t = Date.now();
  const rows = await sql(q);
  const ms = Date.now() - t;
  console.log(`  ${label}: ${rows.length} rows in ${ms} ms`);
  if (ms > 6000) fail(`${label} took ${ms} ms; the 8s authenticated timeout is at risk`);
  return rows;
};

console.log('Step 3: each body is fast, shaped right, and the exclusions bite');
for (const app of ['michi', 'tcgscan']) {
  const users = await timed(
    `user list ${app}`,
    body('admin_recent_users').replace(/p_app/g, `'${app}'`).replace(/p_limit/g, '200'),
  );
  if (users.length) {
    const anon = await sql(`
      select count(*)::int as n from auth.users u
      where u.is_anonymous and u.id in (${users.map((u) => `'${u.user_id}'`).join(', ')});`);
    if (anon[0].n) fail(`user list ${app} still holds ${anon[0].n} anonymous user(s)`);
    console.log(`    top: ${users[0].username ? '@' + users[0].username : users[0].user_id.slice(0, 8)} · none anonymous`);
  }
}
for (const app of ['michi', 'tcgscan']) {
  const rows = await timed(
    `drop-offs ${app} 7d`,
    body('admin_dropoffs').replace(/p_app/g, `'${app}'`).replace(/p_days/g, '7'),
  );
  for (const k of ['last_event', 'sessions', 'median_events', 'last_at']) if (rows.length && !(k in rows[0])) fail(`drop-offs lacks ${k}`);
  if (rows.length && 'guest_sessions' in rows[0]) fail('drop-offs still returns guest_sessions');
  if (rows[0]) console.log(`    top: ${rows[0].last_event}${rows[0].last_route ? ` ${rows[0].last_route}` : ''} x${rows[0].sessions}`);
}
const health = await timed('health', body('admin_health'));
if (health.length !== 8) fail(`health returned ${health.length} signals, expected 8`);
for (const r of health) if (/event recorded/.test(r.signal)) console.log(`    ${r.signal}: ${r.at ?? 'never'} · ${r.detail}`);

const growth = await timed('community growth 30d', body('admin_community_growth').replace(/p_days/g, '30'));
const pub = await sql(`select day, collectors, binders_built, pages_built, cards_placed, artwork_placed
  from public.community_stats_daily where day > current_date - 30 order by day;`);
const byDay = new Map(pub.map((r) => [r.day, r]));
let shaved = 0;
for (const g of growth) {
  const p = byDay.get(g.day);
  if (!p) fail(`growth has day ${g.day} that the public table lacks`);
  for (const k of ['collectors', 'binders_built', 'pages_built', 'cards_placed', 'artwork_placed']) {
    if (Number(g[k]) < 0) fail(`growth ${k} is negative on ${g.day}`);
    if (Number(g[k]) > Number(p[k])) fail(`growth ${k} on ${g.day} (${g[k]}) exceeds the public total (${p[k]})`);
    if (Number(g[k]) < Number(p[k])) shaved++;
  }
}
const last = growth[growth.length - 1];
const lastPub = last && byDay.get(last.day);
if (last) {
  console.log(`    ${last.day}: binders ${last.binders_built} (public ${lastPub.binders_built}), cards ${last.cards_placed} (public ${lastPub.cards_placed}), collectors ${last.collectors} (public ${lastPub.collectors})`);
}
if (!shaved) fail('growth equals the public totals on every day: the exclusion removed nothing');
console.log(`    ${shaved} day-metric cells lower than the public totals`);

console.log('OK: /studio counts signed-in people, and the growth strip leaves us out.');
