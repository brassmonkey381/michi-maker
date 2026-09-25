/**
 * Build one Reddit post, filled with real cards. Dry run by default; --apply writes and renders.
 *
 *   node scripts/social/reddit-post.mjs artist
 *   node scripts/social/reddit-post.mjs lineage --apply
 *   node scripts/social/reddit-post.mjs colour --apply
 *   node scripts/social/reddit-post.mjs answer
 *
 * The post types and where each one may be posted are in docs/REDDIT.md. This script is the half
 * that cannot be written by hand: picking the cards, building the page, and rendering the image.
 * The titles and bodies below are templates; edit them before posting if the page suggests a
 * better line, and read the subreddit's own rules first.
 *
 * WHY IT BUILDS A BINDER RATHER THAN JUST AN IMAGE. A Reddit post wants one picture and one link.
 * The picture comes from the poster renderer, which draws a real page, so the page has to exist.
 * Making it real also means the link in the comments goes somewhere worth arriving at. Everything
 * lands in ONE binder, `Reddit Posts`, showcased: public enough to open, and `hidden_from_feeds`
 * so none of it turns up in discovery or featured binders.
 *
 * NOTHING HERE POSTS ANYTHING. It writes a markdown file and a JPEG; the posting is yours.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ROOT, adminSql, adminUser, appSql, backdropFor, cardImageUrl, dataSql,
  fail, imageManifest, isoDate, longDate, q, step,
} from '../lib/michi.mjs';

const TYPES = ['artist', 'lineage', 'colour', 'answer', 'rate'];
const type = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!TYPES.includes(type)) fail(`usage: node scripts/social/reddit-post.mjs <${TYPES.join('|')}> [--apply]`);

const BINDER_TITLE = 'Reddit Posts';
const ART_KINDS = `('special_illustration_rare','illustration_rare','named_full_art')`;
const PER_PAGE = 9;

console.log(APPLY ? '*** APPLY: this will write to the live database ***\n' : 'DRY RUN: nothing will be written.\n');

const outDir = join(ROOT, 'state', 'social');
mkdirSync(outDir, { recursive: true });
const today = isoDate(new Date());

// ---------------------------------------------------------------------------
// The two types that read from what is already published
// ---------------------------------------------------------------------------

if (type === 'answer') {
  step(1, 'the most recent published puzzle');
  const [p] = await appSql(`
    select d.publish_on, a.themes, cardinality(d.card_ids) as n, d.source_binder_id
      from public.daily_puzzles d join public.daily_puzzle_answers a on a.puzzle_id = d.id
     where d.publish_on <= public.puzzle_today()
     order by d.publish_on desc limit 1;
  `);
  if (!p) fail('no puzzle has been published yet');
  console.log(`  ${p.publish_on}: ${p.themes.join(' + ')}, ${p.n} cards`);

  const themes = p.themes;
  const total = await dataSql(`
    select count(*)::int as n from public.cards_en c
     where c.full_art_kind in ${ART_KINDS}
       ${themes.map((t) => `and c.scene_tags && array[${q(`scene:${t}`)}, ${q(`object:${t}`)}]`).join('\n       ')};
  `);
  const file = join(outDir, `reddit-answer-${p.publish_on}.md`);
  writeFileSync(file, `# Reddit: answer thread for ${longDate(p.publish_on)}

Post this the morning AFTER, as its own thread or as a comment on the original. It is the cheapest
recurring post there is and it is the one that brings people back, because an answer thread is
where the people who guessed go to find out if they were right.

**Title:** Answer to ${longDate(p.publish_on)}'s puzzle

**Body:**

> The two terms were **${themes.join('** and **')}**.
>
> ${total[0].n} cards match both. The page showed ${p.n} of them.
>
> Today's is up now at michi-maker.com/daily.

If anyone got it, reply to them rather than editing the post. A thread with replies stays visible;
an edited post does not.
`, 'utf8');
  console.log(`\nOK: ${file}`);
  process.exit(0);
}

if (type === 'colour' || type === 'rate') {
  step(1, 'the colour pages already built');
  const pages = await appSql(`
    select p.id, p.title, p.notes, p.position, b.id as binder_id
      from public.binder_pages p join public.binders b on b.id = p.binder_id
     where b.title = 'Colour Study' order by p.position;
  `);
  if (!pages.length) fail('no "Colour Study" binder; run scripts/social/color-pages.mjs --apply first');
  const pick = pages[Math.floor(pages.length / 2)];
  console.log(`  ${pages.length} page(s); using "${pick.title}"`);

  const cards = await appSql(`
    select s.card_id from public.binder_slots s
     where s.page_id = ${q(pick.id)} and s.card_id is not null order by s.row_index, s.col_index;
  `);
  const names = await dataSql(`
    select id::text as id, name, set_name, illustrator from public.cards_en
     where id::text = any(array[${cards.map((c) => q(c.card_id)).join(',')}]);
  `);
  const image = await render(pick.binder_id, pick.id, `colour-${pick.title.toLowerCase().replace(/\W+/g, '-')}`);

  const body = type === 'rate'
    ? `> Nine cards that all sit in the same range. I have room for one more and cannot decide.
>
> Which one would you cut, and what would you put in its place?
>
> ${pick.notes}`
    : `> ${pick.notes}
>
> ${names.map((c) => `${c.name} (${c.set_name})`).join('\n> ')}
>
> Full page: michi-maker.com/binder/${pick.binder_id}`;

  const file = join(outDir, `reddit-${type}-${today}.md`);
  writeFileSync(file, `# Reddit: ${type === 'rate' ? 'rate my page' : 'colour study'}, ${pick.title}

**Image:** ${image ?? '(run with --apply to render)'}

**Title:** ${type === 'rate'
    ? `Nine cards in the same palette. Which one does not belong?`
    : `${pick.title}: nine cards that live in the same colour`}

**Body:**

${body}

${type === 'rate'
  ? 'A question outranks a statement on Reddit. This one exists to collect replies, so do not add a\nlink to the body: put it in a comment if somebody asks.'
  : 'Check the subreddit rules before posting a link. On the bigger subs, put the link in a comment\nrather than the post body.'}
`, 'utf8');
  console.log(`\nOK: ${file}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The two types that build a new page
// ---------------------------------------------------------------------------

step(1, 'choosing the subject');
const manifest = await imageManifest();
let subject;
let cards;

if (type === 'artist') {
  // 5ban Graphics is excluded: it is a studio credited on hundreds of cards, so "one artist's page"
  // would be meaningless. The others are individuals with a recognisable hand.
  const [who] = await dataSql(`
    select illustrator, count(*)::int as n from public.cards_en
     where full_art_kind in ${ART_KINDS} and coalesce(illustrator,'') not in ('', '5ban Graphics')
     group by 1 having count(*) between 9 and 40 order by random() limit 1;
  `);
  if (!who) fail('no illustrator has enough full arts');
  subject = { key: who.illustrator, label: who.illustrator, n: who.n };
  cards = await dataSql(`
    select id::text as id, name, set_name, release_date, rarity from public.cards_en
     where full_art_kind in ${ART_KINDS} and illustrator = ${q(who.illustrator)}
     order by release_date, id limit 40;
  `);
} else {
  // By evolution line, not by name: "Mega Charizard ex" and "Charizard V" are the same Pokemon and
  // splitting on the first word puts them under "mega" and "charizard".
  const [who] = await dataSql(`
    select c.evolution_line[1] as line, count(*)::int as n from public.cards_en c
     where c.full_art_kind in ${ART_KINDS} and cardinality(c.evolution_line) > 0
     group by 1 having count(*) between 9 and 40 order by random() limit 1;
  `);
  if (!who) fail('no evolution line has enough full arts');
  subject = { key: who.line, label: who.line.charAt(0).toUpperCase() + who.line.slice(1), n: who.n };
  cards = await dataSql(`
    select id::text as id, name, set_name, release_date, rarity from public.cards_en
     where full_art_kind in ${ART_KINDS} and evolution_line[1] = ${q(who.line)}
     order by release_date, id limit 40;
  `);
}
cards = cards.filter((c) => cardImageUrl(manifest, c.id)).slice(0, PER_PAGE);
console.log(`  ${subject.label}: ${subject.n} full arts, using ${cards.length}`);
if (cards.length < PER_PAGE) fail(`${subject.label} does not have ${PER_PAGE} cards with pictures`);
console.log(`  ${cards.map((c) => `${c.name} (${String(c.release_date).slice(0, 4)})`).join(', ')}`);

step(2, 'a backdrop');
const art = await backdropFor(type === 'artist' ? 'dark paper texture studio' : 'soft gradient abstract texture');
console.log(`  ${art ? `${art.source}, ${art.credit}` : 'none found'}`);

if (!APPLY) {
  console.log('\nOK: nothing written. Re-run with --apply to build the page and render the image.');
  process.exit(0);
}

step(3, 'building the page');
const me = await adminUser();
let [binder] = await appSql(
  `select id from public.binders where owner_id = ${q(me.id)} and title = ${q(BINDER_TITLE)} limit 1;`,
);
if (!binder) {
  const id = randomUUID();
  await appSql(`
    insert into public.binders (id, owner_id, title, description, layout_style, cover_card_id, is_public, is_demo)
    values (${q(id)}, ${q(me.id)}, ${q(BINDER_TITLE)},
            ${q('Pages built for posts. Each one is a real page you can open.')},
            'themed_story', ${q(cards[0].id)}, false, false);
  `);
  binder = { id };
  console.log(`  created "${BINDER_TITLE}"`);
}

// The line is keyed on its BASE form, so a Bulbasaur line page is mostly Venusaur cards.
// Saying "the Bulbasaur line" is what is actually on the page; saying "Bulbasaur" is not.
const pageTitle = type === 'artist' ? `Illustrated by ${subject.label}` : `The ${subject.label} line, in order`;
const caption = type === 'artist'
  ? `Nine cards, one hand. You can tell before you read the credit.`
  : `The same Pokemon, oldest first. Watch the style move underneath it.`;

await appSql(`delete from public.binder_pages where binder_id = ${q(binder.id)} and title = ${q(pageTitle)};`);
const [{ next }] = await appSql(
  `select coalesce(max(position) + 1, 0) as next from public.binder_pages where binder_id = ${q(binder.id)};`,
);
const pageId = randomUUID();
// Public, because a private page inside a public binder renders nothing and opens empty.
await appSql(`
  insert into public.binder_pages (id, binder_id, position, title, rows, cols, background_color, notes, is_public)
  values (${q(pageId)}, ${q(binder.id)}, ${next}, ${q(pageTitle)}, 3, 3, ${q(art?.url ?? null)}, ${q(caption)}, true);
`);
await appSql(`
  insert into public.binder_slots (id, page_id, row_index, col_index, row_span, col_span, slot_type, card_id)
  values ${cards.map((c, k) =>
    `(${q(randomUUID())}, ${q(pageId)}, ${Math.floor(k / 3)}, ${k % 3}, 1, 1, 'card', ${q(c.id)})`).join(',\n          ')};
`);
await adminSql(`select public.admin_set_binder_showcase(${q(binder.id)}, true);`);
console.log(`  page "${pageTitle}" at position ${next}`);

step(4, 'rendering');
const image = await render(binder.id, pageId, `${type}-${subject.key.toLowerCase().replace(/\W+/g, '-')}`);

const years = `${String(cards[0].release_date).slice(0, 4)} to ${String(cards[cards.length - 1].release_date).slice(0, 4)}`;
const file = join(outDir, `reddit-${type}-${today}.md`);
writeFileSync(file, `# Reddit: ${pageTitle}

**Image:** ${image}

**Title:** ${type === 'artist'
  ? `Nine full arts by ${subject.label}, side by side`
  : `Every full art in the ${subject.label} line, oldest to newest (${years})`}

**Body:**

> ${caption}
>
> ${cards.map((c) => `${c.name}, ${c.set_name} (${String(c.release_date).slice(0, 4)})`).join('\n> ')}
>
> Full page: michi-maker.com/binder/${binder.id}

${art ? `Backdrop: ${art.source}, ${art.credit}, ${art.page}` : ''}

Before posting: check the subreddit's self-promotion rule. On the larger subs put the link in a
comment instead of the body, and let the picture carry the post.
`, 'utf8');
console.log(`\nOK: ${file}\n    michi-maker.com/binder/${binder.id}`);

// ---------------------------------------------------------------------------

/** Draw a page at poster scale and save it. Returns the path, or null if the renderer refused. */
async function render(binderId, pageId, name) {
  const url = `https://michi-maker.com/api/og-image-hires?id=${binderId}&v=2&t=${today}&page=${pageId}`;
  const res = await fetch(url);
  const ctype = res.headers.get('content-type') ?? '';
  if (!res.ok || !ctype.startsWith('image/')) {
    console.log(`  the renderer refused: ${res.status} ${ctype}`);
    console.log(`  ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const path = join(outDir, `${name}-${today}.jpg`);
  writeFileSync(path, buf);
  console.log(`  ${path} (${(buf.length / 1024).toFixed(0)} KB)`);
  return path;
}
