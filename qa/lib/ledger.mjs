/**
 * The run ledger: an append-only event log, reduced to a joinable result set and a readable report.
 *
 * THE RULE THAT MAKES A GREEN RUN MEAN SOMETHING: an unmeasured check is never a pass. Seven
 * statuses, and only PASS is good news. VOID exists so "the site was down" and "the feature is
 * broken" never share a colour, because the day they do is the day the report stops being read.
 */
import { appendFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const STATUSES = ['PASS', 'FAIL', 'WAIVED', 'BLOCKED', 'SKIP', 'NA', 'VOID'];

/** Statuses that make the run fail. SKIP and NA are legitimate outcomes; VOID is not a pass. */
const BAD = new Set(['FAIL', 'VOID']);

export class Ledger {
  constructor(runDir, meta) {
    this.dir = runDir;
    this.meta = meta;
    this.events = [];
    mkdirSync(runDir, { recursive: true });
    mkdirSync(join(runDir, 'shots'), { recursive: true });
    this.eventsPath = join(runDir, 'events.ndjson');
    this.netPath = join(runDir, 'net.jsonl');
    writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2));
    this.guardTripped = null;
  }

  /** One check outcome. `at` comes from the caller so the reducer stays pure. */
  record(row) {
    const event = { kind: 'check', ...row };
    this.events.push(event);
    appendFileSync(this.eventsPath, JSON.stringify(event) + '\n');
    return event;
  }

  note(kind, payload) {
    const event = { kind, ...payload };
    this.events.push(event);
    appendFileSync(this.eventsPath, JSON.stringify(event) + '\n');
  }

  net(entry) {
    appendFileSync(this.netPath, JSON.stringify(entry) + '\n');
  }

  /**
   * A guard that actually fired. Recorded separately from ordinary failures because it means a
   * check tried to do something the rig forbids, which is a defect in the suite, not in the product.
   */
  tripGuard(detail) {
    this.guardTripped = detail;
    this.note('guard-tripped', detail);
  }

  counts() {
    const out = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const e of this.events) if (e.kind === 'check') out[e.status] = (out[e.status] || 0) + 1;
    return out;
  }

  exitCode() {
    if (this.guardTripped) return 4;
    const c = this.counts();
    for (const s of BAD) if (c[s] > 0) return 1;
    return 0;
  }

  finish(endedAt) {
    const counts = this.counts();
    const checks = this.events.filter((e) => e.kind === 'check');
    const ledger = { ...this.meta, endedAt, counts, guardTripped: this.guardTripped, checks };
    writeFileSync(join(this.dir, 'ledger.json'), JSON.stringify(ledger, null, 2));
    writeFileSync(join(this.dir, 'ledger.md'), renderMarkdown(ledger));
    return ledger;
  }
}

/**
 * THE ANSWER TO "what did it actually test?" in one screen.
 *
 * Sixty-eight rows is a log, not a report. Every check declares a plain-English `group`, and this
 * folds the rows into one line per group: a verdict, a tally, and which personas it covered. The
 * detail is still there underneath for the things that failed, which are the only rows anyone needs
 * to read line by line.
 *
 * GROUP VERDICT RULES, in order, so a summary can never be cheerier than its parts:
 *   FAIL    anything in the group failed
 *   VOID    nothing failed but something could not be measured
 *   PARTIAL something was skipped
 *   ok      everything ran and held
 */
export function rollup(checks, excluded = []) {
  const groups = new Map();
  for (const r of checks) {
    const key = r.group || r.area || 'ungrouped';
    if (!groups.has(key)) groups.set(key, { group: key, rows: [], personas: new Set() });
    const g = groups.get(key);
    g.rows.push(r);
    g.personas.add(r.persona);
  }

  // NO SILENT CAPS. A check filtered out before the run (today: --heavy) never produces a row, so
  // its group would report 1/1 and read as full coverage of something barely touched. Excluded
  // checks are folded back in here as a skipped count, which is the difference between "this held"
  // and "the part we ran held".
  const skippedByFilter = new Map();
  for (const c of excluded) {
    const key = c.group || c.area || 'ungrouped';
    skippedByFilter.set(key, (skippedByFilter.get(key) || 0) + 1);
    if (!groups.has(key)) groups.set(key, { group: key, rows: [], personas: new Set() });
  }

  return [...groups.values()].map((g) => {
    const notRun = skippedByFilter.get(g.group) || 0;
    const n = (s) => g.rows.filter((r) => r.status === s).length;
    const failed = n('FAIL') + n('BLOCKED');
    const void_ = n('VOID');
    const skipped = n('SKIP');
    const passed = n('PASS') + n('NA') + n('WAIVED');
    const verdict = failed ? 'FAIL' : void_ ? 'VOID' : (skipped || notRun) ? 'PARTIAL' : 'ok';

    // The headline sentence. On a failure it names the first real problem rather than a count,
    // because the count is already in the tally and the problem is what the reader came for.
    const firstBad = g.rows.find((r) => r.status === 'FAIL' || r.status === 'BLOCKED') || g.rows.find((r) => r.status === 'VOID');
    const headline = firstBad
      ? String(firstBad.detail || firstBad.title).split('|')[0].trim().slice(0, 150)
      : g.rows.length ? `${passed} check${passed === 1 ? '' : 's'} held across ${[...g.personas].join(', ')}` : 'nothing in this group ran';

    const withNote = notRun
      ? `${headline}. ${notRun} more not run (heavy: needs --heavy)`
      : headline;
    return { group: g.group, verdict, passed, failed, void: void_, skipped, notRun, total: g.rows.length + notRun, personas: [...g.personas], headline: withNote };
  }).sort((a, b) => {
    const rank = { FAIL: 0, VOID: 1, PARTIAL: 2, ok: 3 };
    return rank[a.verdict] - rank[b.verdict] || a.group.localeCompare(b.group);
  });
}

/** The same summary as plain text, for the terminal. */
export function renderRollup(rows) {
  const width = Math.max(...rows.map((r) => r.group.length), 10);
  const out = [];
  for (const r of rows) {
    const tally = `${r.passed}/${r.total}`;
    out.push(`  ${r.verdict.padEnd(8)}${r.group.padEnd(width + 2)}${tally.padEnd(8)}${r.headline}`);
  }
  return out.join('\n');
}

export function renderMarkdown(ledger) {
  const c = ledger.counts;
  const lines = [];
  lines.push(`# QA run ${ledger.runId}`);
  lines.push('');
  lines.push(`${ledger.startedAt} to ${ledger.endedAt}`);
  lines.push(`Target **${ledger.target}**, apps ${ledger.apps.join(' and ')}, personas ${ledger.personas.join(', ')}.`);
  lines.push('');
  if (ledger.guardTripped) {
    lines.push(`## A GUARD FIRED`);
    lines.push('');
    lines.push(`\`${JSON.stringify(ledger.guardTripped)}\``);
    lines.push('');
    lines.push('A check tried to reach something the rig forbids. Fix the check. The run is not valid.');
    lines.push('');
  }
  lines.push(`| ${STATUSES.join(' | ')} |`);
  lines.push(`| ${STATUSES.map(() => '---').join(' | ')} |`);
  lines.push(`| ${STATUSES.map((s) => c[s] || 0).join(' | ')} |`);
  lines.push('');

  lines.push('## What was tested');
  lines.push('');
  lines.push('One line per capability. Read this; read the detail below only for what failed.');
  lines.push('');
  lines.push('| | capability | held | covered | what happened |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of rollup(ledger.checks, ledger.excludedChecks || [])) {
    const mark = r.verdict === 'ok' ? 'ok' : `**${r.verdict}**`;
    lines.push(`| ${mark} | ${r.group} | ${r.passed}/${r.total} | ${r.personas.join(', ')} | ${String(r.headline).replace(/\|/g, '\|')} |`);
  }
  lines.push('');

  const bad = ledger.checks.filter((r) => r.status === 'FAIL' || r.status === 'VOID');
  if (bad.length) {
    lines.push('## Needs attention');
    lines.push('');
    for (const r of bad) {
      lines.push(`### ${r.status}  ${r.id}  (${r.persona})`);
      lines.push(`${r.title}`);
      lines.push('');
      lines.push(`- proves: ${r.proves || 'n/a'}`);
      lines.push(`- detail: ${r.detail || 'n/a'}`);
      if (r.source) lines.push(`- source: ${[].concat(r.source).join(', ')}`);
      if (r.shot) lines.push(`- shot: shots/${r.shot}`);
      lines.push('');
    }
  } else {
    lines.push('Nothing failed and nothing went unmeasured.');
    lines.push('');
  }

  const byArea = {};
  for (const r of ledger.checks) (byArea[r.group || r.area] ||= []).push(r);
  lines.push('## Every check');
  lines.push('');
  for (const [area, rows] of Object.entries(byArea)) {
    lines.push(`### ${area}`);
    lines.push('');
    lines.push('| check | persona | status | detail |');
    lines.push('| --- | --- | --- | --- |');
    for (const r of rows) {
      lines.push(`| ${r.id} | ${r.persona} | ${r.status} | ${(r.detail || '').replace(/\|/g, '\\|').slice(0, 140)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Join two ledgers on (id, persona) so two runs a week apart can be compared. */
export function diff(aPath, bPath) {
  const a = JSON.parse(readFileSync(aPath, 'utf8'));
  const b = JSON.parse(readFileSync(bPath, 'utf8'));
  const key = (r) => `${r.id}::${r.persona}`;
  const am = new Map(a.checks.map((r) => [key(r), r]));
  const bm = new Map(b.checks.map((r) => [key(r), r]));
  const changed = [];
  const gone = [];
  const added = [];
  for (const [k, ra] of am) {
    const rb = bm.get(k);
    if (!rb) gone.push(ra);
    else if (rb.status !== ra.status) changed.push({ key: k, from: ra.status, to: rb.status, title: ra.title });
  }
  for (const [k, rb] of bm) if (!am.has(k)) added.push(rb);
  return { from: a.runId, to: b.runId, changed, gone, added };
}

export function loadLedger(dir) {
  const p = join(dir, 'ledger.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
