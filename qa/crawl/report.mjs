/**
 * THE REPORT AND THE DRAFT ITEMS. One markdown report per run with a screenshot for every finding,
 * findings deduped on route + rule + summary, and one triage-studio draft per NEW finding (not seen
 * in qa/crawl/known.json). Drafts are written here, never into triage-studio itself, unless the run
 * was started with --file-items: then they are copied into ../../triage-studio/items with real
 * ids from `board.mjs --next-id`, status inbox, which is the one place that repo lets a tool write.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

export const KNOWN = join(import.meta.dirname, 'known.json');
const TRIAGE = join(import.meta.dirname, '..', '..', '..', '..', 'triage-studio');

export function keyOf(f) {
  return `${f.route}|${f.rule}|${f.key ?? f.summary}`;
}

export function loadKnown() {
  try {
    return JSON.parse(readFileSync(KNOWN, 'utf8'));
  } catch {
    return {};
  }
}

export function saveKnown(known) {
  writeFileSync(KNOWN, JSON.stringify(known, null, 1) + '\n');
}

export function dedupe(findings) {
  const seen = new Map();
  for (const f of findings) {
    const k = keyOf(f);
    const prev = seen.get(k);
    if (prev) prev.count += 1;
    else seen.set(k, { ...f, count: 1 });
  }
  return [...seen.values()];
}

const ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function writeReport(runDir, { runId, persona, viewport, server, started, actions, screens, findings, known, today }) {
  const fresh = findings.filter((f) => !known[keyOf(f)]);
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.route.localeCompare(b.route));
  const lines = [];
  lines.push(`# Phone crawl ${runId}`);
  lines.push('');
  lines.push(`${today} · persona ${persona} · ${viewport.width}x${viewport.height} · ${server} · ${screens} screens · ${actions} actions · ${Math.round((Date.now() - started) / 1000)}s`);
  lines.push('');
  lines.push(`${findings.length} distinct findings, ${fresh.length} new since the last run.`);
  lines.push('');
  lines.push('| P | rule | route | what | seen | shot |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const f of findings) {
    const shot = f.shot ? `[shot](${relative(runDir, f.shot).replace(/\\/g, '/')})` : '';
    lines.push(`| ${f.severity} | ${f.rule} | ${f.route} | ${f.summary.replace(/\|/g, '/')}${known[keyOf(f)] ? '' : ' **new**'} | ${f.count} | ${shot} |`);
  }
  lines.push('');
  lines.push('## Drafts');
  lines.push('');
  lines.push(fresh.length ? `${fresh.length} draft item(s) in items/. Promote with --file-items on the next run, or copy by hand.` : 'Nothing new to file.');
  writeFileSync(join(runDir, 'report.md'), lines.join('\n') + '\n');
  writeFileSync(join(runDir, 'findings.json'), JSON.stringify(findings, null, 1) + '\n');
  return fresh;
}

function draft(id, f, { runId, today, persona, viewport }) {
  const short = `${f.rule} on ${f.route}`.slice(0, 40);
  return `---
id: ${id}
title: Phone crawl: ${f.summary.replace(/\n/g, ' ').slice(0, 110)}
short: ${short}
epic: michi
app: michi-maker
type: bug
status: inbox
priority: ${f.severity}
you_min:
machine_min:
you_actual_min:
machine_actual_min:
sprint:
created: ${today}
done:
source: qa/crawl run ${runId}
blocked_by:
---

Found by the phone crawler (qa/crawl, ${viewport.width}x${viewport.height}, persona ${persona}) on ${f.route}: ${f.summary}. Seen ${f.count} time(s) in the run.

**Done when:** the crawl's \`${f.rule}\` rule no longer fires on ${f.route}.

**Evidence:** ${f.shot ? f.shot.replace(/\\/g, '/') : 'no screenshot'}; findings.json in the run folder; last action: ${f.action ?? 'none'}.
`;
}

export function writeDrafts(runDir, fresh, meta, { fileItems }) {
  const dir = join(runDir, 'items');
  mkdirSync(dir, { recursive: true });
  const filed = [];
  fresh.forEach((f, i) => {
    let id = `MIC-draft-${String(i + 1).padStart(2, '0')}`;
    if (fileItems) {
      if (!existsSync(join(TRIAGE, 'scripts', 'board.mjs'))) throw new Error(`triage-studio not found at ${TRIAGE}`);
      id = execFileSync('node', ['scripts/board.mjs', '--next-id', 'michi-maker'], { cwd: TRIAGE, encoding: 'utf8' }).trim().split(/\s+/).pop();
      writeFileSync(join(TRIAGE, 'items', `${id}.md`), draft(id, f, meta));
      filed.push(id);
    }
    writeFileSync(join(dir, `${id}.md`), draft(id, f, meta));
    f.item = id;
  });
  return filed;
}
