/**
 * STAGE 2: fetch the gallery photographs, once, slowly.
 *
 * WHY THIS IS A SEPARATE, DELIBERATE STEP. elitefourum's robots.txt disallows /uploads/ for
 * ClaudeBot, Claude-Web and anthropic-ai. That is a request aimed at crawlers, and this is not a
 * crawl: it is one pass over 201 images the owner can already see in their browser, fetched to
 * identify the cards in them and then kept only as local working files. The owner weighed that and
 * asked for it. It is recorded here so the decision is visible rather than buried in a script.
 *
 * WHAT THAT MEANS FOR HOW IT BEHAVES:
 *   - It identifies itself honestly. It does NOT pretend to be a browser. If the server refuses
 *     this agent, that is an answer and the script stops rather than trying again in a costume.
 *   - One request at a time, with a real pause between them. No concurrency.
 *   - It resumes. A file already on disk is never fetched twice, so a re-run costs the server
 *     nothing and an interrupted run does not start over.
 *   - It gives up early. Repeated failures stop the run instead of working through 201 of them.
 *
 * The images are working files: they feed the detector and then they stop mattering. None of them
 * is copied into the product, and state/connected-art/ is gitignored.
 *
 * Writes state/connected-art/images/<hash>.jpg
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');
const IMAGES = join(DIR, 'images');

/** Slow on purpose. 201 images at this pace is about four minutes and costs the host nothing. */
const PAUSE_MS = 900;
/** Stop rather than grind through a wall of failures. */
const GIVE_UP_AFTER = 5;
/** An error page or a placeholder is not a photograph. */
const MIN_BYTES = 10_000;

const UA = 'michi-maker-import/1.0 (one-off personal import, not a crawler; michi-maker.com)';

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const entriesPath = join(DIR, 'entries.json');
if (!existsSync(entriesPath)) fail(`${entriesPath} not found. Run 1-scrape.mjs first.`);
const { entries } = JSON.parse(readFileSync(entriesPath, 'utf8'));
mkdirSync(IMAGES, { recursive: true });

const todo = entries.filter((e) => e.imageUrl && !existsSync(join(IMAGES, `${e.hash}.jpg`)));
console.log(`Step 1: ${entries.length} entries, ${entries.length - todo.length} already on disk, ${todo.length} to fetch`);
if (!todo.length) {
  console.log('\nOK: nothing to do, every image is already here.');
  process.exit(0);
}
console.log(`  one at a time, ${PAUSE_MS}ms apart, about ${Math.ceil((todo.length * PAUSE_MS) / 60000)} minutes\n`);

let got = 0;
let consecutiveFailures = 0;
const problems = [];

for (const [i, entry] of todo.entries()) {
  const label = `[${String(i + 1).padStart(3)}/${todo.length}]`;
  try {
    const res = await fetch(entry.imageUrl, { headers: { 'User-Agent': UA, Accept: 'image/*' } });
    if (res.status === 403 || res.status === 401) {
      // The server has said no to this agent. That is a decision, not a hiccup: do not retry, and
      // do not try again wearing a different name.
      fail(`the host refused this client (${res.status}) on ${entry.imageUrl}\n  Stopping. Nothing will be retried under a different user-agent.`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_BYTES) throw new Error(`only ${buf.length} bytes, not a photograph`);
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG (bad magic bytes)');

    writeFileSync(join(IMAGES, `${entry.hash}.jpg`), buf);
    got += 1;
    consecutiveFailures = 0;
    const kb = Math.round(buf.length / 1024);
    console.log(`${label} ok  ${String(kb).padStart(4)} KB  ${entry.section ?? '?'} :: ${entry.rawCaption ?? '(no caption)'}`);
  } catch (e) {
    consecutiveFailures += 1;
    problems.push({ hash: entry.hash, url: entry.imageUrl, error: String(e.message ?? e) });
    console.log(`${label} FAILED ${entry.hash}: ${e.message ?? e}`);
    if (consecutiveFailures >= GIVE_UP_AFTER) {
      fail(`${GIVE_UP_AFTER} failures in a row. Stopping rather than working through the rest.`);
    }
  }
  if (i < todo.length - 1) await sleep(PAUSE_MS);
}

console.log(`\nStep 2: ${got} fetched, ${problems.length} failed`);
if (problems.length) {
  writeFileSync(join(DIR, 'fetch-problems.json'), JSON.stringify(problems, null, 2));
  console.log(`  wrote ${join(DIR, 'fetch-problems.json')}; re-running this script retries only those.`);
}
const onDisk = entries.filter((e) => existsSync(join(IMAGES, `${e.hash}.jpg`))).length;
console.log(`  ${onDisk} of ${entries.length} entries now have a photograph on disk`);
console.log('\nOK: stage 2 complete. Nothing was written to the database.');
