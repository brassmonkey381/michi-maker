// READ-ONLY: dumps a binder's pages (titles, notes, every pocket with its card or art) to
// state/thirty-live.json so the page descriptions can be written against what is really there.
//   node state/dump-thirty-in-spreads.mjs <binder-id>
import { readFileSync, writeFileSync } from 'node:fs';

const PROJECT = 'piikwvntldytjejxmcla';
const REST = `https://${PROJECT}.supabase.co/rest/v1`;
const KEY = process.env.MICHI_SERVICE_KEY;
const BINDER_ID = process.argv[2] ?? '0aac0c11-e0a0-4918-8b41-7bdf2e3fbdbe';
const CATALOG = 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1';
const OUT = new URL('./thirty-live.json', import.meta.url);
const die = (m) => { console.log(`FAILED: ${m}`); process.exit(1); };
if (!KEY) die('MICHI_SERVICE_KEY is not set (run this through the .ps1)');
let catalogKey = '';
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  if (line.startsWith('EXPO_PUBLIC_CATALOG_API_KEY=')) catalogKey = line.slice(line.indexOf('=') + 1).trim();
}
const get = async (url, key) => {
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) die(`${res.status} ${url.slice(0, 90)}`);
  return res.json();
};
console.log('1/3  Reading the binder...');
const [binder] = await get(`${REST}/binders?id=eq.${BINDER_ID}&select=id,title,description,page_style,cover,binder_pages(id,position,title,notes,rows,cols,background_color,binder_slots(row_index,col_index,row_span,col_span,slot_type,card_id,image_url,notes))`, KEY);
if (!binder) die('no such binder');
console.log('2/3  Naming the cards...');
const ids = [...new Set(binder.binder_pages.flatMap((p) => p.binder_slots.map((s) => s.card_id).filter(Boolean)))];
const names = new Map();
for (let i = 0; i < ids.length; i += 80) {
  const rows = await get(`${CATALOG}/cards?select=id,name,number,rarity,set_id&id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})`, catalogKey);
  for (const r of rows) names.set(r.id, r);
}
console.log('3/3  Writing...');
const pages = binder.binder_pages.sort((a, b) => a.position - b.position).map((p) => ({
  position: p.position, id: p.id, title: p.title, notes: p.notes, rows: p.rows, cols: p.cols,
  slots: p.binder_slots.sort((a, b) => a.row_index - b.row_index || a.col_index - b.col_index).map((s) => {
    const c = s.card_id ? names.get(s.card_id) : null;
    return { at: `r${s.row_index + 1}c${s.col_index + 1}`, span: s.row_span > 1 || s.col_span > 1 ? `${s.row_span}x${s.col_span}` : undefined, type: s.slot_type, card: c ? `${c.set_id === 24722 ? 'e' : c.set_id === 24837 ? 'c' : 'other'}:${c.number} ${c.name}${c.rarity ? ` [${c.rarity}]` : ''}` : undefined, cardId: s.card_id ?? undefined, art: s.image_url ? s.image_url.slice(0, 120) : undefined };
  }),
}));
writeFileSync(OUT, JSON.stringify({ id: binder.id, title: binder.title, description: binder.description, page_style: binder.page_style, pages }, null, 1));
console.log(`DONE. ${pages.length} pages -> state/thirty-live.json`);
