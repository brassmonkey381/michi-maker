/**
 * The question marks become the SHARE IMAGE's backdrop, and come off the pages. --apply writes.
 *
 *   node scripts/puzzles/set-share-backdrop.mjs            (reports, writes nothing)
 *   node scripts/puzzles/set-share-backdrop.mjs --apply
 *
 * THREE DIFFERENT BACKDROPS EXIST and they were conflated. Worth naming them once:
 *
 *   binders.share_backdrop        the picture BEHIND the poster frame in a share image. When set it
 *                                 replaces the blurred enlargement of the page art and is drawn
 *                                 sharp, as itself (api/og-image-binder.js, `chosen`).
 *   binder_pages.background_color the page's own ground, behind the pockets, in the app AND inside
 *                                 the share image. A #rrggbb or an http(s) URL.
 *   daily_puzzles.backdrop_url    what /daily washes over the screen at 14% opacity. It is COPIED
 *                                 from the page's background_color when the puzzle is published.
 *
 * WHAT THIS FIXES, and it is not only a preference. `fill-queue.mjs` searched each page's backdrop
 * using the puzzle's own answer words, so the forest + sky puzzle was published over a photograph
 * of a forest under a sky. The picture a player is asked to solve was quietly answering itself.
 *
 * So: the question marks, which give nothing away, move to `share_backdrop` where the poster can
 * use them, and `background_color` is cleared on every page of every puzzle binder. Clearing it
 * also nulls `backdrop_url`, and /daily then falls back to PUZZLE_BACKDROP_FALLBACK, which is the
 * same question marks it is already showing. The player page does not change.
 *
 * THE ADDRESS IS READ FROM src/data/dailyPuzzleLogic.ts rather than repeated here, so there is one
 * definition of which picture this is and a re-host cannot leave the two disagreeing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, appSql, fail, q, step } from '../lib/michi.mjs';

const APPLY = process.argv.includes('--apply');

step(1, 'the question-mark address, from the app');
const src = readFileSync(join(ROOT, 'src', 'data', 'dailyPuzzleLogic.ts'), 'utf8');
// `;\s*$` with the m flag, not `;\n`: the working copy is CRLF, so the semicolon is followed by
// \r and a \n-anchored pattern silently matches nothing.
const m = /PUZZLE_BACKDROP_FALLBACK\s*=\s*([\s\S]*?);\s*$/m.exec(src);
if (!m) fail('PUZZLE_BACKDROP_FALLBACK not found in src/data/dailyPuzzleLogic.ts');
const URL_ = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('');
if (!/^https:\/\/\S+\.jpg$/.test(URL_)) fail(`that did not parse as an address: ${URL_}`);
console.log(`  ${URL_}`);

const head = await fetch(URL_, { method: 'GET', headers: { range: 'bytes=0-64' } });
console.log(`  it serves: ${head.status} ${head.headers.get('content-type') ?? ''}`);
if (!head.ok) fail('the question-mark picture does not serve, so nothing should point at it');

step(2, 'what the puzzle binders look like now');
const before = await appSql(`
  select d.publish_on, b.title,
         b.share_backdrop is not null as has_share_backdrop,
         (select count(*) from public.binder_pages p
           where p.binder_id = b.id and p.background_color is not null) as pages_with_background,
         d.backdrop_url is not null as puzzle_has_backdrop
    from public.daily_puzzles d join public.binders b on b.id = d.source_binder_id
   order by d.publish_on;
`);
for (const r of before) {
  console.log(
    `  ${r.publish_on}  ${String(r.title).padEnd(34)} share backdrop: ${r.has_share_backdrop}`
    + `  pages carrying a background: ${r.pages_with_background}`,
  );
}

if (!APPLY) {
  console.log(`\nOK: ${before.length} puzzle(s) would be changed. Nothing written. Re-run with --apply.`);
  process.exit(0);
}

step(3, 'pointing every puzzle binder at the question marks');
const binders = await appSql(`
  update public.binders set share_backdrop = ${q(URL_)}
   where id in (select source_binder_id from public.daily_puzzles where source_binder_id is not null)
   returning id, title;
`);
console.log(`  ${binders.length} binder(s)`);

step(4, 'taking the answer off the pages');
// Scoped to puzzle binders only. The Colour Study and Reddit Posts binders are built around their
// backgrounds and must keep them.
const pages = await appSql(`
  update public.binder_pages set background_color = null
   where binder_id in (select source_binder_id from public.daily_puzzles where source_binder_id is not null)
     and background_color is not null
   returning id;
`);
console.log(`  cleared ${pages.length} page background(s)`);

const puzzles = await appSql(`
  update public.daily_puzzles set backdrop_url = null where backdrop_url is not null returning publish_on;
`);
console.log(`  cleared ${puzzles.length} puzzle backdrop(s); /daily now falls back to the same picture`);

step(5, 'reading it back');
const after = await appSql(`
  select d.publish_on, b.share_backdrop = ${q(URL_)} as share_ok,
         (select count(*) from public.binder_pages p
           where p.binder_id = b.id and p.background_color is not null) as pages_with_background,
         d.backdrop_url is null as puzzle_clear
    from public.daily_puzzles d join public.binders b on b.id = d.source_binder_id
   order by d.publish_on;
`);
let bad = 0;
for (const r of after) {
  const ok = r.share_ok && Number(r.pages_with_background) === 0 && r.puzzle_clear;
  if (!ok) bad += 1;
  console.log(`  ${ok ? 'ok  ' : 'BAD '} ${r.publish_on}  share backdrop set: ${r.share_ok}, pages clean: ${Number(r.pages_with_background) === 0}`);
}
if (bad) fail(`${bad} puzzle(s) did not end up as intended`);

// Nothing outside the puzzles may have been touched.
const collateral = await appSql(`
  select b.title, count(*)::int as n from public.binder_pages p join public.binders b on b.id = p.binder_id
   where b.title in ('Colour Study', 'Reddit Posts') and p.background_color is not null group by 1;
`);
console.log(`  untouched elsewhere: ${collateral.map((c) => `${c.title} ${c.n} page(s)`).join(', ') || 'nothing to check'}`);

console.log('\nOK. Re-render a puzzle image to see it (Studio, the "image" button).');
