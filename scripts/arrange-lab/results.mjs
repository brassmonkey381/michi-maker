/**
 * ARRANGE LAB, step 3: tally the votes per hidden variant.
 *
 *   node scripts/arrange-lab/results.mjs
 *
 * duel               per nudge (a weight halved or doubled), rounds won against the champion
 *                    `--adopt` writes the winning nudges into weights.json, the champion the next
 *                    build duels from (the app's ARRANGER_WEIGHTS is updated by hand to match)
 * modes / variants   earlier runs: how often each mode or setting won the column it was in
 * sheet              earlier runs: how often the app's first-ranked candidate was the one picked
 * misses             per mode, the share of cards clicked as wrong; for Strata, by the card's first depth word
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const DIR = join(ROOT, 'state', 'out', 'arrange-lab');
const ROUNDS = join(DIR, 'rounds.json');
const VOTES = join(DIR, 'votes.jsonl');
const WEIGHTS = join(DIR, 'weights.json');
const ADOPT = process.argv.includes('--adopt');

if (!existsSync(ROUNDS) || !existsSync(VOTES)) {
  console.log('no votes yet');
  process.exit(0);
}
const { rounds, cards, champion } = JSON.parse(readFileSync(ROUNDS, 'utf8'));
const byId = new Map(rounds.map((r) => [r.id, r]));
// The last vote on a round counts (Back lets the owner change an answer).
const votes = new Map();
for (const line of readFileSync(VOTES, 'utf8').split(/\r?\n/).filter(Boolean)) {
  const v = JSON.parse(line);
  if (byId.has(v.round)) votes.set(v.round, v);
}
console.log(`${votes.size} of ${rounds.length} rounds answered\n`);

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
const tally = (title, filter, keyOf) => {
  const t = new Map();
  let ties = 0;
  let none = 0;
  let n = 0;
  for (const r of rounds.filter(filter)) {
    const v = votes.get(r.id);
    if (!v) continue;
    n += 1;
    for (const c of r.cols) {
      const k = keyOf(c);
      const row = t.get(k) ?? { shown: 0, won: 0 };
      row.shown += 1;
      if (v.pick === c.v) row.won += 1;
      t.set(k, row);
    }
    if (v.pick === 'tie') ties += 1;
    if (v.pick === 'none') none += 1;
  }
  if (!n) return;
  console.log(`== ${title}  (${n} answered, ${ties} about equal, ${none} none good)`);
  for (const [k, row] of [...t.entries()].sort((a, b) => b[1].won / b[1].shown - a[1].won / a[1].shown)) {
    console.log(`  ${k.padEnd(28)} won ${String(row.won).padStart(2)} of ${String(row.shown).padStart(2)} shown  ${pct(row.won, row.shown)}`);
  }
  console.log('');
};

// duel: each nudge against the champion. A nudge that wins more rounds than it loses is adopted.
{
  const duels = rounds.filter((r) => r.test === 'duel' && votes.has(r.id));
  if (duels.length) {
    const byNudge = new Map();
    for (const r of duels) {
      const v = votes.get(r.id);
      const key = `${r.nudge.term}x${r.nudge.factor}`;
      const row = byNudge.get(key) ?? { term: r.nudge.term, factor: r.nudge.factor, won: 0, lost: 0, tied: 0, none: 0 };
      if (v.pick === 'tie') row.tied += 1;
      else if (v.pick === 'none') row.none += 1;
      else if (v.pick === 'champion') row.lost += 1;
      else row.won += 1;
      byNudge.set(key, row);
    }
    console.log(`== DUEL: the champion against one nudge at a time  (${duels.length} answered)`);
    const adopt = {};
    for (const [key, row] of [...byNudge.entries()].sort((a, b) => b[1].won - b[1].lost - (a[1].won - a[1].lost))) {
      const verdict = row.won > row.lost ? 'ADOPT' : row.won < row.lost ? 'keep champion' : 'tie';
      console.log(`  ${key.padEnd(16)} won ${row.won}  lost ${row.lost}  equal ${row.tied}  none ${row.none}   ${verdict}`);
      if (row.won > row.lost) adopt[row.term] = (adopt[row.term] ?? 1) * row.factor;
    }
    // Two opposite nudges of one term cannot both win; if both did, the term is left alone.
    for (const [term, f] of Object.entries(adopt)) if (Math.abs(f - 1) < 1e-9) delete adopt[term];
    if (Object.keys(adopt).length) {
      const before = existsSync(WEIGHTS) ? JSON.parse(readFileSync(WEIGHTS, 'utf8')) : {};
      const base = { ...(champion ?? {}), ...before };
      const next = { ...before };
      for (const [term, f] of Object.entries(adopt)) next[term] = (base[term] ?? 1) * f;
      console.log(`  winning nudges: ${Object.entries(adopt).map(([t, f]) => `${t} x${f}`).join(', ')}`);
      if (ADOPT) {
        writeFileSync(WEIGHTS, JSON.stringify(next, null, 2));
        console.log(`  adopted into ${WEIGHTS}: ${JSON.stringify(next)}`);
      } else console.log('  (run with --adopt to move the champion)');
    } else console.log('  no nudge beat the champion');
    console.log('');
  }
}

tally('MODES: which mode reads best', (r) => r.test === 'modes', (c) => c.v);
for (const knob of [...new Set(rounds.filter((r) => r.test === 'variants').map((r) => r.knob))]) {
  tally(`VARIANTS: ${knob}`, (r) => r.test === 'variants' && r.knob === knob, (c) => c.v);
}

// sheet: did the owner pick what the app ranked first?
{
  const sheet = rounds.filter((r) => r.test === 'sheet' && votes.has(r.id));
  if (sheet.length) {
    const ranks = new Map();
    let none = 0;
    let tie = 0;
    for (const r of sheet) {
      const v = votes.get(r.id);
      if (v.pick === 'none') none += 1;
      else if (v.pick === 'tie') tie += 1;
      else {
        const c = r.cols.find((x) => x.v === v.pick);
        if (c) ranks.set(c.rank, (ranks.get(c.rank) ?? 0) + 1);
      }
    }
    console.log(`== SHEET: the app's ranking against the owner's pick  (${sheet.length} answered)`);
    for (const rank of [1, 2, 3]) console.log(`  ranked #${rank} picked ${String(ranks.get(rank) ?? 0).padStart(2)}  ${pct(ranks.get(rank) ?? 0, sheet.length)}`);
    console.log(`  about equal ${tie}, none good ${none}\n`);
    tally('SHEET: wins by mode', (r) => r.test === 'sheet', (c) => c.mode);
    tally('SHEET: wins by template', (r) => r.test === 'sheet', (c) => c.template);
  }
}

// misses: per-card precision.
{
  const missed = rounds.filter((r) => r.test === 'misses' && votes.has(r.id));
  if (missed.length) {
    console.log('== MISSES: cards clicked as sitting wrong');
    for (const mode of ['arranger', 'strata', 'flow']) {
      let shown = 0;
      let miss = 0;
      for (const r of missed.filter((x) => x.mode === mode)) {
        shown += r.grid.filter((c) => c.card).length;
        miss += votes.get(r.id).misses.length;
      }
      if (shown) console.log(`  ${mode.padEnd(8)} ${miss} of ${shown} cards  ${pct(miss, shown)} wrong`);
    }
    const byWord = new Map();
    const list = [];
    for (const r of missed.filter((x) => x.mode === 'strata' || x.mode === 'arranger')) {
      const bad = new Set(votes.get(r.id).misses);
      for (const c of r.grid) {
        if (!c.card) continue;
        const words = r.words?.[c.card] ?? [];
        const first = words[0] ?? '(free)';
        const row = byWord.get(first) ?? { shown: 0, missed: 0 };
        row.shown += 1;
        if (bad.has(c.card)) {
          row.missed += 1;
          list.push(`    ${(cards[c.card]?.name ?? c.card).padEnd(26)} row ${c.row + 1} (${r.bands?.[c.row] ?? '?'})  ${words.join(', ') || 'no depth words'}`);
        }
        byWord.set(first, row);
      }
    }
    if (byWord.size) {
      console.log('  Strata, by the first depth word:');
      for (const [w, row] of [...byWord.entries()].sort((a, b) => b[1].missed / b[1].shown - a[1].missed / a[1].shown)) {
        console.log(`    ${w.padEnd(22)} ${String(row.missed).padStart(2)} of ${String(row.shown).padStart(2)}  ${pct(row.missed, row.shown)}`);
      }
      if (list.length) {
        console.log('  The cards clicked:');
        for (const l of list) console.log(l);
      }
    }
  }
}
