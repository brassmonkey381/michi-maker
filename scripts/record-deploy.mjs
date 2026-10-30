/**
 * One row per production deploy: `deploy.live` in analytics_events, with the commit, at the
 * moment vercel --prod returned. Analytics-studio (2026-10-29) cuts before/after funnels on
 * commit times today, which can be an hour off; this is the exact line.
 *
 * Run by promote-to-production.ps1 after a successful deploy, with the access token in env.
 * Never fatal to the deploy: the deploy is done by the time this runs. `--dry` prints the SQL.
 *
 *   node scripts/record-deploy.mjs <commit-sha> [--dry]
 */
import { appSql, q } from './lib/michi.mjs';

const sha = (process.argv[2] ?? '').trim();
const dry = process.argv.includes('--dry');
if (!/^[0-9a-f]{7,40}$/.test(sha)) {
  console.error('record-deploy: a commit sha is required');
  process.exit(2);
}
const props = JSON.stringify({ commit: sha, short: sha.slice(0, 7), by: 'promote-to-production.ps1' });
const sql = `insert into public.analytics_events (app, name, props) values ('michi', 'deploy.live', ${q(props)}::jsonb);`;
if (dry) {
  console.log(sql);
  process.exit(0);
}
try {
  await appSql(sql);
  console.log(`record-deploy: deploy.live ${sha.slice(0, 7)} written`);
} catch (e) {
  console.error(`record-deploy: not written (${e instanceof Error ? e.message : String(e)}); the deploy itself is done`);
  process.exit(1);
}
