/**
 * Regenerate caption files from the database for a run of dates. Overwrites; writes nothing else.
 *
 *   node scripts/puzzles/write-captions.mjs --from 2026-10-04 [--to 2026-10-17]
 *
 * FOR THE CASES fill-queue CANNOT COVER: a puzzle whose answer or hint was edited in Studio after
 * it was scheduled, or a run that stopped before its caption step (the 2026-10-04 run did). The
 * answer, cards and hint are read back from the live rows, so what lands here is what a player
 * will meet, not what a script intended.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, appSql, dataSql, fail, q, step, textArray } from '../lib/michi.mjs';
import { caption } from './caption.mjs';

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const FROM = argOf('--from', null);
const TO = argOf('--to', '2099-12-31');
if (!FROM) fail('usage: node scripts/puzzles/write-captions.mjs --from YYYY-MM-DD [--to YYYY-MM-DD]');

step(1, `puzzles from ${FROM}${TO === '2099-12-31' ? '' : ` to ${TO}`}`);
const rows = await appSql(`
  select d.publish_on, a.themes, d.card_ids, d.hint
    from public.daily_puzzles d join public.daily_puzzle_answers a on a.puzzle_id = d.id
   where d.publish_on between ${q(FROM)}::date and ${q(TO)}::date
   order by d.publish_on;
`);
console.log(`  ${rows.length} puzzle(s)`);
if (!rows.length) process.exit(0);

step(2, 'card names');
const ids = [...new Set(rows.flatMap((r) => r.card_ids))];
const named = await dataSql(`select id::text as id, name from public.cards_en where id::text = any(${textArray(ids)});`);
const nameOf = new Map(named.map((c) => [c.id, c.name]));

step(3, 'writing');
const dir = join(ROOT, 'state', 'puzzles');
mkdirSync(dir, { recursive: true });
for (const r of rows) {
  const file = join(dir, `captions-${r.publish_on}.md`);
  writeFileSync(file, caption({
    publishOn: r.publish_on,
    themes: r.themes,
    cardNames: r.card_ids.map((id) => nameOf.get(id) ?? id),
    candidates: null,
    hint: r.hint,
  }), 'utf8');
  console.log(`  ${r.publish_on}  ${r.themes.join(' + ')}${r.hint ? '  (hint set)' : ''}`);
}
console.log(`\nOK: ${rows.length} caption file(s) in state/puzzles.`);
