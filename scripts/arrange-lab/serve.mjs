/**
 * ARRANGE LAB, step 2: serve the review page on this machine and record the votes.
 *
 *   node scripts/arrange-lab/serve.mjs          -> http://127.0.0.1:8766
 *
 * GET  /             the page (lab.html, next to this file)
 * GET  /rounds.json  what build.mjs wrote
 * GET  /votes.json   every vote so far, as an array (the page resumes where the owner stopped)
 * POST /vote         one vote, appended to votes.jsonl
 *
 * Card pictures load from the public thumbnail store directly; nothing is proxied and no key is
 * involved. Local only: it listens on the loopback address.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const DIR = join(ROOT, 'state', 'out', 'arrange-lab');
const ROUNDS = join(DIR, 'rounds.json');
const VOTES = join(DIR, 'votes.jsonl');
const PAGE = join(here, 'lab.html');
const PORT = Number(process.env.ARRANGE_LAB_PORT || 8766);

if (!existsSync(ROUNDS)) {
  console.log(`FAILED: ${ROUNDS} is missing; run build.mjs first`);
  process.exit(2);
}
mkdirSync(DIR, { recursive: true });

const votes = () => (existsSync(VOTES) ? readFileSync(VOTES, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, type, body) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  if (req.method === 'GET' && url.pathname === '/') return send(200, 'text/html; charset=utf-8', readFileSync(PAGE));
  if (req.method === 'GET' && url.pathname === '/rounds.json') return send(200, 'application/json', readFileSync(ROUNDS));
  if (req.method === 'GET' && url.pathname === '/votes.json') return send(200, 'application/json', JSON.stringify(votes()));
  if (req.method === 'POST' && url.pathname === '/vote') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 65536) req.destroy();
    });
    req.on('end', () => {
      try {
        const row = JSON.parse(body);
        if (typeof row.round !== 'string') throw new Error('no round');
        appendFileSync(VOTES, JSON.stringify({ ...row, at: new Date().toISOString() }) + '\n');
        send(200, 'application/json', '{"ok":true}');
      } catch (e) {
        send(400, 'application/json', JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return undefined;
  }
  return send(404, 'text/plain', 'not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`arrange lab on http://127.0.0.1:${PORT}  (votes -> ${VOTES})`);
  console.log('Ctrl+C here stops it.');
});
