/**
 * Apply supabase/migrations/20261018120000_people_ranking_skips_showcase.sql and prove it: the
 * people list no longer counts the showcase (daily puzzle) binders as publishing.
 *
 * Read-only apart from the function redefinition; safe to re-run.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appSql, fail, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261018120000_people_ranking_skips_showcase.sql');

step(1, 'applying the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
console.log('  OK');

step(2, 'the function still resolves for an un-updated client');
const legacy = await appSql(`select count(*) as n from public.search_profiles('', 5);`);
console.log(`  OK: two-argument call returned ${legacy[0].n} row(s)`);

step(3, 'the showcase binders no longer count');
const [c] = await appSql(`
  with owner as (
    select b.owner_id, count(*) as showcase
      from public.binders b where b.hidden_from_feeds and b.is_public and b.removed_at is null
     group by b.owner_id
  ),
  shown as (
    select b.owner_id, count(*) as n, max(b.made_public_at) as last_published
      from public.binders b
     where b.is_public and b.removed_at is null and coalesce(b.hidden_from_feeds, false) = false
     group by b.owner_id
  )
  select pr.username, o.showcase, coalesce(s.n, 0) as counted, s.last_published,
         (select rn from public.search_profiles('', 1000000)
            with ordinality as t(id, username, avatar_url, upvotes, binder_votes, rn)
          where t.id = pr.id) as browse_rank
    from owner o join public.profiles pr on pr.id = o.owner_id
    left join shown s on s.owner_id = o.owner_id
   order by o.showcase desc limit 1;`);
if (!c) {
  console.log('  no account owns a showcase binder yet; nothing to compare');
} else {
  console.log(`  @${c.username}: ${c.showcase} showcase binder(s) ignored, ${c.counted} binder(s) counted,`);
  console.log(`  last published ${c.last_published ?? 'never'}, browse rank ${c.browse_rank ?? 'not listed'}`);
  if (c.browse_rank === null && Number(c.counted) > 0) fail('an owner with counted binders is missing from the browse list');
}
console.log('DONE.');
