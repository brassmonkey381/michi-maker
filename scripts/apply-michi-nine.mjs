/**
 * Apply the michi-nine migration and put the shared key in Vault. Run through
 * apply-michi-nine.ps1 (tcgscan root), which loads the access token and the key into env and
 * never prints either. Safe to re-run: the key is replaced in Vault, the migration is idempotent.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { appSql, fail, q, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261029120000_michi_nine.sql');

const key = process.env.MICHI_NINE_KEY ?? '';
if (!/^[0-9a-f]{64}$/.test(key)) fail('MICHI_NINE_KEY is not a 64-hex key (the .ps1 mints it)');

step(1, 'the key goes into Vault as michi_nine_key');
const [{ n }] = await appSql(`select count(*)::int as n from vault.decrypted_secrets where name = 'michi_nine_key';`);
if (n === 0) {
  await appSql(`select vault.create_secret(${q(key)}, 'michi_nine_key', 'michi-nine (Reddit) shared key');`);
  console.log('  created');
} else {
  await appSql(`select vault.update_secret(id, ${q(key)}) from vault.secrets where name = 'michi_nine_key';`);
  console.log('  replaced');
}

step(2, 'apply the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
const [{ f }] = await appSql(`
  select count(*)::int as f from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('michi_nine_key_ok','michi_nine_play','michi_nine_guess','michi_nine_reveal','michi_nine_stats');`);
if (f !== 5) fail(`expected five michi_nine functions, found ${f}`);
const [{ t }] = await appSql(`select count(*)::int as t from information_schema.tables where table_schema = 'public' and table_name = 'michi_nine_plays';`);
if (t !== 1) fail('michi_nine_plays is missing');
console.log('  five functions and the plays table are present');

step(3, 'the key admits a call, a wrong key does not');
const [{ ok }] = await appSql(`select public.michi_nine_key_ok(${q(key)}) as ok;`);
const [{ bad }] = await appSql(`select public.michi_nine_key_ok('nope') as bad;`);
if (ok !== true || bad !== false) fail(`key check: right ${ok}, wrong ${bad}`);
const [{ pid }] = await appSql(`select id as pid from public.daily_puzzles where publish_on <= public.puzzle_today() order by publish_on desc limit 1;`);
if (!pid) fail('no published puzzle to smoke-test against');
const [play] = await appSql(`select * from public.michi_nine_play(${q(key)}, 't2_michinine', ${q(pid)}::uuid);`);
if (!play || play.attempts !== 0 || play.streak !== 0) fail(`a fresh player should read 0 attempts, 0 streak: ${JSON.stringify(play)}`);
const [stats] = await appSql(`select * from public.michi_nine_stats(${q(key)}, ${q(pid)}::uuid);`);
console.log(`  key ok; fresh player reads clean; today's puzzle has ${stats.players} Reddit players so far`);
console.log('DONE: michi-nine can grade guesses. Now set the same key in the Devvit app (the .ps1 says how).');
