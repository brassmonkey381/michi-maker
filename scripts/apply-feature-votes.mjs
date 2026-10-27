/**
 * Apply supabase/migrations/20261027150000_feature_votes.sql to the live app project and prove it:
 * the feature_votes table with its three policies, the quota function, and the public tally RPC.
 * Safe to re-run (create if not exists, policies dropped and recreated).
 *
 * DDL goes through the management API; the token comes from the environment or the secrets file
 * (scripts/lib/michi.mjs), never printed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { appSql, fail, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261027150000_feature_votes.sql');

step(1, 'what is there now');
const before = await appSql(`select to_regclass('public.feature_votes') is not null as present;`);
console.log(`  feature_votes ${before[0].present ? 'already present' : 'absent'}`);

step(2, 'apply the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
const [{ present }] = await appSql(`select to_regclass('public.feature_votes') is not null as present;`);
if (!present) fail('feature_votes is not there after apply');
const [{ rls }] = await appSql(`select relrowsecurity as rls from pg_class where oid = 'public.feature_votes'::regclass;`);
if (!rls) fail('row level security is not enabled on feature_votes');
const [{ policies }] = await appSql(`select count(*)::int as policies from pg_policies where schemaname = 'public' and tablename = 'feature_votes';`);
if (policies !== 3) fail(`expected 3 policies on feature_votes, found ${policies}`);
const [{ fns }] = await appSql(`select count(*)::int as fns from pg_proc where proname in ('feature_vote_counts', 'feature_votes_quota_left');`);
if (fns !== 2) fail(`expected both functions, found ${fns}`);
console.log('  table, RLS, 3 policies, 2 functions present');

step(3, 'the tally answers');
const tally = await appSql(`select * from public.feature_vote_counts('michi');`);
console.log(`  ${tally.length} idea${tally.length === 1 ? '' : 's'} with votes so far`);
console.log('DONE: feature_votes is live; /wishlist can take votes.');
