/**
 * Turn a tcgscan STORAGE UNIT into a michi-maker binder you can actually look at.
 *
 * tcgscan now records where every scanned card physically is: which binder or stack, which page,
 * which pocket. michi-maker already knows how to draw a binder. This is the seam between them,
 * run as a one-off so the two sessions @fakemichi scanned can be seen as pages rather than as
 * rows in a table.
 *
 * EVERY POCKET IS MARKED from_collection. That is michi's existing provenance flag (DemoSlot
 * .fromCollection, binder_slots.from_collection) and it is not decoration: MyCollection counts
 * only from-collection pockets as PLACED, so each tile reads (free/owned) with placed copies
 * subtracted, and Reclaim can only pull a card back out of a pocket carrying it. A pocket without
 * it is aspirational: a card you would like, placed from browsing, consuming nothing.
 *
 * These pockets are the opposite of aspirational. The card is physically in that binder; a scan
 * is the strongest possible evidence of ownership. Leaving them unmarked would show a collection
 * where every copy is still free while 66 of them sit in a binder on the desk, and would make
 * those pockets unreclaimable.
 *
 * WHAT IT DOES NOT DO. It does not sync, subscribe, or run on a schedule, and nothing in either
 * app calls it. It reads tcgscan's portfolio_entries and writes michi's binders/binder_pages/
 * binder_slots for the same account (one identity, one project, see 20260714120000). Re-running
 * it replaces the binders it made before, matched by title, so it is safe to iterate with.
 *
 * THE TWO SHAPES:
 *   a BINDER unit already is pages and pockets. storage_page becomes the page position and
 *   storage_pos becomes the pocket, decoded through the unit's grid (pos = row * cols + col), so
 *   a card lands in the pocket it physically occupies, holes and all.
 *
 *   a STACK is a pile with no pages at all, so this deals it into pages of the same shape, in
 *   the order the pile reads: top card first (highest ordinal), which is the card you would pick
 *   up. That is a placeholder, not a design. A pile is not a binder and the right way to show one
 *   is still an open question; laying it out in rows at least makes it visible.
 *
 *   node scripts/build-binders-from-scans.mjs            # for @fakemichi
 *   node scripts/build-binders-from-scans.mjs someuser
 */
import { readFileSync } from 'node:fs';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const USERNAME = process.argv[2] ?? 'fakemichi';
/** Pages this deals a stack into. Matches the binders scanned so far. */
const STACK_ROWS = 3;
const STACK_COLS = 4;

const secrets = {};
for (const line of readFileSync('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets', 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0) secrets[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const token = process.env.SUPABASE_ACCESS_TOKEN ?? secrets.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set and is not in tcgscan.secrets.');
  process.exit(2);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}
/** Single-quote escaping for values interpolated into the statements below. */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

try {
  const [who] = await sql(`select id from public.profiles where username = ${q(USERNAME)};`);
  if (!who) {
    console.log(`FAILED: no account named @${USERNAME}.`);
    process.exit(2);
  }
  const owner = who.id;
  console.log(`Building binders for @${USERNAME}`);

  // The grid columns may not be applied yet (apply-storage-grid.ps1). Ask before selecting them:
  // a missing column is a 400 on the whole statement, and the fallback shape is the one every
  // binder scanned so far actually has.
  const hasGrid = (await sql(`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'storage_units' and column_name = 'grid_cols';`)).length > 0;
  if (!hasGrid) console.log(`  (no grid recorded yet, assuming ${STACK_ROWS}x${STACK_COLS})`);

  const units = await sql(`
    select su.id, su.name, su.kind, su.insertion_order, c.name as collection,
           ${hasGrid ? 'su.grid_rows, su.grid_cols' : 'null::int as grid_rows, null::int as grid_cols'}
    from public.storage_units su
    join public.collections c on c.user_id = su.user_id and c.id = su.collection_id
    where su.user_id = ${q(owner)}
    order by su.kind, su.created_at;`);
  if (!units.length) {
    console.log('Nothing to build: this account has no storage units yet.');
    process.exit(0);
  }

  for (const u of units) {
    const cards = await sql(`
      select card_id, storage_page, storage_pos
      from public.portfolio_entries
      where user_id = ${q(owner)} and storage_id = ${q(u.id)}
      order by storage_page nulls last, storage_pos;`);
    if (!cards.length) {
      console.log(`  ${u.name}: no cards, skipped`);
      continue;
    }

    const rows = u.kind === 'binder' ? (u.grid_rows ?? STACK_ROWS) : STACK_ROWS;
    const cols = u.kind === 'binder' ? (u.grid_cols ?? STACK_COLS) : STACK_COLS;
    const title = `${u.collection} · ${u.name}`;

    // PAGES OF PLACED CARDS. A binder keeps the pockets it was scanned into; a stack is dealt
    // into pages in reading order (top of the pile first), because a pile has no pockets.
    const pages = new Map(); // position -> Map(slotIndex -> cardId)
    if (u.kind === 'binder') {
      for (const c of cards) {
        const page = c.storage_page ?? 1;
        if (!pages.has(page)) pages.set(page, new Map());
        // Two cards CAN claim one pocket (two devices, one unit, no unique constraint by
        // design). The first wins the pocket and the second is dropped from the drawing rather
        // than silently overwriting it; the collection still holds both.
        const slots = pages.get(page);
        if (!slots.has(c.storage_pos ?? 0)) slots.set(c.storage_pos ?? 0, c.card_id);
      }
    } else {
      const ordered = [...cards].sort((a, b) => (b.storage_pos ?? 0) - (a.storage_pos ?? 0));
      ordered.forEach((c, i) => {
        const page = Math.floor(i / (rows * cols)) + 1;
        if (!pages.has(page)) pages.set(page, new Map());
        pages.get(page).set(i % (rows * cols), c.card_id);
      });
    }

    // Replace any earlier build of this same unit, so re-running is idempotent rather than
    // additive. Pages and slots go with it by cascade.
    await sql(`delete from public.binders where owner_id = ${q(owner)} and title = ${q(title)};`);

    const [binder] = await sql(`
      insert into public.binders (owner_id, title, description, layout_style, is_public)
      values (
        ${q(owner)}, ${q(title)},
        ${q(`Built from a tcgscan ${u.kind} scan. ${cards.length} cards.`)},
        'freeform', false
      )
      returning id;`);

    const pageNumbers = [...pages.keys()].sort((a, b) => a - b);
    let slotCount = 0;
    for (const [i, pageNo] of pageNumbers.entries()) {
      const [page] = await sql(`
        insert into public.binder_pages (binder_id, position, rows, cols, title)
        values (${q(binder.id)}, ${i}, ${rows}, ${cols}, ${q(`Page ${pageNo}`)})
        returning id;`);
      const slots = pages.get(pageNo);
      const values = [...slots.entries()]
        // A pocket beyond the page's own shape cannot be drawn; skip it rather than fold it back
        // onto another pocket's cell.
        .filter(([slot]) => slot >= 0 && slot < rows * cols)
        .map(([slot, cardId]) =>
          `(${q(page.id)}, ${Math.floor(slot / cols)}, ${slot % cols}, 1, 1, 'card', ${q(cardId)}, true)`);
      if (values.length) {
        await sql(`
          insert into public.binder_slots
            (page_id, row_index, col_index, row_span, col_span, slot_type, card_id, from_collection)
          values ${values.join(', ')};`);
        slotCount += values.length;
      }
    }
    console.log(
      `  ${u.kind.padEnd(6)} ${title}: ${pageNumbers.length} page(s), ${slotCount} card(s)`
      + (u.kind === 'stack' ? ` (dealt ${rows}x${cols}, top of the pile first)` : ''),
    );
  }

  console.log('\nDONE. Open michi-maker as this account to see them (they are private).');
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 2;
}
