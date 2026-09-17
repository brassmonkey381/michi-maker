// Creates the themed one-page showcase binders in state/theme-binders.json under an account,
// private. Run through build-theme-binders.ps1. Re-running replaces a binder of the same title.
import { readFileSync } from 'node:fs';
const PROJECT = 'piikwvntldytjejxmcla';
const REST = `https://${PROJECT}.supabase.co/rest/v1`;
const KEY = process.env.MICHI_SERVICE_KEY;
const USERNAME = process.argv[2] ?? 'fakemichi';
const die = (m) => { console.log(`FAILED: ${m}`); process.exit(1); };
if (!KEY) die('MICHI_SERVICE_KEY is not set (run this through the .ps1)');
const rest = async (path, init = {}) => {
  const res = await fetch(`${REST}/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) die(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};
const binders = JSON.parse(readFileSync(new URL('./theme-binders.json', import.meta.url), 'utf8'));
console.log(`1/3  Finding @${USERNAME}...`);
const profiles = await rest(`profiles?username=eq.${encodeURIComponent(USERNAME)}&select=id`);
if (!profiles?.length) die(`no account with username "${USERNAME}"`);
const OWNER = profiles[0].id;
for (const [i, b] of binders.entries()) {
  console.log(`${i + 2}/3  ${b.title}...`);
  const old = await rest(`binders?owner_id=eq.${OWNER}&title=eq.${encodeURIComponent(b.title)}&select=id`);
  for (const o of old ?? []) await rest(`binders?id=eq.${o.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  const [row] = await rest('binders', { method: 'POST', body: JSON.stringify({ owner_id: OWNER, title: b.title, description: b.description, layout_style: 'themed_story', is_public: false, cover_card_id: b.page.slots[0].cardId }) });
  const [page] = await rest('binder_pages', { method: 'POST', body: JSON.stringify({ binder_id: row.id, position: 0, title: b.page.title, notes: b.page.description, rows: 3, cols: 3, background_color: b.cloth }) });
  await rest('binder_slots', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(b.page.slots.map((s) => ({ page_id: page.id, row_index: s.row, col_index: s.col, row_span: 1, col_span: 1, slot_type: 'card', card_id: s.cardId }))) });
  console.log(`     https://michi-maker.com/binder/${row.id}`);
}
console.log('\nDONE. Both are private under @' + USERNAME + '.');
