/**
 * STAGE 7/8: put the binders in the account. Dry run by default; writes only with --apply.
 *
 * ORDER IS NOT OPTIONAL. binder, then pages, then slots: the foreign keys run that way and a slot
 * whose page does not exist yet is refused. Slots go in chunks because every page and slot write
 * touches the parent binder, and one 534-row statement is one long lock for no benefit.
 *
 * RE-RUNNABLE. It deletes any binder it previously created (matched on title) before inserting, so
 * running it twice replaces rather than duplicates. That delete is the only destructive thing here
 * and it is scoped to the three titles this script owns, on one account.
 *
 * PAGES ARE CREATED VISIBLE, the binder is not. A page's `is_public` is what the share renderer
 * can see, and it reads as an anonymous caller; a private page inside a private binder buys
 * nothing, while a private page inside a binder that is later made public renders "nothing to
 * draw". This wrote `false` and cost an afternoon to find.
 *
 * CAPS. The insert-time triggers enforce binders and pages per tier, and they refuse mid-batch, so
 * an account that cannot hold this ends up with half of it. The target was checked beforehand
 * (scripts/check-import-target.mjs): @fakemichi is vip, both caps unlimited. The dry run prints
 * the tier again so it is never assumed.
 *
 *   node scripts/connected-art/7-import.mjs              (dry run, writes nothing)
 *   node scripts/connected-art/7-import.mjs --apply      (writes, through the .ps1 wrapper)
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');
const PROJECT_REF = 'piikwvntldytjejxmcla';
const USERNAME = process.env.IMPORT_USERNAME || 'fakemichi';

const APPLY = process.argv.includes('--apply');
const ONLY_FIRST = process.argv.includes('--first-only');
const token = process.env.SUPABASE_ACCESS_TOKEN;

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const payloadPath = join(DIR, 'payload.json');
if (!existsSync(payloadPath)) fail('payload.json not found. Run 6-build-payload.mjs first.');
const { binders, credit } = JSON.parse(readFileSync(payloadPath, 'utf8'));
const chosen = ONLY_FIRST ? binders.slice(0, 1) : binders;

console.log(APPLY ? '*** APPLY: this will write to the live database ***\n' : 'DRY RUN: nothing will be written.\n');

step(1, `resolving @${USERNAME}`);
const who = await sql(`
  select p.id, p.username, public.michi_tier(p.id) as tier,
         (select count(*) from public.binders b where b.owner_id = p.id and b.archived_at is null) as binders_now
  from public.profiles p where lower(p.username) = lower(${q(USERNAME)}) limit 1;
`);
if (!who.length) fail(`no profile with username '${USERNAME}'`);
const me = who[0];
console.log(`  ${me.id}  @${me.username}  tier ${me.tier}  holds ${me.binders_now} binders`);
if (me.tier !== 'pro' && me.tier !== 'vip') {
  console.log('  WARNING: this tier has finite binder and page caps, enforced at INSERT.');
  console.log('  A bulk import will fail part way and leave a half-built binder behind.');
  if (APPLY) fail('refusing to write to a capped account. Grant PRO first, or import fewer binders.');
}

step(2, 'what would be written');
let pages = 0;
let slots = 0;
for (const b of chosen) {
  const s = b.pages.reduce((n, p) => n + p.slots.length, 0);
  pages += b.pages.length;
  slots += s;
  console.log(`  "${b.title}"  (${b.pageShape})  ${b.pages.length} pages, ${s} cards, is_public=${b.isPublic}`);
  for (const p of b.pages.slice(0, 3)) {
    const cells = p.slots.map((x) => `(${x.row},${x.col})${x.cardId}`).join(' ');
    console.log(`      page "${p.title}" [${p.description ?? ''}] ${p.rows}x${p.cols}: ${cells}`);
  }
  if (b.pages.length > 3) console.log(`      ... and ${b.pages.length - 3} more pages`);
}
console.log(`  TOTAL: ${chosen.length} binder(s), ${pages} pages, ${slots} cards`);
console.log(`  credit on every binder: "${credit.slice(0, 80)}..."`);

// NOT process.exit(0) HERE. Node on Windows asserts inside libuv when the process exits while
// a fetch handle is still closing, which turned a clean dry run into a crash and a negative
// exit code. The write path is guarded instead, and the process ends by running out of work.
if (APPLY) {
  step(3, 'removing any previous run of this import');
  for (const b of chosen) {
    const del = await sql(`delete from public.binders where owner_id = ${q(me.id)} and title = ${q(b.title)} returning id;`);
    if (del.length) console.log(`  removed ${del.length} previous "${b.title}" (its pages and slots go by cascade)`);
  }

  step(4, 'writing');
  for (const b of chosen) {
    await sql(`
      insert into public.binders (id, owner_id, title, description, layout_style, cover_card_id, is_public, is_demo)
      values (${q(b.id)}, ${q(me.id)}, ${q(b.title)}, ${q(b.description)}, ${q(b.layoutStyle)}, ${q(b.coverCardId)}, false, false);
    `);
    const pageValues = b.pages
      .map((p, i) =>
        `(${q(p.id)}, ${q(b.id)}, ${i}, ${q(p.title)}, ${q(p.description)}, ${p.rows}, ${p.cols}, true)`,
      )
      .join(',\n    ');
    await sql(`
      insert into public.binder_pages (id, binder_id, position, title, notes, rows, cols, is_public)
      values ${pageValues};
    `);

    const rows = b.pages.flatMap((p) =>
      p.slots.map((s) => `(${q(s.id)}, ${q(p.id)}, ${s.row}, ${s.col}, 1, 1, 'card', ${q(s.cardId)})`),
    );
    // Chunked: every slot write touches the parent binder, so one enormous statement is one long
    // lock and a single failure that says nothing about which row caused it.
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      await sql(`
        insert into public.binder_slots (id, page_id, row_index, col_index, row_span, col_span, slot_type, card_id)
        values ${part.join(',\n      ')};
      `);
      console.log(`    ${b.title}: slots ${i + part.length}/${rows.length}`);
    }
    console.log(`  wrote "${b.title}": ${b.pages.length} pages, ${rows.length} cards`);
  }

  step(5, 'reading it back');
  for (const b of chosen) {
    const [check] = await sql(`
      select b.title,
             (select count(*) from public.binder_pages p where p.binder_id = b.id) as pages,
             (select count(*) from public.binder_slots s
                join public.binder_pages p2 on p2.id = s.page_id where p2.binder_id = b.id) as slots,
             b.is_public
      from public.binders b where b.id = ${q(b.id)};
    `);
    if (!check) fail(`"${b.title}" is not on the server after writing it`);
    const want = b.pages.reduce((n, p) => n + p.slots.length, 0);
    const ok = Number(check.pages) === b.pages.length && Number(check.slots) === want && check.is_public === false;
    console.log(`  ${ok ? 'ok  ' : 'BAD '} "${check.title}": ${check.pages} pages, ${check.slots} cards, public=${check.is_public}`);
    if (!ok) fail('what landed does not match what was sent');
  }

  console.log('\nOK: the binders are in the account, private.');
} else {
  console.log('\nOK: dry run only. Re-run with --apply to write.');
}
