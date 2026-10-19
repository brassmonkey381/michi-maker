/**
 * Apply supabase/migrations/20261018160000_studio_money_dropoffs_health.sql and prove it.
 *
 * Three admin reads for /studio: admin_money_ledger(), admin_dropoffs(app, days), admin_health().
 *
 *   1. Apply. Re-runnable: create or replace.
 *   2. The three functions exist and are granted to authenticated only.
 *   3. Each body runs inside the 8s authenticated timeout (measured without the is_admin() gate,
 *      which the Management API cannot satisfy) and returns the shape the client expects.
 *
 * No row is written. Run with SUPABASE_ACCESS_TOKEN in the environment:
 *   node scripts/apply-studio-ops.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261018160000_studio_money_dropoffs_health.sql');
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

console.log('Step 1: apply the migration');
await sql(migration);
console.log('  applied');

console.log('Step 2: the functions exist, authenticated only');
const fns = await sql(`
  select p.proname,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
         has_function_privilege('anon', p.oid, 'execute') as anon_ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('admin_money_ledger', 'admin_dropoffs', 'admin_health');
`);
if (fns.length !== 3) fail(`expected 3 functions, found ${fns.length}`);
for (const f of fns) {
  if (!f.auth_ok) fail(`${f.proname} is not executable by authenticated`);
  if (f.anon_ok) fail(`${f.proname} is executable by anon`);
}
console.log('  all three present; authenticated yes, anon no');

// The bodies, with `public.is_admin()` replaced by true so they run from here.
const body = (name) => {
  const m = migration.match(new RegExp(`create or replace function public\\.${name}\\([^$]*?\\$\\$([\\s\\S]*?)\\$\\$;`));
  if (!m) fail(`could not find the body of ${name} in the migration`);
  return m[1].replace(/public\.is_admin\(\)/g, 'true');
};

console.log('Step 3: each body is fast and shaped right');
const timed = async (label, q, check) => {
  const t = Date.now();
  const rows = await sql(q);
  const ms = Date.now() - t;
  console.log(`  ${label}: ${rows.length} rows in ${ms} ms`);
  if (ms > 6000) fail(`${label} took ${ms} ms; the 8s authenticated timeout is at risk`);
  check(rows);
};
await timed('money ledger', body('admin_money_ledger'), (rows) => {
  for (const k of ['kind', 'app', 'user_id', 'product', 'granted_at']) if (rows.length && !(k in rows[0])) fail(`money ledger lacks ${k}`);
  const kinds = new Set(rows.map((r) => r.kind));
  console.log(`    kinds: ${[...kinds].join(', ')} · apps: ${[...new Set(rows.map((r) => r.app))].join(', ')}`);
});
for (const app of ['michi', 'tcgscan']) {
  await timed(`drop-offs ${app} 7d`, body('admin_dropoffs').replace(/p_app/g, `'${app}'`).replace(/p_days/g, '7'), (rows) => {
    for (const k of ['last_event', 'sessions', 'guest_sessions', 'median_events']) if (rows.length && !(k in rows[0])) fail(`drop-offs lacks ${k}`);
    if (rows[0]) console.log(`    top: ${rows[0].last_event}${rows[0].last_route ? ` ${rows[0].last_route}` : ''} x${rows[0].sessions}`);
  });
}
await timed('health', body('admin_health'), (rows) => {
  if (rows.length !== 8) fail(`health returned ${rows.length} signals, expected 8`);
  for (const r of rows) console.log(`    ${r.signal}: ${r.at ?? 'never'} · ${r.detail}`);
});

console.log('OK: /studio has money, drop-offs and health to read.');
