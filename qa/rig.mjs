#!/usr/bin/env node
/**
 * THE RIG. One CLI: doctor, lint, spec, run, console, diff.
 *
 * RUN ORDER, and why it is this order:
 *   1. doctor   can we even reach the targets, and which personas are available today
 *   2. lint     is every check well formed and safely declared, BEFORE a browser opens
 *   3. plan     resolve the selection and print the write budget
 *   4. work     one context per (app, persona), checks grouped so a heavy page loads once
 *   5. reduce   ledger.json, ledger.md, exit code
 *
 * A thrown error inside a check is VOID, never FAIL. "We could not take this measurement" and "this
 * measurement failed" are different facts and the day they share a colour is the day nobody reads
 * the report.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ledger, diff as diffLedgers, rollup, renderRollup } from './lib/ledger.mjs';
import { launch, makeContext, makeCtx, makeNodeCtx, Unmeasurable } from './lib/browser.mjs';
import { guardedFetch } from './lib/guard.mjs';
import { PERSONAS, AVAILABLE, resolve as resolvePersona } from './lib/personas.mjs';
import { created as createdAccounts, RIG_PREFIX } from './lib/accounts.mjs';
import { TARGETS, APPS, baseUrl, SUPABASE_URL } from './lib/targets.mjs';
import { status as secretStatus, read as readSecrets } from './lib/secrets.mjs';
import { SUITES, AREAS, select, writeBudget, allChecks } from './suites/index.mjs';
import { lint } from './lint.mjs';
import { writeSpec } from './spec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RUNS_DIR = join(HERE, 'runs');

const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---------------------------------------------------------------- doctor

export async function doctor() {
  const out = { ok: true, secrets: secretStatus(), targets: [], personas: [] };

  for (const target of Object.keys(TARGETS)) {
    for (const app of APPS) {
      const url = baseUrl(app, target);
      const started = Date.now();
      let reachable = false;
      let detail = '';
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(12000) });
        reachable = res.ok;
        detail = `HTTP ${res.status} in ${Date.now() - started}ms`;
      } catch (e) {
        detail = e.name === 'TimeoutError' ? 'timed out' : e.message;
      }
      // A prod target that is down is a problem. An EXPORT target that is down is the normal
      // resting state: nothing serves 127.0.0.1:8088/8091 until someone builds and serves a local
      // export, and the build lane for that is not written yet. Reporting both as "DOWN" reads as
      // two broken things when one of them was never started.
      const expected = target === 'export' && !reachable;
      out.targets.push({
        app,
        target,
        url,
        reachable,
        expected,
        detail: expected ? 'not started (nothing serves a local export yet)' : detail,
      });
      if (target === 'prod' && !reachable) out.ok = false;
    }
  }

  // Report what a persona WOULD need, without minting an account. `doctor` is a read-only command
  // and a persona check that creates a permanent auth row is not read-only.
  const canSignUp = await (async () => {
    try {
      const key = readSecrets().APP_PUBLISHABLE_KEY;
      if (!key) return { ok: false, why: 'no APP_PUBLISHABLE_KEY in tcgscan.secrets' };
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: key } });
      if (!res.ok) return { ok: false, why: `settings returned ${res.status}` };
      const j = await res.json();
      if (j.disable_signup) return { ok: false, why: 'signup is disabled on the project' };
      if (!j.mailer_autoconfirm) return { ok: false, why: 'email confirmation is required, so a minted account cannot sign in' };
      return { ok: true, why: 'signup open, autoconfirm on' };
    } catch (e) {
      return { ok: false, why: e.message };
    }
  })();

  for (const id of Object.keys(PERSONAS)) {
    const p = PERSONAS[id];
    const needsAccount = id !== 'guest';
    out.personas.push({
      id,
      label: p.label,
      available: p.available && (!needsAccount || canSignUp.ok),
      note: needsAccount ? canSignUp.why : 'nothing to mint',
      writes: p.writes,
      danger: p.danger,
    });
  }
  out.signup = canSignUp;

  return out;
}

// ---------------------------------------------------------------- run

/**
 * Group the selection so a heavy surface loads once per (app, persona) rather than once per check.
 * Returns a Map keyed `app::persona`.
 */
function groupWork(checks, personas) {
  const groups = new Map();
  for (const check of checks) {
    for (const persona of check.personas) {
      if (!personas.includes(persona)) continue;
      const key = `${check.app}::${persona}`;
      if (!groups.has(key)) groups.set(key, { app: check.app, persona, checks: [] });
      groups.get(key).checks.push(check);
    }
  }
  return groups;
}

export async function run(options, onEvent = () => {}) {
  const {
    apps = ['michi', 'tcgscan'],
    areas = AREAS.map((a) => a.area),
    personas = ['guest'],
    target = 'prod',
    viewport = 'laptop',
    includeHeavy = false,
    capabilities = [],
    runId = `run-${stamp()}`,
  } = options;

  const startedAt = new Date().toISOString();
  const runDir = join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });

  // CHOOSING THE PERSONA IS THE CONSENT. A pro-trial persona cannot exist without burning a trial,
  // so requiring a second flag on top would be ceremony rather than a safeguard. The write budget
  // still says plainly what it costs, above the Run button.
  const effectiveCaps = personas.includes('pro-trial') && !capabilities.includes('allow-trial')
    ? [...capabilities, 'allow-trial']
    : capabilities;

  const meta = { runId, startedAt, apps, areas, personas, target, viewport, includeHeavy, capabilities: effectiveCaps };
  const ledger = new Ledger(runDir, meta);

  // 2. lint, before a browser opens.
  const problems = lint(allChecks());
  if (problems.length) {
    for (const p of problems) ledger.note('lint', p);
    onEvent({ type: 'lint-failed', problems });
    ledger.finish(new Date().toISOString());
    return { ledger, exitCode: 2, problems };
  }

  // 3. plan.
  const selected = select({ areas, apps, personas, target, includeHeavy });
  // What the HEAVY filter dropped, so the report can say so instead of reading as full coverage.
  const excludedChecks = includeHeavy
    ? []
    : select({ areas, apps, personas, target, includeHeavy: true })
        .filter((c) => !selected.includes(c))
        .map((c) => ({ id: c.id, group: c.group, area: c.area, title: c.title }));
  ledger.meta.excludedChecks = excludedChecks;
  const budget = writeBudget(selected, personas);
  onEvent({ type: 'plan', selected: selected.length, budget });
  ledger.note('plan', { selected: selected.length, budget });

  if (!selected.length) {
    ledger.finish(new Date().toISOString());
    return { ledger, exitCode: 2, problems: ['the selection matched no checks'] };
  }

  // Resolve every persona once, and record what tier each ACTUALLY resolved to.
  // Persona construction goes through the SAME airlock as everything else. Account creation and the
  // trial calls are node-side fetches, and node-side fetch skipping the guard is exactly the hole
  // that burned a trial on 2026-09-21.
  const personaFetch = guardedFetch({
    capabilities: effectiveCaps,
    onTrip: (d) => ledger.tripGuard({ stage: 'persona', ...d }),
  });

  const resolved = {};
  for (const p of personas) {
    resolved[p] = await resolvePersona(p, { fetchFn: personaFetch, runId }).catch((e) => ({ kind: 'unavailable', tier: null, note: e.message }));
    ledger.note('persona', { persona: p, kind: resolved[p].kind, tierFound: resolved[p].tier, note: resolved[p].note });
    onEvent({ type: 'persona', persona: p, ...resolved[p], session: undefined });
  }

  // 4. work.
  const browser = await launch();
  const groups = groupWork(selected, personas);
  const invariantData = {};
  const day = today();

  try {
    for (const [key, group] of groups) {
      const r = resolved[group.persona];
      onEvent({ type: 'group', key, app: group.app, persona: group.persona, checks: group.checks.length });

      if (r.kind === 'unavailable') {
        for (const check of group.checks) {
          ledger.record({ id: check.id, title: check.title, area: check.area, group: check.group, app: check.app, persona: group.persona, status: 'SKIP', detail: `persona unavailable: ${r.note}`, proves: check.proves, source: check.source });
          onEvent({ type: 'check', id: check.id, persona: group.persona, status: 'SKIP' });
        }
        continue;
      }

      const needsFresh = group.checks.some((c) => c.freshProfile);
      const browserChecks = group.checks.filter((c) => c.browser !== false);
      const nodeChecks = group.checks.filter((c) => c.browser === false);

      // Node-only checks (the CDN manifest) need no page at all.
      for (const check of nodeChecks) {
        const nodeCtx = makeNodeCtx({ persona: group.persona, app: group.app, target, resolved: r, capabilities: effectiveCaps, ledger });
        await runOne(check, nodeCtx, ledger, onEvent, group.persona, { nodeOnly: true });
      }

      if (!browserChecks.length) continue;

      let context = await makeContext(browser, { persona: group.persona, resolved: r, app: group.app, target, viewport, capabilities: effectiveCaps, ledger, today: day });
      let page = await context.newPage();
      let ctx = makeCtx({ page, app: group.app, target, persona: group.persona, resolved: r, capabilities: effectiveCaps, ledger, runDir, today: day });

      for (const check of browserChecks) {
        // A check that demands a fresh profile gets a brand new context: the binder-taste counter
        // is monotonic and device local, so a reused profile starts at the wall.
        if (check.freshProfile) {
          await context.close().catch(() => {});
          context = await makeContext(browser, { persona: group.persona, resolved: r, app: group.app, target, viewport, capabilities: effectiveCaps, ledger, today: day });
          page = await context.newPage();
          ctx = makeCtx({ page, app: group.app, target, persona: group.persona, resolved: r, capabilities: effectiveCaps, ledger, runDir, today: day });
        }

        if (check.kind === 'invariant') {
          try {
            const measured = await check.measure(ctx);
            (invariantData[check.id] ||= {})[group.persona] = measured;
            ledger.note('measure', { id: check.id, persona: group.persona, measured });
            onEvent({ type: 'check', id: check.id, persona: group.persona, status: 'measured' });
          } catch (e) {
            (invariantData[check.id] ||= {})[group.persona] = null;
            ledger.record({ id: check.id, title: check.title, area: check.area, group: check.group, app: check.app, persona: group.persona, status: 'VOID', detail: e.message, proves: check.proves, source: check.source });
          }
          continue;
        }

        await runOne(check, ctx, ledger, onEvent, group.persona, {});
        if (ledger.guardTripped) break;
      }

      await context.close().catch(() => {});
      if (ledger.guardTripped) break;
    }

    // Invariants resolve once every persona has measured.
    for (const check of selected.filter((c) => c.kind === 'invariant')) {
      const measured = invariantData[check.id];
      if (!measured || Object.values(measured).some((v) => v === null)) {
        ledger.record({ id: check.id, title: check.title, area: check.area, group: check.group, app: check.app, persona: 'all', status: 'VOID', detail: 'at least one persona could not be measured', proves: check.proves, source: check.source });
        continue;
      }
      const verdict = check.invariant(measured);
      ledger.record({
        id: check.id,
        title: check.title,
        area: check.area,
        group: check.group,
        app: check.app,
        persona: 'all',
        status: verdict === true ? 'PASS' : 'FAIL',
        detail: verdict === true ? JSON.stringify(measured) : String(verdict),
        proves: check.proves,
        source: check.source,
      });
      onEvent({ type: 'check', id: check.id, persona: 'all', status: verdict === true ? 'PASS' : 'FAIL' });
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const finished = ledger.finish(new Date().toISOString());
  const exitCode = ledger.exitCode();
  onEvent({ type: 'done', counts: finished.counts, exitCode, runId, rollup: rollup(finished.checks, excludedChecks) });
  return { ledger, exitCode, runDir, counts: finished.counts };
}

async function runOne(check, ctx, ledger, onEvent, persona, { nodeOnly }) {
  let status = 'PASS';
  let detail = '';
  let shot = null;
  try {
    await check.run(ctx);
    const failed = ctx.assertions().filter((a) => !a.ok);
    if (failed.length) {
      status = 'FAIL';
      detail = failed.map((f) => f.detail).join(' | ');
      if (!nodeOnly) shot = await ctx.shot(`${check.id}-${persona}`);
    } else {
      detail = ctx.assertions().map((a) => a.detail).filter(Boolean).slice(0, 2).join(' | ');
    }
    ctx.assertions().length = 0;
  } catch (e) {
    status = e instanceof Unmeasurable || e.constructor?.name === 'Unmeasurable' ? 'VOID' : e.message?.startsWith('BLOCKED CLICK') ? 'BLOCKED' : 'VOID';
    detail = e.message;
    if (!nodeOnly) shot = await ctx.shot?.(`${check.id}-${persona}-error`).catch(() => null);
  }
  ledger.record({ id: check.id, title: check.title, area: check.area, group: check.group, app: check.app, persona, status, detail, proves: check.proves, source: check.source, shot });
  onEvent({ type: 'check', id: check.id, title: check.title, persona, status, detail });
}

export function listRuns() {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR).filter((d) => existsSync(join(RUNS_DIR, d, 'ledger.json'))).sort().reverse();
}

// ---------------------------------------------------------------- cli

const HELP = `
rig  QA for michi-maker.com and tcgscan.ai

  node qa/rig.mjs doctor                  can we reach the targets, which personas exist today
  node qa/rig.mjs lint                    validate every check without opening a browser
  node qa/rig.mjs spec                    regenerate qa/SPEC.md, the audit spec sheet
  node qa/rig.mjs console                 open the GUI on http://127.0.0.1:8099
  node qa/rig.mjs run [options]           run headless
  node qa/rig.mjs accounts                what the rig has created, and how to sweep it
  node qa/rig.mjs diff <runA> <runB>      compare two runs

run options
  --apps michi,tcgscan      default both
  --areas data,gating       default every area
  --personas guest,free,pro-trial   default guest
  --target prod|export      default prod
  --viewport laptop|phone|desktop|mid
  --heavy                   include model and catalog downloads
`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'heavy') out.includeHeavy = true;
    else out[key] = argv[++i];
  }
  const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
  return {
    apps: list(out.apps),
    areas: list(out.areas),
    personas: list(out.personas),
    target: out.target,
    viewport: out.viewport,
    includeHeavy: out.includeHeavy,
  };
}

if (process.argv[1] && process.argv[1].endsWith('rig.mjs')) {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(HELP);
  } else if (cmd === 'doctor') {
    const d = await doctor();
    process.stdout.write('\nSecrets (names only, values are never read outside the allowlist)\n');
    for (const s of d.secrets.allowed) process.stdout.write(`  ${s.present ? 'present' : 'MISSING '}  ${s.key}\n`);
    process.stdout.write(`  refused by design: ${d.secrets.refused.join(', ')}\n`);
    process.stdout.write('\nTargets\n');
    for (const t of d.targets) {
      // idle is not down. An export target nothing has started yet is the normal resting state.
      const state = t.reachable ? 'up  ' : t.expected ? 'idle' : 'DOWN';
      process.stdout.write(`  ${state}  ${t.app.padEnd(8)} ${t.target.padEnd(7)} ${t.url.padEnd(26)} ${t.detail}\n`);
    }
    process.stdout.write('\nPersonas\n');
    for (const p of d.personas) {
      const tier = p.tierFound ? ` (resolved to ${p.tierFound})` : '';
      process.stdout.write(`  ${p.available ? 'ready ' : 'no    '}  ${p.id.padEnd(10)}${tier}  ${p.note || ''}\n`);
    }
    process.stdout.write('\n');
    if (!d.ok) {
      process.stdout.write('FAILED: a production target is unreachable.\n');
      process.exit(1);
    }
  } else if (cmd === 'lint') {
    const problems = lint(allChecks());
    if (problems.length) {
      for (const p of problems) process.stdout.write(`  ${p}\n`);
      process.stdout.write(`\nFAILED: ${problems.length} lint problems.\n`);
      process.exit(2);
    }
    process.stdout.write(`ok  ${allChecks().length} checks across ${SUITES.length} areas\n`);
  } else if (cmd === 'spec') {
    const path = writeSpec();
    process.stdout.write(`wrote ${path}\n`);
  } else if (cmd === 'console') {
    // SPAWNED, NOT IMPORTED, and it has to be. `console.mjs` imports run/doctor/listRuns from THIS
    // file, so `await import('./console.mjs')` here is a cycle across a top-level await: rig.mjs
    // cannot finish evaluating until console.mjs does, and console.mjs cannot start until rig.mjs
    // finishes. Node reports it as "Detected unsettled top-level await" and the console never
    // starts. Running it as its own entry point breaks the cycle, because then rig.mjs evaluates
    // fully (this CLI block is skipped, argv[1] is console.mjs) before console.mjs needs it.
    const child = spawnSync(process.execPath, [join(HERE, 'console.mjs')], { stdio: 'inherit' });
    process.exit(child.status ?? 0);
  } else if (cmd === 'accounts') {
    const rows = createdAccounts();
    if (!rows.length) {
      process.stdout.write('No accounts created from this machine yet.\n');
    } else {
      process.stdout.write(`
${rows.length} accounts created by the rig, all prefixed ${RIG_PREFIX}:

`);
      for (const r of rows.slice(-25)) process.stdout.write(`  ${r.at}  ${r.tag.padEnd(6)}  ${r.email}\n`);
      if (rows.length > 25) process.stdout.write(`  ... and ${rows.length - 25} older\n`);
      process.stdout.write(`
THE RIG CANNOT DELETE THESE. Removing an auth row needs the management token, which the secrets
allowlist deliberately refuses. michi's existing purge already does it and already takes a prefix:

  node -e "import('./scripts/_purge-test-accounts.mjs')"   # see its header for the sql/serviceKey it wants

Sweep with emailPrefixes: ['${RIG_PREFIX}'].
`);
    }
  } else if (cmd === 'diff') {
    const [a, b] = rest;
    const d = diffLedgers(join(RUNS_DIR, a, 'ledger.json'), join(RUNS_DIR, b, 'ledger.json'));
    process.stdout.write(`${d.from} -> ${d.to}\n`);
    for (const c of d.changed) process.stdout.write(`  ${c.from} -> ${c.to}  ${c.key}\n`);
    if (d.gone.length) process.stdout.write(`  ${d.gone.length} checks gone\n`);
    if (d.added.length) process.stdout.write(`  ${d.added.length} checks new\n`);
    if (!d.changed.length) process.stdout.write('  no status changed\n');
  } else if (cmd === 'run') {
    const opts = parseArgs(rest);
    const result = await run(opts, (e) => {
      if (e.type === 'plan') {
        process.stdout.write(`\nplan: ${e.selected} checks\n`);
        for (const s of e.budget.sentences) process.stdout.write(`  ${s}\n`);
        process.stdout.write('\n');
      }
      if (e.type === 'check') process.stdout.write(`  ${String(e.status).padEnd(7)} ${e.id} [${e.persona}]${e.status === 'FAIL' || e.status === 'VOID' ? `\n            ${String(e.detail).slice(0, 160)}` : ''}\n`);
      if (e.type === 'persona') process.stdout.write(`persona ${e.persona}: ${e.kind}${e.tier ? ` (${e.tier})` : ''} ${e.note || ''}\n`);
    });
    const c = result.counts || {};
    // The per-check stream above is a log. THIS is the report: one line per capability, worst
    // first, so the question "what did it actually test?" is answered without reading 68 rows.
    const rows = rollup(result.ledger.events.filter((e) => e.kind === 'check'), result.ledger.meta.excludedChecks || []);
    process.stdout.write('\n\nWHAT WAS TESTED\n\n');
    process.stdout.write(renderRollup(rows));
    process.stdout.write(`\n\n${Object.entries(c).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}\n`);
    process.stdout.write(`report: ${result.runDir}\\ledger.md\n`);
    if (result.exitCode === 4) process.stdout.write('\nFAILED: a safety guard fired. A check tried to reach something the rig forbids.\n');
    else if (result.exitCode) process.stdout.write('\nFAILED: see the report.\n');
    process.exit(result.exitCode);
  } else {
    process.stdout.write(`unknown command ${cmd}\n${HELP}`);
    process.exit(2);
  }
}
