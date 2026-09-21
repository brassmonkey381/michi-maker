/**
 * Does every command this rig advertises actually run?
 *
 * WHY THIS EXISTS. On 2026-09-21 `node qa/rig.mjs console` was shipped broken: `console.mjs` imports
 * run/doctor from `rig.mjs`, and `rig.mjs` top-level-awaited `import('./console.mjs')`, so neither
 * module could finish evaluating. Node printed "Detected unsettled top-level await" and the console
 * never started. It was missed because the console had only ever been tested by running
 * `node qa/console.mjs` directly, which is not the path anybody uses.
 *
 * So this tests the COMMANDS, not the modules. It is deliberately shallow: it asserts each command
 * starts, produces its own output and exits, which is the whole class of failure that slipped
 * through. It never runs a browser and never touches an account.
 *
 *   node qa/cli-smoke.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RIG = join(HERE, 'rig.mjs');

const failures = [];
const pass = (name, detail) => process.stdout.write(`  ok    ${name.padEnd(26)}${detail}\n`);
const fail = (name, detail) => {
  failures.push(`${name}: ${detail}`);
  process.stdout.write(`  FAIL  ${name.padEnd(26)}${detail}\n`);
};

/** Run a command to completion. A hang is a failure, which is the point. */
function runCmd(args, { timeout = 60000, expect } = {}) {
  const r = spawnSync(process.execPath, [RIG, ...args], { timeout, encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const name = args.join(' ') || '(no args)';

  if (r.error?.code === 'ETIMEDOUT') return fail(name, `hung for ${timeout}ms without exiting`);
  // The unsettled-TLA warning means a module cycle deadlocked. It is a warning, not an error, so a
  // naive exit-code check sails straight past it.
  if (out.includes('unsettled top-level await')) return fail(name, 'unsettled top-level await: a module cycle deadlocked');
  if (expect && !out.includes(expect)) return fail(name, `output did not contain "${expect}"`);
  return pass(name, `exit ${r.status}, ${out.trim().split('\n').length} lines`);
}

process.stdout.write('\nCLI smoke\n\n');

runCmd([], { expect: 'rig  QA for' });
runCmd(['lint'], { expect: 'checks across' });
runCmd(['spec'], { expect: 'wrote' });
runCmd(['accounts']);
runCmd(['doctor'], { timeout: 90000, expect: 'Personas' });

// The console does not exit on its own, so it is started, polled and killed.
await (async () => {
  const name = 'console';
  const child = spawn(process.execPath, [RIG, 'console'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });

  const deadline = Date.now() + 20000;
  let served = null;
  while (Date.now() < deadline && !served) {
    await new Promise((r) => setTimeout(r, 700));
    if (out.includes('unsettled top-level await')) break;
    served = await fetch('http://127.0.0.1:8099/api/catalog')
      .then((r) => (r.ok ? r.status : null))
      .catch(() => null);
  }
  child.kill();

  if (out.includes('unsettled top-level await')) fail(name, 'unsettled top-level await: rig.mjs and console.mjs deadlocked');
  else if (!served) fail(name, 'did not serve /api/catalog within 20s');
  else pass(name, `served /api/catalog (HTTP ${served})`);
})();

process.stdout.write('\n');
if (failures.length) {
  process.stdout.write(`FAILED: ${failures.length} command${failures.length === 1 ? '' : 's'} broken.\n`);
  process.exit(1);
}
process.stdout.write('Every command runs.\n');
