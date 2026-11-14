/**
 * READ-ONLY (MIC-029). Is the image safety check running, and does it see the art in binders
 * that go public? Selects only; writes NOTHING. Prints five sections and saves the same text to
 * state/out/image-review-health.txt. Run through state/check-image-review-health.ps1.
 */
import fs from 'node:fs';
import { ROOT, appSql } from './lib/michi.mjs';

const SINCE = '2026-11-10 06:53:00+00';
const lines = [];
const out = (s = '') => { console.log(s); lines.push(s); };
const table = (rows) => {
  if (!rows.length) return out('  (none)');
  for (const r of rows) out('  ' + Object.entries(r).map(([k, v]) => `${k}=${v ?? '-'}`).join('  '));
};
const custom = `bs.image_url is not null and not public.is_procedural_svg(bs.image_url)`;

out(`Image safety check health, read-only, since ${SINCE}`);

out('\n1. pg_cron image-review job: runs per day (UTC)');
table(await appSql(`
  select date_trunc('day', d.start_time)::date as day,
         count(*) filter (where d.status = 'succeeded') as succeeded,
         count(*) filter (where d.status = 'failed') as failed,
         count(*) filter (where d.status not in ('succeeded','failed')) as other
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   where j.jobname = 'image-review' and d.start_time >= '${SINCE}'
   group by 1 order by 1;`));
table(await appSql(`
  select j.active, j.schedule, max(d.start_time) as latest_run,
         (select d2.status from cron.job_run_details d2 where d2.jobid = j.jobid order by d2.start_time desc limit 1) as latest_status,
         (select left(d2.return_message, 120) from cron.job_run_details d2 where d2.jobid = j.jobid and d2.status = 'failed' order by d2.start_time desc limit 1) as last_failure
    from cron.job j left join cron.job_run_details d on d.jobid = j.jobid
   where j.jobname = 'image-review' group by j.jobid, j.active, j.schedule;`));

out('\n2. image_reviews per day (UTC)');
table(await appSql(`
  select created_at::date as day, count(*) as created,
         count(*) filter (where status = 'done') as done,
         count(*) filter (where status = 'error') as error,
         count(*) filter (where status in ('queued','working')) as waiting,
         count(*) filter (where label = 'safe') as safe,
         count(*) filter (where label = 'suggestive') as suggestive,
         count(*) filter (where label = 'explicit') as explicit,
         count(*) filter (where label = 'refused') as refused,
         count(*) filter (where label = 'unchecked') as unchecked,
         count(*) filter (where label = 'held') as held
    from public.image_reviews where created_at >= '2026-11-10'
   group by 1 order by 1;`));
table(await appSql(`
  select count(*) as still_queued_or_working, min(created_at) as oldest,
         date_trunc('minute', now() - min(created_at)) as oldest_age
    from public.image_reviews where status in ('queued','working');`));

out('\n3. Binders made public since 11-10, and the coverage gap');
table(await appSql(`
  select made_public_at::date as day, count(*) as made_public
    from public.binders where made_public_at >= '${SINCE}' group by 1 order by 1;`));
const gap = await appSql(`
  with pub as (select id from public.binders where made_public_at >= '${SINCE}'),
  imgs as (
    select b.id as binder_id, bs.id as slot_id, bs.image_url, bs.image_review
      from pub b join public.binder_slots bs on public.slot_binder_id(bs.page_id, bs.binder_id) = b.id
     where ${custom})
  select count(distinct binder_id) as public_binders_with_custom_art,
         count(*) as custom_images,
         count(*) filter (where image_review = 'approved') as approved,
         count(*) filter (where image_review <> 'approved'
           and not exists (select 1 from public.image_reviews r where r.slot_id = imgs.slot_id and r.image_url = imgs.image_url)) as gap_images,
         count(distinct binder_id) filter (where image_review <> 'approved'
           and not exists (select 1 from public.image_reviews r where r.slot_id = imgs.slot_id and r.image_url = imgs.image_url)) as gap_binders,
         (array_agg(distinct binder_id::text) filter (where image_review <> 'approved'
           and not exists (select 1 from public.image_reviews r where r.slot_id = imgs.slot_id and r.image_url = imgs.image_url)))[1:5] as first_gap_binders
    from imgs;`);
table(gap);
out('  same gap over ALL public binders, any date:');
table(await appSql(`
  select count(*) as gap_images, count(distinct b.id) as gap_binders
    from public.binders b join public.binder_slots bs on public.slot_binder_id(bs.page_id, bs.binder_id) = b.id
   where b.is_public and b.removed_at is null and ${custom} and bs.image_review <> 'approved'
     and not exists (select 1 from public.image_reviews r where r.slot_id = bs.id and r.image_url = bs.image_url);`));

out('\n4. Held pages, Studio queue, last flag email');
table(await appSql(`
  select (select count(*) from public.binder_pages where moderation_hold) as pages_held,
         (select count(*) from public.image_reviews where decision is null
             and label in ('suggestive','explicit','refused','unchecked','held')) as waiting_in_studio,
         (select count(*) from public.binder_slots where image_review = 'flagged') as slots_flagged,
         (select count(*) from public.binder_slots where image_review = 'unchecked') as slots_unchecked,
         (select max(last_sent_at) from public.admin_notices where kind = 'image-review') as last_flag_email,
         (select max(notified_at) from public.image_reviews) as last_review_notified;`));

out('\n5. pg_net responses in the last 72 h (pg_net keeps only recent rows)');
table(await appSql(`
  select coalesce(status_code::text, 'no status') as status, count(*) as responses,
         min(created) as first, max(created) as last
    from net._http_response where created >= now() - interval '72 hours'
   group by 1 order by 1;`));
table(await appSql(`
  select status_code, created, left(coalesce(error_msg, content::text), 160) as detail
    from net._http_response
   where created >= now() - interval '72 hours' and (status_code is null or status_code not between 200 and 299)
   order by created desc limit 5;`));

fs.mkdirSync(`${ROOT}/state/out`, { recursive: true });
fs.writeFileSync(`${ROOT}/state/out/image-review-health.txt`, lines.join('\n') + '\n');
out('\nOK: read-only, nothing written to the database. Saved to state/out/image-review-health.txt');
