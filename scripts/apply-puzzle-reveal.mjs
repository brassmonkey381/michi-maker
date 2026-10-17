// Apply supabase/migrations/20261017010000_puzzle_reveal.sql and prove it.
//   node scripts/apply-puzzle-reveal.mjs          # dry: show whether the columns exist
//   node scripts/apply-puzzle-reveal.mjs --apply  # apply, then prove the five-guess rule as the QA account
//   node scripts/apply-puzzle-reveal.mjs --prove  # the proof alone
import { readFileSync } from 'node:fs';
import { appSql, step, fail, readVars } from './lib/michi.mjs';

const apply = process.argv.includes('--apply');
const proveOnly = process.argv.includes('--prove');
const sqlText = readFileSync('supabase/migrations/20261017010000_puzzle_reveal.sql', 'utf8');

step(1, 'before');
const cols = await appSql(`select column_name from information_schema.columns where table_name='puzzle_plays' and column_name in ('attempts','revealed_at')`);
console.log('  puzzle_plays reveal columns present:', cols.length, 'of 2');
if (!apply && !proveOnly) { console.log('dry run; pass --apply, or --prove'); process.exit(0); }

if (!proveOnly) {
  step(2, 'apply migration');
  await appSql(sqlText);
  const after = await appSql(`select column_name from information_schema.columns where table_name='puzzle_plays' and column_name in ('attempts','revealed_at')`);
  if (after.length !== 2) fail('columns missing after apply');
  console.log('  applied');
}

step(3, 'prove: four guesses are refused, five are handed the words, a revealed play is not a win');
const { MICHI_TEST_EMAIL } = readVars('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets', ['MICHI_TEST_EMAIL']);
const qa = (await appSql(`select id from auth.users where email = '${MICHI_TEST_EMAIL}'`))[0];
if (!qa) fail('QA account not found');
const today = (await appSql(`select id from daily_puzzles where publish_on = puzzle_today() limit 1`))[0];
if (!today) fail('no puzzle today');
const asQa = async (attemptsBefore) => appSql(`
  delete from puzzle_plays where user_id = '${qa.id}' and puzzle_id = '${today.id}';
  insert into puzzle_plays (user_id, puzzle_id, attempts) values ('${qa.id}', '${today.id}', ${attemptsBefore});
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"${qa.id}","role":"authenticated"}';
  do $$ begin
    perform set_config('proof.outcome', 'ALLOWED: ' || array_to_string(public.reveal_puzzle_answer('${today.id}'), ','), true);
  exception when others then
    perform set_config('proof.outcome', 'REFUSED: ' || sqlerrm, true);
  end $$;
  reset role;
  select current_setting('proof.outcome', true) as outcome,
         (select correct from puzzle_plays where user_id = '${qa.id}' and puzzle_id = '${today.id}') as correct,
         (select revealed_at is not null from puzzle_plays where user_id = '${qa.id}' and puzzle_id = '${today.id}') as revealed;
`).then((r) => r[0]);
const four = await asQa(4);
console.log('  after 4 guesses:', four.outcome, '| revealed:', four.revealed);
if (!String(four.outcome).startsWith('REFUSED')) fail('four guesses were enough');
const five = await asQa(5);
console.log('  after 5 guesses:', String(five.outcome).replace(/ALLOWED: .*/, 'ALLOWED (words withheld here)'), '| revealed:', five.revealed, '| correct:', five.correct);
if (!String(five.outcome).startsWith('ALLOWED')) fail('five guesses were refused');
if (five.correct === true) fail('a revealed play counted as a win');
await appSql(`delete from puzzle_plays where user_id = '${qa.id}' and puzzle_id = '${today.id}'`);
console.log('  QA play removed again');
console.log('OK');
