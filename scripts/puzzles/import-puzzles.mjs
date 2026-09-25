/**
 * Put each candidate puzzle in @fakemichi as its own binder. Dry run by default; --apply writes.
 *
 * ONE BINDER PER PUZZLE, holding EVERY card the search returned, because the point is to inspect
 * the whole candidate set and funnel it down by hand. Nothing is pre-trimmed here.
 *
 * A BLANK PAGE AT THE FRONT (owner, 2026-09-23), so the cards start on page 2 and every later page
 * has a facing partner in double-sided mode. Dragging pages about is then a straight swap instead
 * of a shuffle that re-pairs every spread after it.
 *
 * THE HINT IS THE DESCRIPTION. It is the puzzle's clue, kept with the puzzle rather than in a
 * separate file that can drift away from the cards it belongs to.
 *
 * PAGES ARE CREATED PUBLIC, and the binder is not. That looks backwards and is not: a page's
 * `is_public` is what the SHARE RENDERER can see, and it reads the binder as an anonymous caller.
 * A binder that is private is invisible either way, so a private page inside it buys nothing; but
 * the day the binder is showcased, private pages make it render "nothing to draw" and show an empty
 * binder to anyone who opens the link. That is exactly what happened: this script wrote `false`
 * here, and the Studio download failed with no useful message until it was found.
 *
 * THE BACKGROUND IS A HOTLINKED PHOTOGRAPH, which is what `binder_pages.background_color` takes
 * besides a colour: an http(s) URL is read as a picture and a #rrggbb as a colour (see
 * src/data/pageStyle.ts, isImageRef). The app's own stock-art picker re-hosts and credits a picture
 * it imports into a SLOT; a background is not a slot and has no attribution column, so the
 * photographer is recorded in the report instead and the page simply points at the provider.
 *
 * PAGE SIZE IS BINDER-WIDE, so each puzzle is built at the size it would be funnelled TO: 2x2 for
 * the small sets, 3x3 for the large ones. Cards overflow onto further pages rather than being cut.
 *
 *   node scripts/puzzles/import-puzzles.mjs            (dry run)
 *   node scripts/puzzles/import-puzzles.mjs --apply     (through the .ps1 wrapper)
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const DIR = join(ROOT, 'state', 'puzzles');
const PROJECT_REF = 'piikwvntldytjejxmcla';
const USERNAME = process.env.IMPORT_USERNAME || 'fakemichi';

const APPLY = process.argv.includes('--apply');
const token = process.env.SUPABASE_ACCESS_TOKEN;

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

/**
 * The puzzles, their page size, and the phrase the backdrop is searched for. The hint is the
 * binder's description exactly as a player would read it, so it is written here and not generated.
 */
const PUZZLES = [
  {
    file: 'forest-underwater.json',
    title: 'Daily Puzzle: forest + underwater',
    hint: 'A forest with no air in it.',
    rows: 2, cols: 2,
    backdrop: 'kelp forest underwater',
  },
  {
    file: 'storm-ocean.json',
    title: 'Daily Puzzle: storm + ocean',
    hint: 'What sailors call the worst night of their lives.',
    rows: 3, cols: 3,
    backdrop: 'ocean storm waves dark sea',
  },
  {
    file: 'clouds-lake.json',
    title: 'Daily Puzzle: clouds + lake',
    hint: 'Put the two words side by side and you have somewhere a company keeps its data.',
    rows: 2, cols: 2,
    backdrop: 'mountain lake clouds reflection',
  },
  {
    file: 'forest-ruins.json',
    title: 'Daily Puzzle: forest + ruins',
    hint: 'The second act of every adventure movie.',
    rows: 2, cols: 2,
    backdrop: 'jungle temple ruins overgrown',
  },
  {
    file: 'flowers-city.json',
    title: 'Daily Puzzle: flowers + city',
    hint: 'Two words for the kind of town a planner promises you.',
    rows: 3, cols: 3,
    backdrop: 'city street flowers blossom',
  },
];

function readVars(file, names) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    if (names.includes(k)) out[k] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const keys = readVars(join(ROOT, '.env'), ['EXPO_PUBLIC_PEXELS_KEY', 'EXPO_PUBLIC_PIXABAY_KEY']);

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

/** A landscape photograph for a phrase. Pexels first; Pixabay when it has no key or no answer. */
async function backdropFor(phrase) {
  if (keys.EXPO_PUBLIC_PEXELS_KEY) {
    const res = await fetch(
      `https://api.pexels.com/v1/search?per_page=1&orientation=landscape&query=${encodeURIComponent(phrase)}`,
      { headers: { Authorization: keys.EXPO_PUBLIC_PEXELS_KEY } },
    );
    if (res.ok) {
      const j = await res.json();
      const p = j.photos?.[0];
      if (p) return { url: p.src?.large2x ?? p.src?.large ?? p.src?.original, credit: p.photographer, source: 'Pexels', page: p.url };
    }
  }
  if (keys.EXPO_PUBLIC_PIXABAY_KEY) {
    const res = await fetch(
      `https://pixabay.com/api/?per_page=3&orientation=horizontal&image_type=photo`
      + `&key=${keys.EXPO_PUBLIC_PIXABAY_KEY}&q=${encodeURIComponent(phrase)}`,
    );
    if (res.ok) {
      const j = await res.json();
      const p = j.hits?.[0];
      if (p) return { url: p.largeImageURL ?? p.webformatURL, credit: p.user, source: 'Pixabay', page: p.pageURL };
    }
  }
  return null;
}

console.log(APPLY ? '*** APPLY: this will write to the live database ***\n' : 'DRY RUN: nothing will be written.\n');

step(1, `resolving @${USERNAME}`);
const who = await sql(`
  select p.id, p.username, public.michi_tier(p.id) as tier
  from public.profiles p where lower(p.username) = lower(${q(USERNAME)}) limit 1;
`);
if (!who.length) fail(`no profile with username '${USERNAME}'`);
const me = who[0];
console.log(`  ${me.id}  @${me.username}  tier ${me.tier}`);

step(2, 'building');
const built = [];
for (const p of PUZZLES) {
  const path = join(DIR, p.file);
  if (!existsSync(path)) fail(`${p.file} not found. Run scripts/theme-candidates.mjs first.`);
  const { themes, cards } = JSON.parse(readFileSync(path, 'utf8'));
  const per = p.rows * p.cols;

  const art = await backdropFor(p.backdrop);
  if (!art) console.log(`  WARNING: no backdrop found for "${p.backdrop}"`);

  // Page 0 is deliberately empty. Pages 1..n hold the cards, in the order the search returned them.
  const pages = [{ id: randomUUID(), title: null, blank: true, slots: [] }];
  for (let i = 0; i < cards.length; i += per) {
    const chunk = cards.slice(i, i + per);
    pages.push({
      id: randomUUID(),
      title: `Candidates ${i + 1} to ${i + chunk.length}`,
      blank: false,
      slots: chunk.map((c, k) => ({
        id: randomUUID(),
        row: Math.floor(k / p.cols),
        col: k % p.cols,
        cardId: c.id,
        name: c.name,
      })),
    });
  }

  built.push({ ...p, id: randomUUID(), themes, cards, pages, art });
  console.log(
    `  "${p.title}"  ${p.rows}x${p.cols}  ${cards.length} cards over ${pages.length - 1} page(s) + 1 blank`
    + `  backdrop: ${art ? `${art.source} by ${art.credit}` : 'NONE'}`,
  );
}

if (!APPLY) {
  console.log('\nOK: dry run only. Re-run with --apply to write.');
} else {
  step(3, 'removing any previous run');
  for (const b of built) {
    const del = await sql(`delete from public.binders where owner_id = ${q(me.id)} and title = ${q(b.title)} returning id;`);
    if (del.length) console.log(`  removed ${del.length} previous "${b.title}"`);
  }

  step(4, 'writing');
  for (const b of built) {
    await sql(`
      insert into public.binders (id, owner_id, title, description, layout_style, cover_card_id, is_public, is_demo)
      values (${q(b.id)}, ${q(me.id)}, ${q(b.title)}, ${q(b.hint)}, 'themed_story',
              ${q(b.cards[0]?.id ?? null)}, false, false);
    `);
    const pageValues = b.pages
      .map((pg, i) =>
        `(${q(pg.id)}, ${q(b.id)}, ${i}, ${q(pg.title)}, ${b.rows}, ${b.cols}, ${q(b.art?.url ?? null)}, true)`,
      )
      .join(',\n        ');
    await sql(`
      insert into public.binder_pages (id, binder_id, position, title, rows, cols, background_color, is_public)
      values ${pageValues};
    `);
    const rows = b.pages.flatMap((pg) =>
      pg.slots.map((s) => `(${q(s.id)}, ${q(pg.id)}, ${s.row}, ${s.col}, 1, 1, 'card', ${q(s.cardId)})`),
    );
    if (rows.length) {
      await sql(`
        insert into public.binder_slots (id, page_id, row_index, col_index, row_span, col_span, slot_type, card_id)
        values ${rows.join(',\n        ')};
      `);
    }
    console.log(`  wrote "${b.title}": ${b.pages.length} pages (1 blank), ${rows.length} cards`);
  }

  step(5, 'reading it back');
  for (const b of built) {
    const [check] = await sql(`
      select b.title, b.description,
             (select count(*) from public.binder_pages p where p.binder_id = b.id) as pages,
             (select count(*) from public.binder_slots s
                join public.binder_pages p2 on p2.id = s.page_id where p2.binder_id = b.id) as slots,
             (select count(*) from public.binder_pages p3
                where p3.binder_id = b.id and p3.background_color is not null) as with_background,
             (select count(*) from public.binder_slots s2
                join public.binder_pages p4 on p4.id = s2.page_id
                where p4.binder_id = b.id and p4.position = 0) as slots_on_page_one
      from public.binders b where b.id = ${q(b.id)};
    `);
    if (!check) fail(`"${b.title}" is not on the server after writing it`);
    const ok = Number(check.pages) === b.pages.length
      && Number(check.slots) === b.cards.length
      && Number(check.slots_on_page_one) === 0
      && Number(check.with_background) === (b.art ? b.pages.length : 0)
      && check.description === b.hint;
    console.log(
      `  ${ok ? 'ok  ' : 'BAD '} "${check.title}": ${check.pages} pages, ${check.slots} cards, `
      + `${check.with_background} backed, page 1 empty: ${Number(check.slots_on_page_one) === 0}`,
    );
    if (!ok) fail('what landed does not match what was sent');
  }

  console.log('\nCredits for the backdrops (no attribution column exists on a page, so they live here):');
  for (const b of built) {
    if (b.art) console.log(`  ${b.title}\n      ${b.art.source}, ${b.art.credit}, ${b.art.page}`);
  }
  console.log('\nOK: the puzzle binders are in the account, private.');
}
