// Writes the page descriptions in state/thirty-notes.json onto the live binder. Only
// binder_pages.notes and binders.description change; cards, art and titles are untouched.
import { readFileSync } from 'node:fs';
const PROJECT = 'piikwvntldytjejxmcla';
const REST = `https://${PROJECT}.supabase.co/rest/v1`;
const KEY = process.env.MICHI_SERVICE_KEY;
const die = (m) => { console.log(`FAILED: ${m}`); process.exit(1); };
if (!KEY) die('MICHI_SERVICE_KEY is not set (run this through the .ps1)');
const plan = JSON.parse(readFileSync(new URL('./thirty-notes.json', import.meta.url), 'utf8'));
const patch = async (path, body) => {
  const res = await fetch(`${REST}/${path}`, { method: 'PATCH', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const rows = await res.json().catch(() => null);
  if (!res.ok) die(`PATCH ${path} -> ${res.status} ${JSON.stringify(rows).slice(0, 200)}`);
  if (!Array.isArray(rows) || rows.length !== 1) die(`PATCH ${path} matched ${Array.isArray(rows) ? rows.length : '?'} rows`);
};
console.log('1/2  Binder description...');
await patch(`binders?id=eq.${plan.binderId}`, { description: plan.description });
console.log(`2/2  ${plan.pages.length} page descriptions...`);
for (const p of plan.pages) {
  await patch(`binder_pages?id=eq.${p.id}&binder_id=eq.${plan.binderId}`, { notes: p.notes });
  console.log(`     ${String(p.position + 1).padStart(2)}  ${p.title}`);
}
console.log('\nDONE. Reload the binder to see the new descriptions.');
