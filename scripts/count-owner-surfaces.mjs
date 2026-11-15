/**
 * READ-ONLY (MIC-029 gap 2 plan). How many owner pictures sit outside the checked slot images:
 * page backgrounds, sleeves, art backings, mats, binder page_style, covers, share backdrops,
 * puzzle backdrops. Counts only, split by public/private binder and by where the picture lives
 * (our binder-art bucket, other Supabase storage, procedural SVG, or a hotlink elsewhere).
 * Selects only; writes NOTHING. Prints no URLs, only hosts. Output: state/out/owner-surfaces.txt.
 * Run through state/count-owner-surfaces.ps1.
 */
import fs from 'node:fs';
import { ROOT, appSql } from './lib/michi.mjs';

const lines = [];
const out = (s = '') => { console.log(s); lines.push(s); };
const table = (rows) => {
  if (!rows.length) return out('  (none)');
  for (const r of rows) out('  ' + Object.entries(r).map(([k, v]) => `${k}=${v ?? '-'}`).join('  '));
};

// Every string inside a jsonb value that is an http(s) address.
const jsonUrls = (col) => `jsonb_path_query(coalesce(${col}, 'null'::jsonb), 'strict $.** ? (@.type() == "string" && @ like_regex "^https?://")') #>> '{}'`;
const isUrl = (col) => `${col} ~* '^https?://'`;

const SURFACES = `
  with s as (
    select 'page.background' as field, p.binder_id, p.background_color as url from public.binder_pages p where ${isUrl('p.background_color')}
    union all select 'page.sleeve', p.binder_id, p.sleeve from public.binder_pages p where ${isUrl('p.sleeve')}
    union all select 'page.art_backing', p.binder_id, p.art_backing from public.binder_pages p where ${isUrl('p.art_backing')}
    union all select 'page.mat', p.binder_id, ${jsonUrls('p.mat')} from public.binder_pages p where p.mat is not null
    union all select 'slot.sleeve', public.slot_binder_id(bs.page_id, bs.binder_id), bs.sleeve from public.binder_slots bs where ${isUrl('bs.sleeve')}
    union all select 'slot.art_backing', public.slot_binder_id(bs.page_id, bs.binder_id), bs.art_backing from public.binder_slots bs where ${isUrl('bs.art_backing')}
    union all select 'binder.page_style', b.id, ${jsonUrls('b.page_style')} from public.binders b where b.page_style is not null
    union all select 'binder.cover', b.id, ${jsonUrls('b.cover')} from public.binders b where b.cover is not null
    union all select 'binder.share_backdrop', b.id, b.share_backdrop from public.binders b where ${isUrl('b.share_backdrop')}
  )
  select s.field, s.url, b.is_public from s left join public.binders b on b.id = s.binder_id`;

out('Owner pictures outside slot images, read-only, ' + new Date().toISOString());

out('\n1. per field: rows, distinct pictures, in public binders');
table(await appSql(`
  select field, count(*) as rows, count(distinct url) as pictures,
         count(*) filter (where is_public) as rows_public,
         count(distinct url) filter (where is_public) as pictures_public
    from (${SURFACES}) x group by field order by field;`));

out('\n2. where the pictures live (distinct pictures; public binders only in the last column)');
table(await appSql(`
  select case when url like '%/storage/v1/object/public/binder-art/%' then 'binder-art bucket'
              when url like '%supabase.co/storage/%' then 'other supabase storage'
              else 'hotlink: ' || substring(url from '^https?://([^/]+)') end as lives,
         count(distinct url) as pictures,
         count(distinct url) filter (where is_public) as pictures_public
    from (${SURFACES}) x group by 1 order by 2 desc limit 25;`));

out('\n3. how many of these exact addresses were already checked as slot images');
table(await appSql(`
  select count(distinct x.url) as pictures_public,
         count(distinct x.url) filter (where exists (select 1 from public.image_reviews r where r.image_url = x.url and r.label = 'safe')) as already_safe,
         count(distinct x.url) filter (where exists (select 1 from public.image_reviews r where r.image_url = x.url and r.label in ('suggestive','explicit','refused'))) as already_flagged
    from (${SURFACES}) x where x.is_public;`));

out('\n4. daily puzzles with a backdrop picture (past and future)');
table(await appSql(`
  select count(*) filter (where backdrop_url ~* '^https?://') as with_backdrop,
         count(*) filter (where backdrop_url ~* '^https?://' and publish_on > current_date) as future
    from public.daily_puzzles;`));

out('\nRead-only: nothing was changed.');
fs.mkdirSync(`${ROOT}/state/out`, { recursive: true });
fs.writeFileSync(`${ROOT}/state/out/owner-surfaces.txt`, lines.join('\n') + '\n');
