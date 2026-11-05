/**
 * Apply supabase/migrations/20261104130000_collection_shares.sql: read-only share links for
 * tcgscan collections (/s/<token>), PRO to make, anyone to view.
 *
 * THE CHECKS THAT MATTER:
 *   2. A stranger (anon) can call shared_collection, and an unknown token says 'not_found'.
 *   3. A stranger can NOT read collection_shares directly or make a link.
 *   4. ROUND TRIP, rolled back: as a real PRO account that owns a collection, make a link, ask
 *      again (same token), read it as a viewer ('ok', the right card count, and no purchase
 *      price anywhere in the answer), revoke it, and read it again ('not_found').
 *
 * Safe to re-run: idempotent DDL; the round trip leaves nothing behind.
 *
 * Run through apply-collection-shares.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261104130000_collection_shares.sql');

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

try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2: a stranger can look up a link...');
  const anon = await sql(`
    do $probe$
    declare r json;
    begin
      set local role anon;
      r := public.shared_collection('no-such-token');
      raise exception 'PROBE:%', r::text;
    end $probe$;`).catch((e) => String(e.message));
  if (!String(anon).includes('not_found')) fail(`anon lookup: ${String(anon).slice(0, 300)}`);
  console.log("  OK (unknown token answers 'not_found')");

  console.log('Step 3: a stranger cannot read the table or make a link...');
  const blocked = await sql(`
    do $probe$
    declare n int;
    begin
      set local role anon;
      begin
        select count(*) into n from public.collection_shares;
        raise exception 'PROBE-READ:%', n;
      exception when insufficient_privilege then null;
      end;
      begin
        perform public.create_collection_share('x');
        raise exception 'PROBE-MADE';
      exception when insufficient_privilege then null;
      end;
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(blocked).includes('PROBE-READ:')) {
    // RLS with no anon policy reads as zero rows rather than a privilege error; both keep it closed.
    if (!/PROBE-READ:0\b/.test(String(blocked))) fail(`anon read the share table: ${blocked}`);
    console.log('  OK (anon sees no rows)');
  } else if (String(blocked).includes('PROBE-OK')) {
    console.log('  OK (anon has no access)');
  } else {
    fail(`stranger probe: ${String(blocked).slice(0, 300)}`);
  }

  console.log('Step 4: round trip as a PRO owner (rolled back)...');
  const [owner] = await sql(`
    select c.user_id::text as uid, c.id as cid,
           (select count(*)::int from public.portfolio_entries e where e.collection_id = c.id and e.user_id = c.user_id) as n
      from public.collections c
     where c.archived_at is null and public.tcgscan_tier(c.user_id) in ('pro', 'vip')
       and exists (select 1 from public.portfolio_entries e where e.collection_id = c.id and e.user_id = c.user_id)
     order by 3 desc limit 1;`);
  if (!owner) {
    console.log('  SKIPPED (no PRO account with a synced, non-empty collection)');
  } else {
    const trip = await sql(`
      do $probe$
      declare t1 text; t2 text; v json; v2 json;
      begin
        perform set_config('request.jwt.claims', '{"sub":"${owner.uid}","role":"authenticated","is_anonymous":false}', true);
        set local role authenticated;
        t1 := public.create_collection_share('${owner.cid}');
        t2 := public.create_collection_share('${owner.cid}');
        if t1 is distinct from t2 then raise exception 'PROBE-FAIL: a second ask minted a new token'; end if;
        set local role anon;
        v := public.shared_collection(t1);
        if v->>'status' <> 'ok' then raise exception 'PROBE-FAIL: viewer got %', v->>'status'; end if;
        if json_array_length(v->'entries') <> ${owner.n} then
          raise exception 'PROBE-FAIL: viewer saw % lots, the collection has ${owner.n}', json_array_length(v->'entries');
        end if;
        if v::text like '%purchase%' then raise exception 'PROBE-FAIL: purchase data leaked'; end if;
        set local role authenticated;
        perform public.revoke_collection_share('${owner.cid}');
        set local role anon;
        v2 := public.shared_collection(t1);
        if v2->>'status' <> 'not_found' then raise exception 'PROBE-FAIL: revoked link answered %', v2->>'status'; end if;
        raise exception 'PROBE-OK:%', length(t1);
      end $probe$;`).catch((e) => String(e.message));
    if (!String(trip).includes('PROBE-OK')) fail(`round trip: ${String(trip).slice(0, 300)}`);
    console.log(`  OK (same token twice, viewer sees all ${owner.n} lots and no prices paid, revoke closes it; rolled back)`);
  }

  console.log('DONE: collection sharing is live. The app update with the Share row can ship now.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}
