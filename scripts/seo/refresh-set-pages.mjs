/**
 * REFRESH THE /sets PAGES' DATA BEFORE A DEPLOY (MIC-037; owner, 2026-11-15: "refresh prices before
 * each deploy"). One command:
 *
 *   node scripts/seo/refresh-set-pages.mjs
 *
 * Downloads the three PUBLIC browse files into a temp folder (the card list from michi-maker.com,
 * current prices and the image manifest from the data server's public browse bucket), runs
 * snapshot-set-pages.mjs on them, and leaves scripts/seo/set-pages.json and api/_sets.json changed
 * for you to commit. No key is used or printed. The bucket URL comes from
 * EXPO_PUBLIC_CATALOG_BROWSE_URL (environment or .env), read silently.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function browseUrl() {
  if (process.env.EXPO_PUBLIC_CATALOG_BROWSE_URL) return process.env.EXPO_PUBLIC_CATALOG_BROWSE_URL;
  try {
    const line = fs
      .readFileSync(path.join(ROOT, '.env'), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('EXPO_PUBLIC_CATALOG_BROWSE_URL='));
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

async function download(url, to) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url.split('?')[0]}`);
  fs.writeFileSync(to, Buffer.from(await res.arrayBuffer()));
  console.log(`  ${path.basename(to)}: ${(fs.statSync(to).size / 1e6).toFixed(1)} MB`);
}

const bucket = browseUrl();
if (!bucket) {
  console.error('FAILED: EXPO_PUBLIC_CATALOG_BROWSE_URL is not set (environment or .env)');
  process.exit(2);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'michi-sets-'));
try {
  console.log('[1/2] Downloading the public browse files');
  await download('https://michi-maker.com/browse/catalog.json?utm_medium=qa', path.join(dir, 'catalog.json'));
  await download(`${bucket}/prices-summary.json`, path.join(dir, 'prices.json'));
  await download(`${bucket}/images.json`, path.join(dir, 'images.json'));
  console.log('[2/2] Snapshot');
  execFileSync(
    process.execPath,
    [path.join(ROOT, 'scripts/seo/snapshot-set-pages.mjs'), '--catalog', path.join(dir, 'catalog.json'), '--prices', path.join(dir, 'prices.json'), '--images', path.join(dir, 'images.json')],
    { stdio: 'inherit' },
  );
  console.log('DONE: commit scripts/seo/set-pages.json and api/_sets.json, then ship.');
} catch (e) {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
