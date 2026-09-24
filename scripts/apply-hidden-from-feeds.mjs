/**
 * Applies supabase/migrations/20260923150000_hidden_from_feeds.sql and proves it does something.
 *
 * THE VACUOUS-TEST TRAP. "The binder is not in the feed" passes just as well when the binder was
 * never eligible for the feed in the first place, when the profile is private, when the query did
 * not match, when the function errored and returned nothing. So every check here is run TWICE: once
 * with the flag off, where the binder MUST appear, and once with it on, where it must not. A run
 * where the binder never appears at all fails, rather than reporting success.
 *
 *   node scripts/apply-hidden-from-feeds.mjs      (through the .ps1 wrapper, which loads the token)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PROJECT_REF = 'piikwvntldytjejxmcla';
const MIGRATION = '20260923150000_hidden_from_feeds.sql';
const USERNAME = 'fakemichi';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);
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
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

step(1, `applying ${MIGRATION}`);
await sql(readFileSync(join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8'));
console.log('  applied');

step(2, 'picking a binder to test with');
const [me] = await sql(`select id, is_public from public.profiles where lower(username) = lower(${q(USERNAME)});`);
if (!me) fail(`no profile '${USERNAME}'`);
const [b] = await sql(`
  select id, title, is_public, hidden_from_feeds, archived_at, removed_at
    from public.binders
   where owner_id = ${q(me.id)} and title like 'Daily Puzzle:%'
   order by title limit 1;
`);
if (!b) fail('no "Daily Puzzle:" binder to test with');
console.log(`  "${b.title}"  profile public=${me.is_public}`);

// The feeds also gate on the OWNER's profile being public. Without this the whole test is vacuous
// for a reason that has nothing to do with the column being added.
const profileWasPublic = me.is_public;
if (!profileWasPublic) {
  await sql(`update public.profiles set is_public = true where id = ${q(me.id)};`);
  console.log('  profile was private; made public for the duration of this check');
}
const wasPublic = b.is_public;
const wasHidden = b.hidden_from_feeds;

const inFeeds = async () => {
  const [r] = await sql(`
    set local role authenticated;
    select
      (select count(*) from public.discover_binders('new', 200) d where d.binder_id = ${q(b.id)})::int as discover,
      (select count(*) from public.search_binders(${q(b.title)}, 100) s where s.binder_id = ${q(b.id)})::int as search;
  `);
  return { discover: Number(r.discover), search: Number(r.search) };
};

step(3, 'with the flag OFF it must be in the feeds, or this test proves nothing');
await sql(`update public.binders set is_public = true, hidden_from_feeds = false where id = ${q(b.id)};`);
const visible = await inFeeds();
console.log(`  discover=${visible.discover}  search=${visible.search}`);
if (visible.discover === 0 && visible.search === 0) {
  fail('the binder is in neither feed even with the flag off, so hiding it would prove nothing');
}

step(4, 'with the flag ON it must be gone from both');
await sql(`update public.binders set hidden_from_feeds = true where id = ${q(b.id)};`);
const hidden = await inFeeds();
console.log(`  discover=${hidden.discover}  search=${hidden.search}`);
if (hidden.discover !== 0 || hidden.search !== 0) fail('the binder is still in a feed with hidden_from_feeds set');

step(5, 'and it is still readable on its own, which is what the share image needs');
const [direct] = await sql(`
  set local role anon;
  select count(*)::int as n from public.binders where id = ${q(b.id)};
`);
console.log(`  an anonymous reader can load it directly: ${Number(direct.n) === 1}`);
if (Number(direct.n) !== 1) fail('a signed-out scraper cannot read the binder, so no preview will render');

step(6, 'putting the binder and the profile back as they were');
await sql(`
  update public.binders
     set is_public = ${wasPublic}, hidden_from_feeds = ${wasHidden}
   where id = ${q(b.id)};
`);
if (!profileWasPublic) await sql(`update public.profiles set is_public = false where id = ${q(me.id)};`);
const [back] = await sql(`select is_public, hidden_from_feeds from public.binders where id = ${q(b.id)};`);
console.log(`  "${b.title}" is back to is_public=${back.is_public}, hidden_from_feeds=${back.hidden_from_feeds}`);

console.log('\nOK: a hidden public binder renders a share image and appears in no feed.');
