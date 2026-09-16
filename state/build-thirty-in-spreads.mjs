// Creates the "Thirty, In Spreads" binder under a real account, from state/thirty-in-spreads.json.
//
// Run through build-thirty-in-spreads.ps1, which loads the service key silently. Never from the
// app. Safe to re-run: a binder of the same title on that account is replaced, not duplicated.
//
// Every pocket is a real card. Where the draft wants art the owner will source, the pocket is
// left EMPTY and the brief is written into the page's description ("Art to find. Row 1, pocket 1
// (2x2): ..."), so the owner sees what goes where when they open the page to edit it.
import { readFileSync } from 'node:fs';

const PROJECT = 'piikwvntldytjejxmcla';
const REST = `https://${PROJECT}.supabase.co/rest/v1`;
const KEY = process.env.MICHI_SERVICE_KEY;
const USERNAME = process.argv[2] ?? 'fakemichi';
const PAYLOAD = new URL('./thirty-in-spreads.json', import.meta.url);

const step = (m) => console.log(m);
const die = (msg, extra) => {
  console.log(`FAILED: ${msg}`);
  if (extra) console.log(String(extra).slice(0, 500));
  process.exit(1);
};
if (!KEY) die('MICHI_SERVICE_KEY is not set (run this through the .ps1)');

const rest = async (path, init = {}) => {
  const res = await fetch(`${REST}/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) die(`${init.method ?? 'GET'} ${path} -> HTTP ${res.status}`, text);
  return text ? JSON.parse(text) : null;
};

const payload = JSON.parse(readFileSync(PAYLOAD, 'utf8'));
step(`0/5  Payload: "${payload.title}", ${payload.pages.length} pages, ${payload.pages.reduce((n, p) => n + p.slots.length, 0)} cards`);

step(`1/5  Finding @${USERNAME}...`);
const profiles = await rest(`profiles?username=eq.${encodeURIComponent(USERNAME)}&select=id,username`);
if (!profiles?.length) die(`no account with username "${USERNAME}"`);
const OWNER = profiles[0].id;

step('2/5  Removing an earlier build of the same title, if any...');
const old = await rest(`binders?owner_id=eq.${OWNER}&title=eq.${encodeURIComponent(payload.title)}&select=id`);
for (const b of old ?? []) await rest(`binders?id=eq.${b.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
if (old?.length) step(`     removed ${old.length}`);

step('3/5  Creating the binder (private)...');
const pageStyle = { binder: payload.preset, details: { zip: {}, spine: 'cross' } };
// THE ANNIVERSARY BINDER round it: the Vault X 9-pocket Anniversary in white and gold, with the
// two set logos as stickers and a title on the four surfaces. Positions are fractions of the
// surface, centre-anchored, as the cover editor writes them; the owner moves them from there.
// The Classic Collection has no logo of its own in the catalogue, so the Celebration's logo and
// its set symbol are the two stickers.
const ART = (file) => `https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public/set-art/set-art/sets/${file}`;
const uuid = () => crypto.randomUUID();
const sticker = (file, aspect, x, y, w, rot) => ({ id: uuid(), kind: 'sticker', imageUrl: ART(file), stickerId: 'set:24722', x, y, w, h: w * aspect, ...(rot ? { rot } : {}), attribution: { sourceName: 'Pokémon TCG', origin: 'logo' } });
const logo = (x, y, w, rot) => sticker('24722-logo.png', 0.42, x, y, w, rot);
const symbol = (x, y, w, rot) => sticker('24722-sym.png', 1, x, y, w, rot);
const text = (t, x, y, size, opts = {}) => ({ id: uuid(), kind: 'text', text: t, font: 'serif', size, weight: 'bold', align: 'center', color: '#8a6d1f', x, y, w: 0.8, h: size * 1.6, ...opts });
const cover = {
  modelId: 'vaultx-exotec-zip-9-anniversary',
  colourway: 'anniversary-white',
  showCover: true,
  surfaces: {
    front: [logo(0.5, 0.36, 0.6), text('Thirty, In Spreads', 0.5, 0.62, 0.075), text('every card, once', 0.5, 0.72, 0.035, { weight: 'regular', italic: true })],
    frontInside: [symbol(0.5, 0.3, 0.22), text('Sixteen spreads, one idea each.', 0.5, 0.55, 0.04, { weight: 'regular' })],
    backInside: [logo(0.3, 0.2, 0.34, 352), symbol(0.74, 0.78, 0.16, 8)],
    back: [logo(0.5, 0.48, 0.55), text('1996 to 2026', 0.5, 0.8, 0.05)],
  },
};
const [binder] = await rest('binders', {
  method: 'POST',
  body: JSON.stringify({
    owner_id: OWNER,
    title: payload.title,
    description: payload.description,
    layout_style: 'themed_story',
    is_public: false,
    page_style: pageStyle,
    cover,
    cover_card_id: payload.pages.find((p) => p.slots.length)?.slots[0]?.cardId ?? null,
  }),
});

step('4/5  Pages...');
const pageRows = await rest('binder_pages', {
  method: 'POST',
  body: JSON.stringify(
    payload.pages.map((p, i) => ({ binder_id: binder.id, position: i, title: p.title, notes: p.description || null, rows: 3, cols: 3, background_color: payload.cloth })),
  ),
});
const byPos = new Map(pageRows.map((r) => [r.position, r.id]));

step('5/5  Pockets...');
const slots = [];
payload.pages.forEach((p, i) => {
  for (const s of p.slots) slots.push({ page_id: byPos.get(i), row_index: s.row, col_index: s.col, row_span: s.rowSpan, col_span: s.colSpan, slot_type: 'card', card_id: s.cardId });
});
for (let i = 0; i < slots.length; i += 100) await rest('binder_slots', { method: 'POST', body: JSON.stringify(slots.slice(i, i + 100)), headers: { Prefer: 'return=minimal' } });

console.log(`\nDONE. https://michi-maker.com/binder/${binder.id}  (private, under @${USERNAME}, ${slots.length} cards)`);
