/**
 * THE CONSOLE. A zero-dependency HTTP server on 127.0.0.1:8099 serving one static page and a
 * handful of JSON routes.
 *
 * WHY NOT A FRAMEWORK. This workspace has no bundler for tooling, and a QA console that needs its
 * own build step is a QA console that stops working the first time a dependency moves. One HTML
 * file and node's own http module will still run in a year.
 *
 * WHY 127.0.0.1 AND NOT 0.0.0.0. The console can start runs that write to the one shared production
 * project. It is not a thing to expose on a network.
 *
 * THE POST BODY IS AN ENUM, NEVER A PATH OR A SELECTOR. Everything it accepts is validated against
 * the suite catalog, so the console cannot be talked into running arbitrary code.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AREAS, select, writeBudget } from './suites/index.mjs';
import { rollup } from './lib/ledger.mjs';
import { PERSONAS } from './lib/personas.mjs';
import { TARGETS } from './lib/targets.mjs';
import { run, doctor, listRuns, RUNS_DIR } from './rig.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 8099;

/** Live run state. One run at a time, on purpose: two concurrent runs would fight over personas. */
const live = { running: false, runId: null, events: [], counts: null, startedAt: null };

const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 20000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

/** Everything the console may be asked for, validated against the catalog. Nothing free-form. */
function validatePlan(body) {
  const areas = AREAS.map((a) => a.area);
  const personas = Object.keys(PERSONAS);
  const pick = (value, allowed, fallback) => {
    const list = (Array.isArray(value) ? value : []).filter((v) => allowed.includes(v));
    return list.length ? list : fallback;
  };
  return {
    apps: pick(body.apps, ['michi', 'tcgscan'], ['michi', 'tcgscan']),
    areas: pick(body.areas, areas, areas),
    personas: pick(body.personas, personas, ['guest']),
    target: ['prod', 'export'].includes(body.target) ? body.target : 'prod',
    viewport: ['desktop', 'laptop', 'mid', 'phone'].includes(body.viewport) ? body.viewport : 'laptop',
    includeHeavy: body.includeHeavy === true,
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  try {
    if (path === '/' || path === '/index.html') {
      const html = readFileSync(join(HERE, 'console.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      return res.end(html);
    }

    if (path === '/api/catalog') {
      return json(res, 200, {
        areas: AREAS,
        personas: Object.values(PERSONAS).map((p) => ({ id: p.id, label: p.label, blurb: p.blurb, available: p.available, reason: p.reason || null })),
        // `export` is listed but disabled until a local export is actually being served. An option
        // that silently produces a run of VOIDs is worse than one that is visibly not ready.
        targets: await Promise.all(Object.entries(TARGETS).map(async ([id, t]) => {
          let ready = true;
          if (id === 'export') {
            ready = await fetch(t.michi, { signal: AbortSignal.timeout(1200) }).then((r) => r.ok).catch(() => false);
          }
          return { id, label: t.label, note: t.note || null, ready, reason: ready ? null : 'nothing is serving a local export on 8088/8091' };
        })),
        runs: listRuns().slice(0, 30),
      });
    }

    if (path === '/api/plan' && req.method === 'POST') {
      const plan = validatePlan(await readBody(req));
      const selected = select(plan);
      return json(res, 200, {
        plan,
        count: selected.length,
        budget: writeBudget(selected),
        checks: selected.map((c) => ({ id: c.id, title: c.title, area: c.area, app: c.app, danger: c.danger, severity: c.severity || 'major', heavy: Boolean(c.heavy), personas: c.personas })),
      });
    }

    if (path === '/api/doctor') return json(res, 200, await doctor());

    if (path === '/api/run' && req.method === 'POST') {
      if (live.running) return json(res, 409, { error: 'a run is already in flight' });
      const plan = validatePlan(await readBody(req));
      live.running = true;
      live.events = [];
      live.counts = null;
      live.startedAt = new Date().toISOString();
      live.runId = null;

      run(plan, (e) => {
        live.events.push({ ...e, at: new Date().toISOString() });
        if (e.type === 'done') {
          live.counts = e.counts;
          live.runId = e.runId;
          live.rollup = e.rollup || null;
        }
      })
        .then((r) => {
          live.runId = r.ledger.meta.runId;
          live.exitCode = r.exitCode;
        })
        .catch((err) => {
          live.events.push({ type: 'crashed', detail: String(err), at: new Date().toISOString() });
        })
        .finally(() => {
          live.running = false;
        });

      return json(res, 202, { started: true });
    }

    if (path === '/api/live') {
      const since = Number(url.searchParams.get('since') || 0);
      return json(res, 200, {
        running: live.running,
        runId: live.runId,
        counts: live.counts,
        rollup: live.rollup ?? null,
        exitCode: live.exitCode ?? null,
        startedAt: live.startedAt,
        events: live.events.slice(since),
        total: live.events.length,
      });
    }

    if (path === '/api/report') {
      const id = url.searchParams.get('run');
      const file = join(RUNS_DIR, String(id), 'ledger.json');
      if (!id || !/^run-[\w-]+$/.test(id) || !existsSync(file)) return json(res, 404, { error: 'no such run' });
      const led = JSON.parse(readFileSync(file, 'utf8'));
      return json(res, 200, { ...led, rollup: rollup(led.checks, led.excludedChecks || []) });
    }

    if (path.startsWith('/shots/')) {
      const rel = path.slice('/shots/'.length);
      if (!/^run-[\w-]+\/[\w.-]+$/.test(rel)) return json(res, 400, { error: 'bad path' });
      const [runId, name] = rel.split('/');
      const file = join(RUNS_DIR, runId, 'shots', name);
      if (!existsSync(file)) return json(res, 404, { error: 'no such shot' });
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      return res.end(readFileSync(file));
    }

    if (path === '/api/spec') {
      const file = join(HERE, 'spec.json');
      if (!existsSync(file)) return json(res, 404, { error: 'run `node qa/rig.mjs spec` first' });
      return json(res, 200, JSON.parse(readFileSync(file, 'utf8')));
    }

    json(res, 404, { error: 'no such route' });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`\n  QA console  http://127.0.0.1:${PORT}\n  Ctrl+C to stop.\n\n`);
});
