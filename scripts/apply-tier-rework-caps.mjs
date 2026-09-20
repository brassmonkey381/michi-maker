/**
 * Apply supabase/migrations/20260920130000_tier_rework_caps.sql: new Free caps, legacy caps for
 * existing accounts, prints in no plan, 3-day trials.
 *
 * THE CHECKS THAT MATTER:
 *   1. BEFORE: the cap table as it stands, and what the nightly reclaim would archive (expected 0).
 *   2. Apply (idempotent: the cutover row is written once, the legacy rows are copied once, the
 *      trial rewrite skips a body that no longer holds the literal).
 *   3. The cutover exists, and EVERY real account that existed before it resolves to `legacy_free`
 *      while an account that does not exist yet (a fresh uuid) resolves to `free`.
 *   4. The numbers: legacy rows equal the BEFORE Free rows exactly; Free, PRO and prints are the
 *      new values.
 *   5. A legacy account's live caps are the OLD numbers and a new account's are the NEW ones,
 *      asked through the real cap functions the insert triggers call.
 *   6. Reclaim still would archive exactly what it would have before (the per-owner helpers now
 *      return each account's own cap set).
 *   7. Both trial functions read trial_days(), neither still says 14 days, and trial_days() is 3.
 *
 * Run through apply-tier-rework-caps.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260920130000_tier_rework_caps.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
function fail(msg) {
  console.log(`FAILED: ${msg}`);
  process.exitCode = 2;
  throw new Error(msg);
}
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

const CAPS = `select app, limit_key, tier, value from public.tier_caps order by app, limit_key,
  array_position(array['guest','legacy_free','free','pro','vip'], tier);`;
const show = (rows) => {
  const by = new Map();
  for (const r of rows) {
    const k = `${r.app}.${r.limit_key}`;
    by.set(k, [...(by.get(k) ?? []), `${r.tier}=${r.value ?? 'unlimited'}`]);
  }
  for (const [k, v] of by) console.log(`      ${k.padEnd(32)} ${v.join('  ')}`);
};
const WOULD_ARCHIVE = `
  with lm as (
    select e.user_id from public.entitlements e where e.product in ('tier_pro','tier_vip') group by e.user_id
    having bool_and(e.expires_at is not null and e.expires_at <= now()) and max(e.expires_at) + interval '3 days' < now()
  ), rb as (
    select b.owner_id, row_number() over (partition by b.owner_id order by b.updated_at desc) rn
      from public.binders b join lm on lm.user_id = b.owner_id
     where b.archived_at is null and coalesce(b.is_demo, false) = false
  ), lt as (
    select e.user_id from public.entitlements e where e.product in ('tcgscan_pro','tcgscan_vip') group by e.user_id
    having bool_and(e.expires_at is not null and e.expires_at <= now()) and max(e.expires_at) + interval '3 days' < now()
  ), rc as (
    select c.user_id as owner_id, row_number() over (partition by c.user_id order by c.updated_at desc) rn
      from public.collections c join lt on lt.user_id = c.user_id where c.archived_at is null
  )
  select (select count(*) from rb where rn > public.free_binder_cap_for(owner_id)) as binders,
         (select count(*) from rc where rn > public.free_collection_cap_for(owner_id)) as collections;`;

try {
  console.log('[1/7] BEFORE: the cap table, and what reclaim would archive...');
  const beforeCaps = await sql(CAPS);
  show(beforeCaps);
  const [beforeArch] = await sql(WOULD_ARCHIVE);
  console.log(`      reclaim would archive: binders ${beforeArch.binders}, collections ${beforeArch.collections}`);
  const alreadyApplied = beforeCaps.some((r) => r.tier === 'legacy_free');
  if (alreadyApplied) console.log('      (legacy_free rows already exist: this is a re-run; number checks compare against them)');

  console.log('[2/7] Applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('      applied');

  console.log('[3/7] The cutover, and who is legacy...');
  const [who] = await sql(`
    select (select cutover_at from public.tier_cutover) as cutover_at,
           (select count(*) from auth.users u where coalesce(u.is_anonymous, false) = false) as real_accounts,
           (select count(*) from auth.users u where coalesce(u.is_anonymous, false) = false
              and public.cap_tier_for(u.id, 'free') = 'legacy_free') as legacy_accounts,
           (select count(*) from auth.users u, public.tier_cutover c where coalesce(u.is_anonymous, false) = false
              and u.created_at < c.cutover_at) as created_before,
           public.cap_tier_for(gen_random_uuid(), 'free') as fresh_uuid_reads,
           public.cap_tier_for((select id from auth.users limit 1), 'pro') as pro_stays;`);
  console.log(`      cutover_at ${who.cutover_at}`);
  console.log(`      real accounts ${who.real_accounts}, created before the cutover ${who.created_before}, resolving to legacy_free ${who.legacy_accounts}`);
  if (String(who.legacy_accounts) !== String(who.created_before)) fail('not every pre-cutover account resolves to legacy_free');
  if (who.fresh_uuid_reads !== 'free') fail(`a new account should read 'free', got '${who.fresh_uuid_reads}'`);
  if (who.pro_stays !== 'pro') fail(`a paid tier must never be remapped, got '${who.pro_stays}'`);

  console.log('[4/7] AFTER: the cap table...');
  const afterCaps = await sql(CAPS);
  show(afterCaps);
  const val = (rows, app, key, tier) => rows.find((r) => r.app === app && r.limit_key === key && r.tier === tier)?.value ?? null;
  if (!alreadyApplied) {
    for (const r of beforeCaps.filter((x) => x.tier === 'free')) {
      if (val(afterCaps, r.app, r.limit_key, 'legacy_free') !== r.value) fail(`legacy_free ${r.app}.${r.limit_key} is not the old Free value`);
    }
  }
  const want = [
    ['tcgscan', 'collections', 'free', 1], ['tcgscan', 'cardsPerCollection', 'free', 150], ['tcgscan', 'cardsPerCollection', 'guest', 25],
    ['michi', 'binders', 'free', 2], ['michi', 'pagesPerBinder', 'free', 9], ['michi', 'artUploads', 'free', 25],
    ['tcgscan', 'collections', 'pro', null], ['tcgscan', 'cardsPerCollection', 'pro', null],
    ['michi', 'binders', 'pro', null], ['michi', 'pagesPerBinder', 'pro', null], ['michi', 'artUploads', 'pro', null],
    ['michi', 'includedPrintsPerMonth', 'pro', 0], ['michi', 'includedPrintsPerMonth', 'vip', 0],
  ];
  for (const [app, key, tier, v] of want) {
    if (val(afterCaps, app, key, tier) !== v) fail(`${app}.${key}.${tier} should be ${v ?? 'unlimited'}, is ${val(afterCaps, app, key, tier)}`);
  }
  console.log('      legacy rows match the old Free values; Free, PRO and prints are the new values');

  console.log('[5/7] Live caps through the real functions...');
  const [live] = await sql(`
    with legacy as (
      select u.id from auth.users u
       where coalesce(u.is_anonymous, false) = false
         and not exists (select 1 from public.entitlements e where e.user_id = u.id
                          and (e.expires_at is null or e.expires_at > now()))
       limit 1
    )
    select (select public.michi_binder_cap(id)        from legacy) as legacy_binders,
           (select public.michi_page_cap(id)          from legacy) as legacy_pages,
           (select public.michi_slice_cap(id)         from legacy) as legacy_art,
           (select public.tcgscan_collection_cap(id)  from legacy) as legacy_collections,
           (select public.tcgscan_card_cap(id)        from legacy) as legacy_cards,
           public.cap_value('michi', 'binders', public.cap_tier_for(gen_random_uuid(), 'free'))            as new_binders,
           public.cap_value('michi', 'artUploads', public.cap_tier_for(gen_random_uuid(), 'free'))         as new_art,
           public.cap_value('tcgscan', 'collections', public.cap_tier_for(gen_random_uuid(), 'free'))      as new_collections,
           public.cap_value('tcgscan', 'cardsPerCollection', public.cap_tier_for(gen_random_uuid(), 'free')) as new_cards;`);
  console.log(`      an existing free account: ${live.legacy_binders} binders, ${live.legacy_pages} pages, ${live.legacy_art} artworks, ${live.legacy_collections} collections x ${live.legacy_cards} cards`);
  console.log(`      a new free account:       ${live.new_binders} binders, ${live.new_art} artworks, ${live.new_collections} collection x ${live.new_cards} cards`);
  const legacyBinders = val(afterCaps, 'michi', 'binders', 'legacy_free');
  if (live.legacy_binders !== null && live.legacy_binders !== legacyBinders) fail('an existing free account does not read the legacy binder cap');
  if (live.new_binders !== 2 || live.new_art !== 25 || live.new_collections !== 1 || live.new_cards !== 150) fail('a new account does not read the new Free caps');

  console.log('[6/7] Reclaim is unchanged...');
  const [afterArch] = await sql(WOULD_ARCHIVE);
  console.log(`      reclaim would archive: binders ${afterArch.binders}, collections ${afterArch.collections}`);
  if (String(afterArch.binders) !== String(beforeArch.binders) || String(afterArch.collections) !== String(beforeArch.collections)) {
    fail('reclaim would archive a different number than before the migration');
  }

  console.log('[7/7] Trials are 3 days, read from trial_days()...');
  const trials = await sql(`
    select p.proname, pg_get_functiondef(p.oid) as def, public.trial_days() as days from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('start_pro_trial', 'start_tcgscan_pro_trial');`);
  if (trials.length !== 2) fail(`expected 2 trial functions, found ${trials.length}`);
  for (const t of trials) {
    const reads = /trial_days\(\)/.test(t.def);
    const old = /14 days/.test(t.def);
    console.log(`      ${t.proname.padEnd(28)} reads trial_days(): ${reads ? 'yes' : 'NO'}   still says 14 days: ${old ? 'YES' : 'no'}   trial_days() = ${t.days}`);
    if (!reads || old || t.days !== 3) fail(`${t.proname} is not on the 3-day trial`);
  }

  console.log('');
  console.log('DONE. New accounts get the new Free caps; every existing account keeps the caps it had.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${String(e.message).slice(0, 600)}`);
    process.exitCode = 3;
  }
}
