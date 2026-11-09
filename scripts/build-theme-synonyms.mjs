// SIMILAR WORDS VOCABULARY (MIC-024): turn TCGScan-Data's per-game synonym files into the app's
// own list, src/data/themeSynonyms.json. The vocabulary lives in this app by design (the
// 2026-09-11 decision); the data project only scores the tag lists we send it.
//
//   node scripts/build-theme-synonyms.mjs [folder]
//
// folder defaults to ../tcgscan-data/pipeline/work/mic-024 (the files are gitignored over there,
// so this output is the copy of record). Refuses a file that is not marked final or still has
// joins waiting on the owner's eye.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(process.argv[2] ?? path.join(here, '../../tcgscan-data/pipeline/work/mic-024'));
const out = path.join(here, '../src/data/themeSynonyms.json');
const GAMES = ['pokemon', 'onepiece', 'lorcana', 'riftbound', 'digimon', 'magic', 'yugioh', 'cyberpunk'];
const MAX_MEMBERS = 48; // the server's theme_any cap

function fail(msg) {
  console.error(`FAILED: ${msg}`);
  process.exit(1);
}

const groupsByGame = {};
for (const game of GAMES) {
  const file = path.join(src, `synonym_groups_${game}.json`);
  if (!fs.existsSync(file)) fail(`missing ${file}`);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (d.final !== true) fail(`${game}: not marked final`);
  if ((d.needs_eye ?? []).length) fail(`${game}: ${d.needs_eye.length} joins still need the owner's eye`);
  const groups = [];
  for (const g of d.groups) {
    // Head family first, then synonyms, variants, related: the "Also searching" line reads in
    // that order, nearest words first.
    const order = { head: 0, synonym: 1, variant: 2, related: 3 };
    const fams = [...g.families].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || b.cards - a.cards);
    const members = [];
    for (const f of fams) for (const m of f.members) {
      const v = String(m).toLowerCase().trim();
      if (v && !v.startsWith('-') && !members.includes(v)) members.push(v);
    }
    if (members.length < 2) continue; // one word is not a group
    if (members.length > MAX_MEMBERS) fail(`${game}: "${g.group}" has ${members.length} members (cap ${MAX_MEMBERS})`);
    groups.push({ label: g.group, members });
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));
  groupsByGame[game] = groups;
  console.log(`${game.padEnd(10)} ${String(groups.length).padStart(4)} groups`);
}
fs.writeFileSync(out, JSON.stringify({ item: 'MIC-024', source: 'tcgscan-data pipeline/work/mic-024 (final)', groupsByGame }) + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
