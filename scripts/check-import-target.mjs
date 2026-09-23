/**
 * READ-ONLY. Can @fakemichi actually receive an import, and what would refuse it?
 *
 * Caps in this project are enforced at INSERT by triggers (20260723220000), not by the client, so
 * a bulk import into an account whose tier refuses the tenth binder fails half way and leaves a
 * mess. Ask before writing anything.
 *
 * Run through state/check-import-target.ps1.
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const USERNAME = process.argv[2] ?? 'fakemichi';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

/** Tolerant variant: `sql` exits on any non-200, so an optional probe needs its own path. */
async function trySql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) return null;
  return JSON.parse(await res.text());
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const esc = (s) => String(s).replace(/'/g, "''");

console.log(`Step 1: resolving @${USERNAME}`);
const who = await sql(`
  select p.id, p.username, p.is_admin, u.created_at, u.email is not null as has_email
  from public.profiles p join auth.users u on u.id = p.id
  where lower(p.username) = lower('${esc(USERNAME)}') limit 1;
`);
if (!who.length) fail(`no profile with username '${USERNAME}'. Check the spelling, or the account has not claimed a username.`);
const me = who[0];
console.log(`  ${me.id}  @${me.username}  created ${String(me.created_at).slice(0, 10)}  admin=${me.is_admin}`);

console.log('\nStep 2: what they hold now');
const ent = await sql(`
  select product, source, interval, expires_at
  from public.entitlements where user_id = '${me.id}' order by granted_at desc;
`);
if (!ent.length) console.log('  (no entitlement rows: this is a Free account)');
for (const e of ent) {
  const live = e.expires_at === null || new Date(e.expires_at) > new Date();
  console.log(`  ${live ? 'ACTIVE ' : 'lapsed '} ${e.product} - ${e.source} - ${e.interval ?? 'no interval'} - expires ${e.expires_at ?? 'never'}`);
}

console.log('\nStep 3: the caps the server would enforce');
const caps = await trySql(`
  select public.michi_tier('${me.id}'::uuid) as tier,
         (select count(*) from public.binders where owner_id = '${me.id}' and archived_at is null and coalesce(is_demo, false) = false) as binders_now;
`);
if (caps) console.log(`  server-derived tier: ${caps[0].tier}   binders today: ${caps[0].binders_now}`);

// The columns are (app, limit_key, tier, value), NOT (tier, key, value); the first version of
// this script guessed and silently printed nothing, which is exactly the failure mode a
// pre-flight check exists to prevent. A NULL value means unlimited.
const capRows = await trySql(`
  select tier, limit_key, value from public.tier_caps
  where app = 'michi' and limit_key in ('binders', 'pagesPerBinder') order by tier, limit_key;
`) ?? [];
if (capRows.length) {
  console.log('  tier_caps (michi), null = unlimited:');
  for (const c of capRows) {
    console.log(`    ${String(c.tier).padEnd(12)} ${String(c.limit_key).padEnd(16)} ${c.value ?? 'unlimited'}`);
  }
}

console.log('\nStep 4: the verdict');
const tier = caps?.[0]?.tier ?? 'unknown';
const held = caps?.[0]?.binders_now ?? '?';
// PRO and VIP are Infinity for binders and pages (src/data/tiers.ts). Only Free is finite, and it
// is finite in two flavours depending on when the account signed up, which the server decides.
const row = capRows.find((c) => c.tier === tier && c.limit_key === 'binders');
// null in tier_caps IS the unlimited marker; an absent row means the tier is not capped here.
const unlimited = !row || row.value === null;
console.log(`  tier=${tier}  binders held=${held}  binder cap=${unlimited ? 'unlimited' : 'FINITE'}`);
if (unlimited) {
  console.log('  OK: the caps will not refuse an import of a handful of binders.');
} else {
  console.log('  CAREFUL: a Free account has a small binder cap and the server enforces it at');
  console.log('  INSERT, so a bulk import would fail part way and leave half a binder behind.');
  console.log('  Give the account PRO first, or import fewer binders than the cap allows.');
}
console.log('  Nothing has been written.');
