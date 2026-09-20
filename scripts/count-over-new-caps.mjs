/**
 * READ-ONLY. How many FREE michi-maker accounts sit at or over the proposed Free caps
 * (2 binders, 9 pages per binder, 25 kept artworks)? Prints COUNTS ONLY: no ids, no emails.
 *
 * Reads four tables and the auth user list through the project's REST API with APP_SECRET_KEY
 * (loaded by count-over-new-caps.ps1 from tcgscan.secrets; never printed), then aggregates here.
 * Only the columns needed to count are selected. Nothing is written anywhere.
 *
 * "Free"   = a real (non-anonymous) account with no ACTIVE tier_pro / tier_vip entitlement.
 * "Lapsed" = ever held a tier_pro / tier_vip row: the only accounts the nightly
 *            reclaim_all_over_cap() would ARCHIVE binders for if the Free binder cap dropped.
 */
const BASE = 'https://piikwvntldytjejxmcla.supabase.co';
const key = process.env.APP_SECRET_KEY;
if (!key) {
  console.error('FAILED: APP_SECRET_KEY is not set');
  process.exit(2);
}
// A new-style key (sb_secret_...) goes in `apikey` alone; a legacy service_role JWT also needs Bearer.
const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };

const NEW = { binders: 2, pages: 9, art: 25 };
const PAGE = 1000;

async function all(path) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${BASE}/rest/v1/${path}`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) {
      console.error(`FAILED: ${path.split('?')[0]} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
      process.exit(3);
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/**
 * EXCLUSIONS. Owner, house, test and persona accounts are not customers. Patterns come from
 * count-exclude.txt beside the .ps1 (one per line, `*` is a wildcard, `#` starts a comment), plus
 * MICHI_TEST_EMAIL from the environment, every user in public.staff_accounts, and every account
 * the persona seeder stamped `user_metadata.seeded_persona = true`. Emails are
 * matched HERE and never printed; only how many accounts each rule removed is reported.
 */
import { existsSync, readFileSync } from 'node:fs';
const excludeFile = process.env.COUNT_EXCLUDE_FILE ?? '';
const patterns = (existsSync(excludeFile) ? readFileSync(excludeFile, 'utf8').split(String.fromCharCode(10)) : [])
  .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
  .filter(Boolean);
if (process.env.MICHI_TEST_EMAIL) patterns.push(process.env.MICHI_TEST_EMAIL.trim().toLowerCase());
const escapeRe = (x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const asRegex = (p) => new RegExp('^' + p.split('*').map(escapeRe).join('.*') + '$');
const rules = patterns.map((p) => ({ p, re: asRegex(p), hits: 0 }));
let staffHits = 0;
let personaHits = 0;
/** uid → { email, created, seen } for the accounts that are counted. Used only by the detail table. */
const account = new Map();

async function realUserIds() {
  const staff = new Set((await all('staff_accounts?select=user_id')).map((r) => r.user_id));
  const ids = new Set();
  for (let page = 1; ; page++) {
    const res = await fetch(`${BASE}/auth/v1/admin/users?page=${page}&per_page=${PAGE}`, { headers });
    if (!res.ok) {
      console.error(`FAILED: auth user list returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
      process.exit(3);
    }
    const body = await res.json();
    const users = body.users ?? [];
    for (const u of users) {
      if (u.is_anonymous) continue;
      if (staff.has(u.id)) { staffHits += 1; continue; }
      // The house personas: state/personas/seed-personas.mjs stamps every account it creates.
      if (u.user_metadata?.seeded_persona === true) { personaHits += 1; continue; }
      const email = (u.email ?? '').toLowerCase();
      const rule = rules.find((r) => r.re.test(email));
      if (rule) { rule.hits += 1; continue; }
      ids.add(u.id);
      account.set(u.id, { email, created: (u.created_at ?? '').slice(0, 10), seen: (u.last_sign_in_at ?? '').slice(0, 10) });
    }
    if (users.length < PAGE) return ids;
  }
}

const [users, binders, pages, slices, ents, profiles] = await Promise.all([
  realUserIds(),
  all('binders?select=id,owner_id,archived_at,is_demo'),
  all('binder_pages?select=binder_id'),
  all('saved_slices?select=owner_id'),
  all('entitlements?select=user_id,product,expires_at,source&product=in.(tier_pro,tier_vip)'),
  all('profiles?select=id,username'),
]);

const now = Date.now();
const paid = new Set(ents.filter((e) => !e.expires_at || Date.parse(e.expires_at) > now).map((e) => e.user_id));
const everTier = new Set(ents.map((e) => e.user_id));
const free = new Set([...users].filter((id) => !paid.has(id)));

const live = binders.filter((b) => !b.archived_at && !b.is_demo);
const bindersBy = new Map();
for (const b of live) bindersBy.set(b.owner_id, (bindersBy.get(b.owner_id) ?? 0) + 1);
const pagesByBinder = new Map();
for (const p of pages) pagesByBinder.set(p.binder_id, (pagesByBinder.get(p.binder_id) ?? 0) + 1);
const maxPagesBy = new Map();
for (const b of live) maxPagesBy.set(b.owner_id, Math.max(maxPagesBy.get(b.owner_id) ?? 0, pagesByBinder.get(b.id) ?? 0));
const artBy = new Map();
for (const s of slices) artBy.set(s.owner_id, (artBy.get(s.owner_id) ?? 0) + 1);

const count = (map, test, also = () => true) => [...free].filter((id) => test(map.get(id) ?? 0) && also(id)).length;
const most = (map) => Math.max(0, ...[...free].map((id) => map.get(id) ?? 0));

const out = {
  free_accounts: free.size,
  at_or_over_binders: count(bindersBy, (n) => n >= NEW.binders),
  over_binders: count(bindersBy, (n) => n > NEW.binders),
  over_binders_and_lapsed: count(bindersBy, (n) => n > NEW.binders, (id) => everTier.has(id)),
  at_or_over_pages: count(maxPagesBy, (n) => n >= NEW.pages),
  over_pages: count(maxPagesBy, (n) => n > NEW.pages),
  at_or_over_art: count(artBy, (n) => n >= NEW.art),
  over_art: count(artBy, (n) => n > NEW.art),
  most_binders: most(bindersBy),
  most_pages: most(maxPagesBy),
  most_art: most(artBy),
};

console.log(`Proposed Free caps: ${NEW.binders} binders, ${NEW.pages} pages per binder, ${NEW.art} kept artworks`);
console.log('');
for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(28)} ${v}`);
console.log('');
console.log('Excluded (accounts removed by each rule; a rule with 0 matched nobody):');
console.log(`  ${'staff_accounts table'.padEnd(28)} ${staffHits}`);
console.log(`  ${'seeded personas (metadata)'.padEnd(28)} ${personaHits}`);
for (const r of rules) console.log(`  ${(r.p === (process.env.MICHI_TEST_EMAIL ?? '').toLowerCase() ? '(MICHI_TEST_EMAIL)' : r.p).padEnd(28)} ${r.hits}`);

// ---------------------------------------------------------------- the granular view
const bucket = (map, edges) => {
  const out = edges.map(() => 0);
  for (const id of free) {
    const n = map.get(id) ?? 0;
    const i = edges.findIndex((e, k) => n >= e && (k === edges.length - 1 || n < edges[k + 1]));
    out[i] += 1;
  }
  return out;
};
const show = (title, map, edges) => {
  const counts = bucket(map, edges);
  console.log('');
  console.log(title);
  edges.forEach((e, k) => {
    const label = k === edges.length - 1 ? `${e}+` : edges[k + 1] - 1 === e ? `${e}` : `${e}-${edges[k + 1] - 1}`;
    console.log(`  ${label.padEnd(10)} ${String(counts[k]).padStart(3)}  ${'#'.repeat(counts[k])}`);
  });
};
show('Binders per free account', bindersBy, [0, 1, 2, 3, 4]);
show('Largest binder, in pages', maxPagesBy, [0, 1, 5, 10, 13, 17]);
show('Kept artworks', artBy, [0, 1, 11, 26, 51, 101, 501]);

/**
 * THE ACCOUNTS OVER A PROPOSED CAP, named. Username is the public @handle. The email is MASKED
 * (first two characters and the domain) unless SHOW_EMAILS=1, which the .ps1 sets with -Emails:
 * this output tends to get pasted into a chat, and a handle is enough to find the account.
 */
const usernameOf = new Map(profiles.map((p) => [p.id, p.username]));
const mask = (e) => (process.env.SHOW_EMAILS === '1' ? e : e.replace(/^(.{0,2})[^@]*/, '$1***'));
const trialled = new Set(ents.filter((e) => e.source === 'trial').map((e) => e.user_id));
const over = [...free]
  .map((id) => ({ id, b: bindersBy.get(id) ?? 0, p: maxPagesBy.get(id) ?? 0, a: artBy.get(id) ?? 0 }))
  .filter((r) => r.b > NEW.binders || r.p > NEW.pages || r.a > NEW.art)
  .sort((x, y) => y.a - x.a || y.p - x.p || y.b - x.b);
console.log('');
console.log(`Accounts over at least one proposed cap: ${over.length} of ${free.size}   (* = over that cap)`);
console.log(`  ${'@username'.padEnd(22)} ${'email'.padEnd(28)} ${'binders'.padStart(8)} ${'pages'.padStart(6)} ${'art'.padStart(5)}  ${'joined'.padEnd(10)} ${'last seen'.padEnd(10)} history`);
for (const r of over) {
  const acc = account.get(r.id) ?? { email: '', created: '', seen: '' };
  const star = (n, cap) => `${n}${n > cap ? '*' : ' '}`;
  const history = everTier.has(r.id) ? (paid.has(r.id) ? 'paid now' : trialled.has(r.id) ? 'trial lapsed' : 'plan lapsed') : 'never paid';
  console.log(
    `  ${('@' + (usernameOf.get(r.id) ?? '(none)')).padEnd(22)} ${mask(acc.email).padEnd(28)} ${star(r.b, NEW.binders).padStart(8)} ${star(r.p, NEW.pages).padStart(6)} ${star(r.a, NEW.art).padStart(5)}  ${acc.created.padEnd(10)} ${acc.seen.padEnd(10)} ${history}`,
  );
}
