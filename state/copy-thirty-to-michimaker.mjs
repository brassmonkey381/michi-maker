// Copies one binder EXACTLY (binder row, cover, page style, soundtrack, every page, every pocket
// with its card, art, crop and notes) onto another account, public. Then hides the earlier
// published "Thirty Years, Thirty Pages" on that account (is_public false; nothing deleted).
//
//   node state/copy-thirty-to-michimaker.mjs <source-binder-id> [target-username] [old-copy-id]
//
// Run through copy-thirty-to-michimaker.ps1, which loads the service key silently.
const PROJECT = 'piikwvntldytjejxmcla';
const REST = `https://${PROJECT}.supabase.co/rest/v1`;
const KEY = process.env.MICHI_SERVICE_KEY;
const SOURCE = process.argv[2] ?? '0aac0c11-e0a0-4918-8b41-7bdf2e3fbdbe';
const TARGET = process.argv[3] ?? 'michimaker';
const OLD_COPY = process.argv[4] ?? '4493ccbc-8ae0-4874-ab27-7253b40d7e47';
const die = (m) => { console.log(`FAILED: ${m}`); process.exit(1); };
if (!KEY) die('MICHI_SERVICE_KEY is not set (run this through the .ps1)');

const rest = async (path, init = {}) => {
  const res = await fetch(`${REST}/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) die(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};
// Columns the database owns or that must not travel: identity, timestamps, trigger-set keys,
// the owner, and the collection provenance that belongs to the source account.
const DROP_BINDER = new Set(['id', 'owner_id', 'created_at', 'updated_at', 'share_key', 'page_count', 'like_count', 'archived_at', 'removed_at']);
const DROP_PAGE = new Set(['id', 'binder_id', 'created_at', 'updated_at']);
const DROP_SLOT = new Set(['id', 'page_id', 'created_at', 'updated_at', 'source_entry_id']);
const strip = (row, drop) => Object.fromEntries(Object.entries(row).filter(([k]) => !drop.has(k)));

console.log(`1/5  Finding @${TARGET}...`);
const profiles = await rest(`profiles?username=eq.${encodeURIComponent(TARGET)}&select=id,username`);
if (!profiles?.length) die(`no account with username "${TARGET}"`);
const OWNER = profiles[0].id;

console.log('2/5  Reading the source binder...');
const [src] = await rest(`binders?id=eq.${SOURCE}&select=*`);
if (!src) die('source binder not found');
const pages = await rest(`binder_pages?binder_id=eq.${SOURCE}&select=*&order=position`);
const pageIds = pages.map((p) => p.id);
const slots = [];
for (let i = 0; i < pageIds.length; i += 20) slots.push(...(await rest(`binder_slots?page_id=in.(${pageIds.slice(i, i + 20).join(',')})&select=*`)));
console.log(`     "${src.title}": ${pages.length} pages, ${slots.length} pockets (${slots.filter((s) => s.slot_type === 'artwork').length} art)`);

console.log('3/5  Creating the copy (public)...');
const binderRow = { ...strip(src, DROP_BINDER), owner_id: OWNER, is_public: true };
if (binderRow.from_collection !== undefined) delete binderRow.from_collection;
const [copy] = await rest('binders', { method: 'POST', body: JSON.stringify(binderRow) });

console.log('4/5  Pages and pockets...');
const newPages = await rest('binder_pages', { method: 'POST', body: JSON.stringify(pages.map((p) => ({ ...strip(p, DROP_PAGE), binder_id: copy.id }))) });
const byPosition = new Map(newPages.map((p) => [p.position, p.id]));
const oldPosition = new Map(pages.map((p) => [p.id, p.position]));
const newSlots = slots.map((s) => {
  const row = { ...strip(s, DROP_SLOT), page_id: byPosition.get(oldPosition.get(s.page_id)) };
  // Collection provenance is the source owner's, not the house's.
  if ('from_collection' in row) row.from_collection = false;
  return row;
});
for (let i = 0; i < newSlots.length; i += 100) await rest('binder_slots', { method: 'POST', body: JSON.stringify(newSlots.slice(i, i + 100)), headers: { Prefer: 'return=minimal' } });

console.log('5/5  Hiding the earlier published copy...');
if (OLD_COPY) {
  const hidden = await rest(`binders?id=eq.${OLD_COPY}&owner_id=eq.${OWNER}`, { method: 'PATCH', body: JSON.stringify({ is_public: false }) });
  console.log(hidden?.length ? `     ${OLD_COPY} is now private` : `     ${OLD_COPY} not found on @${TARGET}; nothing hidden`);
}

console.log(`\nDONE. New binder: ${copy.id}\n      https://michi-maker.com/binder/${copy.id}\nPaste that id back to Claude for the pin.`);
