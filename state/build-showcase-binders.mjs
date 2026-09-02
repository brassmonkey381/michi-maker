// Create the two layout-showcase binders on the @michimaker account.
//
// Run it through build-showcase-binders.ps1, which loads the secret silently. It needs the michi
// SERVICE key because it writes rows owned by an account we do not hold a session for, and
// profiles is not readable anonymously.
//
// SAFE TO RE-RUN. It looks for a binder of the same title owned by that account first and, if it
// finds one, deletes it and its pages before writing (binder_pages/binder_slots cascade). So a
// second run replaces rather than duplicating, and a half-finished first run leaves nothing to
// clean up by hand.
//
// It prints every step and stops at the first failure with a non-zero exit.
import { readFileSync } from 'node:fs';

const PROJECT = 'piikwvntldytjejxmcla';
const REST = `https://${PROJECT}.supabase.co/rest/v1`;
const KEY = process.env.MICHI_SERVICE_KEY;
const USERNAME = process.env.MICHI_SHOWCASE_USER ?? 'michimaker';
// The SAME file the app bundles as example binders (src/data/content/showcase.ts), so the
// copies on the account and the copies in the app can never drift apart.
const PAYLOAD = new URL('../src/data/showcaseBinders.json', import.meta.url);

if (!KEY) {
  console.log('FAILED: MICHI_SERVICE_KEY is not set (run this through the .ps1)');
  process.exit(1);
}

const step = (msg) => console.log(msg);
const die = (msg, extra) => {
  console.log(`FAILED: ${msg}`);
  if (extra) console.log(String(extra).slice(0, 500));
  process.exit(1);
};

const rest = async (path, init = {}) => {
  const res = await fetch(`${REST}/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) die(`${init.method ?? 'GET'} ${path} -> HTTP ${res.status}`, text);
  return text ? JSON.parse(text) : null;
};

// 1. Whose account is this?
step(`1/5  Finding @${USERNAME}...`);
const profiles = await rest(`profiles?username=eq.${encodeURIComponent(USERNAME)}&select=id,username`);
if (!profiles?.length) die(`no account with username "${USERNAME}"`);
const OWNER = profiles[0].id;
step(`     owner resolved (id ends ...${String(OWNER).slice(-6)})`);

// 2. What are we writing?
step('2/5  Reading the drafted binders...');
const binders = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
const totals = binders.map(
  (b) =>
    `${b.title}: ${b.pages.length} pages, ` +
    `${b.pages.reduce((n, p) => n + p.slots.filter((s) => s.type === 'card').length, 0)} cards, ` +
    `${b.pages.reduce((n, p) => n + p.slots.filter((s) => s.type === 'artwork').length, 0)} art panels`,
);
for (const t of totals) step(`     ${t}`);

for (const [i, binder] of binders.entries()) {
  step(`3/5  [${i + 1}/${binders.length}] ${binder.title}`);

  // Replace rather than duplicate.
  const existing = await rest(
    `binders?owner_id=eq.${OWNER}&title=eq.${encodeURIComponent(binder.title)}&select=id`,
  );
  for (const old of existing ?? []) {
    await rest(`binders?id=eq.${old.id}`, { method: 'DELETE' });
    step(`     replaced an earlier copy`);
  }

  const made = await rest('binders', {
    method: 'POST',
    body: JSON.stringify({
      owner_id: OWNER,
      title: binder.title,
      description: binder.description,
      is_public: true,
      // Model, colourway, the set stickers on the front, and showCover so the binder leads with
      // its cover rather than its first page wherever it is shown small.
      cover: binder.cover ?? null,
    }),
  });
  const binderId = made?.[0]?.id;
  if (!binderId) die('the binder row came back without an id');

  step(`4/5     writing ${binder.pages.length} pages...`);
  // Pages in one insert so their positions cannot interleave with anything else.
  const pageRows = await rest('binder_pages', {
    method: 'POST',
    body: JSON.stringify(
      binder.pages.map((p, position) => ({
        binder_id: binderId,
        position,
        title: p.title,
        notes: p.description,
        rows: p.rows,
        cols: p.cols,
      })),
    ),
  });
  if (pageRows.length !== binder.pages.length) die('not every page was written');
  // PostgREST returns inserted rows in input order, but position is the authority — sort by it
  // rather than trusting that, so a slot can never land on the wrong page.
  const byPosition = new Map(pageRows.map((r) => [r.position, r.id]));

  const slotRows = [];
  binder.pages.forEach((p, position) => {
    const pageId = byPosition.get(position);
    if (!pageId) die(`page ${position} has no row`);
    for (const s of p.slots) {
      slotRows.push({
        page_id: pageId,
        row_index: s.row,
        col_index: s.col,
        row_span: s.rowSpan,
        col_span: s.colSpan,
        slot_type: s.type,
        card_id: s.cardId ?? null,
        // "<templateId>:<role>" — why a template put art in this pocket (see binderRepo).
        notes: s.artRole ? `${s.artTemplateId ?? ''}:${s.artRole}` : null,
      });
    }
  });

  step(`5/5     writing ${slotRows.length} slots...`);
  // In chunks: one 3,000-row insert is a big statement and a timeout mid-way would be hard to
  // reason about. 400 keeps each call small and the progress honest.
  for (let i = 0; i < slotRows.length; i += 400) {
    await rest('binder_slots', { method: 'POST', body: JSON.stringify(slotRows.slice(i, i + 400)) });
    step(`        ${Math.min(i + 400, slotRows.length)}/${slotRows.length}`);
  }
  step(`     DONE  https://michi-maker.com/binder/${binderId}`);
}

console.log('\nAll done. Both binders are on the account and public.');
