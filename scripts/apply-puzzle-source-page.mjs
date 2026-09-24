/**
 * Applies 20260924160000_puzzle_source_page.sql and reports what the download button will be able
 * to draw: every puzzle needs a page id AND a public binder, because api/og-image-binder.js reads
 * binders with `is_public=eq.true` hardcoded.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (m) => {
  console.log(`FAILED: ${m}`);
  process.exit(2);
};
const step = (n, w) => console.log(`Step ${n}: ${w}`);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function sql(query) {
  const res = await fetch('https://api.supabase.com/v1/projects/piikwvntldytjejxmcla/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await res.text();
  if (!res.ok) fail(`query refused: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

step(1, 'applying');
await sql(readFileSync(join(here, '..', 'supabase', 'migrations', '20260924160000_puzzle_source_page.sql'), 'utf8'));
console.log('  applied');

step(2, 'what each puzzle can draw');
const rows = await sql(`
  select d.publish_on,
         d.source_page_id is not null as has_page,
         coalesce(b.is_public, false) as binder_public,
         b.title
    from public.daily_puzzles d
    left join public.binders b on b.id = d.source_binder_id
   order by d.publish_on;
`);
for (const r of rows) {
  const ready = r.has_page && r.binder_public;
  console.log(`  ${ready ? 'ok  ' : 'WAIT'} ${r.publish_on}  page:${r.has_page}  binder public:${r.binder_public}  "${r.title ?? ''}"`);
}
const noPage = rows.filter((r) => !r.has_page);
const notPublic = rows.filter((r) => !r.binder_public);
if (noPage.length) console.log(`  ${noPage.length} without a page id (their binder has more than one page with cards; re-publish to set it)`);
if (notPublic.length) {
  console.log(`  ${notPublic.length} whose binder is not public. The renderer refuses a private binder,`);
  console.log('  so those need showcase turned on in Studio before an image can be drawn.');
}

step(3, 'the list function returns the new columns');
const cols = await sql(`
  select string_agg(p.parameter_name, ', ' order by p.ordinal_position) as out_cols
    from information_schema.parameters p
   where p.specific_schema = 'public'
     and p.specific_name like 'admin_puzzle_list%' and p.parameter_mode = 'OUT';
`);
console.log(`  ${cols[0]?.out_cols ?? '(none)'}`);
for (const need of ['source_page_id', 'binder_is_public']) {
  if (!(cols[0]?.out_cols ?? '').includes(need)) fail(`admin_puzzle_list does not return ${need}`);
}

console.log('\nOK: puzzles know their page, and the panel can tell which can be drawn.');
