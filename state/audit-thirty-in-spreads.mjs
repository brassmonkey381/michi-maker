// READ-ONLY: counts the anniversary cards in a binder and lists the missing ones.
// Run through audit-thirty-in-spreads.ps1, which loads the service key silently.
//   node state/audit-thirty-in-spreads.mjs <binder-id>
import { readFileSync } from 'node:fs';

const PROJECT = 'piikwvntldytjejxmcla';
const REST = `https://${PROJECT}.supabase.co/rest/v1`;
const KEY = process.env.MICHI_SERVICE_KEY;
const BINDER_ID = process.argv[2] ?? '0aac0c11-e0a0-4918-8b41-7bdf2e3fbdbe';
const CATALOG = 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1';
const die = (m) => { console.log(`FAILED: ${m}`); process.exit(1); };
if (!KEY) die('MICHI_SERVICE_KEY is not set (run this through the .ps1)');

let catalogKey = '';
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  if (line.startsWith('EXPO_PUBLIC_CATALOG_API_KEY=')) catalogKey = line.slice(line.indexOf('=') + 1).trim();
}
if (!catalogKey) die('EXPO_PUBLIC_CATALOG_API_KEY missing from .env');

const get = async (url, key) => {
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) die(`${res.status} ${url.slice(0, 80)}`);
  return res.json();
};

console.log('1/3  Reading the binder...');
const [binder] = await get(`${REST}/binders?id=eq.${BINDER_ID}&select=title,is_public,binder_pages(position,title,binder_slots(card_id,slot_type))`, KEY);
if (!binder) die('no such binder');
console.log(`     "${binder.title}", ${binder.binder_pages.length} pages, public=${binder.is_public}`);

console.log('2/3  Reading the two anniversary sets...');
const sets = { e: await get(`${CATALOG}/cards?select=id,name,number,rarity&set_id=eq.24722&order=number&limit=300`, catalogKey), c: await get(`${CATALOG}/cards?select=id,name,number,rarity&set_id=eq.24837&order=number&limit=300`, catalogKey) };
const byId = new Map();
for (const [k, pool] of Object.entries(sets)) for (const x of pool) byId.set(x.id, { set: k, ...x });

console.log('3/3  Comparing...\n');
const slots = binder.binder_pages.flatMap((p) => p.binder_slots);
const cards = slots.filter((s) => s.slot_type === 'card' && s.card_id).map((s) => s.card_id);
const count = new Map();
for (const id of cards) count.set(id, (count.get(id) ?? 0) + 1);
const inSets = [...count.keys()].filter((id) => byId.has(id));
const others = [...count.keys()].filter((id) => !byId.has(id));
const label = (x) => `${x.number} ${x.name}${x.rarity ? ` [${x.rarity}]` : ''}`;

console.log(`Card pockets: ${cards.length}. Art and other slots: ${slots.length - cards.length}.`);
console.log(`Anniversary cards present: ${inSets.length} of ${byId.size}. Cards from other sets: ${others.length}.`);
const dups = [...count].filter(([id, n]) => n > 1 && byId.has(id)).map(([id, n]) => `${label(byId.get(id))} x${n}`);
console.log(`Duplicates: ${dups.length ? dups.join('; ') : 'none'}`);
for (const [k, name] of [['e', 'ME: 30th Celebration'], ['c', 'Classic Collection']]) {
  const pool = sets[k];
  const missing = pool.filter((x) => !count.has(x.id));
  console.log(`\n${name}: ${pool.length - missing.length} of ${pool.length}`);
  console.log(missing.length ? `MISSING (${missing.length}): ${missing.map(label).join('; ')}` : 'complete');
}
console.log('\nDONE.');
