// Copy the newest tcgscan-data coverage report into src/data/gameCoverage.json, so the /coverage
// page says what the data says and nothing is typed by hand. The report is read-only and lives in
// ../tcgscan-data/pipeline/work/coverage/<date>.json (python orchestration/scripts/coverage_report.py
// there refreshes it). The page's Live/WIP rule is src/data/coverageRule.ts; this stores the shares
// and the switches the rule needs, and the statuses the rule gives, side by side so a reader of the
// JSON sees both.
//   node scripts/coverage-sync.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { FEATURE_KEYS, sharesOf, statusesOf, liveCountOf } from '../src/data/coverageRule.ts';

const HERE = resolve(import.meta.dirname, '..');
const REPORTS = resolve(HERE, '..', 'tcgscan-data', 'pipeline', 'work', 'coverage');
const OUT = join(HERE, 'src', 'data', 'gameCoverage.json');

const LABELS = {
  pokemon: { game: 'Pokémon', note: 'English' },
  onepiece: { game: 'One Piece' },
  lorcana: { game: 'Disney Lorcana' },
  riftbound: { game: 'Riftbound' },
  digimon: { game: 'Digimon' },
  magic: { game: 'Magic: The Gathering' },
  yugioh: { game: 'Yu-Gi-Oh!' },
  cyberpunk: { game: 'Cyberpunk TCG' },
};

const files = readdirSync(REPORTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
if (!files.length) { console.error(`FAILED: no coverage report in ${REPORTS}`); process.exit(1); }
const newest = files[files.length - 1];
const report = JSON.parse(readFileSync(join(REPORTS, newest), 'utf8'));

const games = report.games.map((r) => {
  const label = LABELS[r.key];
  if (!label) { console.error(`FAILED: no label for game "${r.key}" (add it to LABELS)`); process.exit(2); }
  const shares = sharesOf(r);
  const status = statusesOf(shares);
  const pct = Object.fromEntries(FEATURE_KEYS.map((k) => [k, Math.round(shares.share[k] * 100)]));
  return { key: r.key, ...label, inApp: r.in_app, share: pct, on: shares.on, status };
});
// Most live first, so the table reads from finished to in progress; ties keep the report's order.
games.sort((a, b) => liveCountOf(b.status) - liveCountOf(a.status));

const doc = { asOf: newest.slice(0, 10), source: `tcgscan-data/pipeline/work/coverage/${newest}`, games };
writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');
for (const g of games) console.log(`${g.game.padEnd(22)} ${FEATURE_KEYS.map((k) => `${k}=${g.status[k]}(${g.share[k]}%${g.on[k] ? '' : ',off'})`).join(' ')}`);
console.log(`wrote ${OUT} from ${newest}`);
