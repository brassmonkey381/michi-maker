/**
 * Does the build actually carry the tcgscan-browse it claims to?
 *
 * WHY THIS EXISTS. On 2026-09-17 michi-maker.com painted white for everyone. The kit had been
 * re-pinned by text-replacing its commit sha in package.json and package-lock.json; the lock entry
 * still carried the PREVIOUS "version" and "integrity", npm read that as satisfied and reinstalled
 * the old kit from cache. `src/lib/catalogConfig.ts` calls a newer kit function at import time on
 * every route, so the app died before first paint. `npx tsc --noEmit` and `npm test` both passed,
 * because they ran against a node_modules that had been copied by hand — neither one looks at what
 * a BUILD installs.
 *
 * Three checks, in the order they catch things earliest:
 *   1. lock vs installed — the lockfile is what CI installs from, so it must agree with disk.
 *   2. installed vs required symbols — the app calls these; missing means a boot crash.
 *   3. bundle vs required symbols — the only check that sees what actually ships.
 *
 *   node scripts/check-kit-integrity.mjs                        # 1 + 2 (instant)
 *   node scripts/check-kit-integrity.mjs --bundle dist          # + 3 over a local export
 *   node scripts/check-kit-integrity.mjs --bundle https://michi-maker.com   # + 3 over the live site
 *
 * ADD A SYMBOL HERE whenever the app starts calling a new kit export, especially one called at
 * import time. That is the whole point: this file is the list of things whose absence is fatal.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PKG = 'tcgscan-browse';
/** Kit exports michi depends on. `registerImageManifest` is the one that took the site down. */
const REQUIRED = ['registerImageManifest', 'loadImageManifest', 'imageManifestRevision', 'buildCatalog'];

const fail = (msg) => {
  console.log(`FAIL  ${msg}`);
  process.exitCode = 1;
};
const pass = (msg) => console.log(`ok    ${msg}`);

// ---- 1. lock vs installed ------------------------------------------------------------------
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const spec = pkg.dependencies?.[PKG] ?? '';
const sha = /#([0-9a-f]{40})/.exec(spec)?.[1];
const lockEntry = lock.packages?.[`node_modules/${PKG}`];
const installedPath = join('node_modules', PKG, 'package.json');
const installed = existsSync(installedPath) ? JSON.parse(readFileSync(installedPath, 'utf8')) : null;

if (!sha) fail(`package.json does not pin ${PKG} to a commit sha (got "${spec}")`);
if (!lockEntry) fail(`package-lock.json has no node_modules/${PKG} entry`);
else if (!String(lockEntry.resolved ?? '').includes(sha ?? 'x')) {
  fail(`package-lock resolves ${PKG} to ${lockEntry.resolved} but package.json pins ${sha}`);
} else pass(`lock resolves ${PKG} to the pinned commit`);

if (!installed) fail(`${PKG} is not installed`);
else if (lockEntry && lockEntry.version !== installed.version) {
  // The exact 2026-09-17 shape: a lock version left behind by a hand-edited sha.
  fail(`package-lock says ${PKG}@${lockEntry.version} but node_modules has ${installed.version} — `
    + `a CI build would install ${lockEntry.version}. Re-pin with: npm install "${spec}"`);
} else if (installed) pass(`lock and node_modules agree on ${PKG}@${installed.version}`);

// ---- 2. installed vs required symbols -------------------------------------------------------
if (installed) {
  const distDir = join('node_modules', PKG, 'dist');
  const source = existsSync(distDir)
    ? readdirSync(distDir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(distDir, f), 'utf8')).join('\n')
    : '';
  const missing = REQUIRED.filter((s) => !source.includes(s));
  if (missing.length) fail(`installed ${PKG}@${installed.version} is missing: ${missing.join(', ')}`);
  else pass(`installed kit exports all ${REQUIRED.length} required symbols`);
}

// ---- 3. the built bundle (what actually ships) ----------------------------------------------
const target = process.argv[process.argv.indexOf('--bundle') + 1];
if (process.argv.includes('--bundle') && target) {
  const bundle = target.startsWith('http') ? await fetchBundle(target) : readLocalBundle(target);
  if (bundle) {
    const missing = REQUIRED.filter((s) => !bundle.text.includes(s));
    if (missing.length) {
      fail(`the bundle at ${bundle.where} is missing: ${missing.join(', ')} — it bundled an OLD ${PKG}`);
    } else pass(`bundle ${bundle.where} (${Math.round(bundle.text.length / 1024)} KB) carries the kit`);
  }
}

async function fetchBundle(origin) {
  try {
    const html = await (await fetch(origin)).text();
    const src = /src="([^"]*_expo\/static\/js\/web\/[^"]+\.js)"/.exec(html)?.[1];
    if (!src) return fail(`no Expo bundle referenced by ${origin} (is it serving the app at all?)`);
    const url = src.startsWith('http') ? src : new URL(src, origin).toString();
    return { where: url.slice(url.lastIndexOf('/') + 1), text: await (await fetch(url)).text() };
  } catch (e) {
    return fail(`could not read the bundle at ${origin}: ${e.message}`);
  }
}

function readLocalBundle(dir) {
  const webDir = join(dir, '_expo', 'static', 'js', 'web');
  if (!existsSync(webDir)) return fail(`no export at ${webDir} — run: npx expo export -p web`);
  const entry = readdirSync(webDir).filter((f) => f.startsWith('entry-') && f.endsWith('.js')).pop();
  if (!entry) return fail(`no entry-*.js under ${webDir}`);
  return { where: entry, text: readFileSync(join(webDir, entry), 'utf8') };
}

console.log(process.exitCode ? '\nKIT INTEGRITY: FAILED' : '\nKIT INTEGRITY: OK');
