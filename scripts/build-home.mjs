/**
 * THE FRONT DOOR (MIC-037, SEO plan action 4; landing v2 from MKT-040). Runs in `buildCommand`
 * (vercel.json) after inject-meta and build-seo-data.
 *
 * `expo export` writes one file, dist/index.html, the app shell. A crawler reading `/` got
 * "Michi-Maker / Loading" and the title "poke-michi", and a first visit loaded the whole app only to
 * be sent on to /landing-v2/. This step leaves NO dist/index.html, so `/` is decided by the rewrites:
 *
 *   dist/app.html   the app shell, unchanged. `/` with the mm_app cookie, every app route and the
 *                   page functions (api/_shell.js) use it.
 *   dist/home.html  the static landing (dist/landing-v2/index.html, copied from public/) with the
 *                   gate (api/_landingGate.js) first in its <head>. `/` without the cookie: a first
 *                   visit and every crawler get the same real HTML, no app bundle.
 *
 * Re-runnable: when index.html is already gone, app.html is the shell.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { isPlainShell } = require(path.join(root, 'api/_shell.js'));
const { gateScript } = require(path.join(root, 'api/_landingGate.js'));

const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');
const appPath = path.join(dist, 'app.html');
const homePath = path.join(dist, 'home.html');
const landingPath = path.join(dist, 'landing-v2', 'index.html');

const shell = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : fs.readFileSync(appPath, 'utf8');
if (!isPlainShell(shell)) throw new Error('build-home: no plain app shell in dist/index.html or dist/app.html');
if (!/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/.test(shell)) throw new Error('build-home: the app shell names no entry bundle');

const landing = fs.readFileSync(landingPath, 'utf8');
const charset = /<meta charset="utf-8">\r?\n?/i;
if (!charset.test(landing)) throw new Error('build-home: no <meta charset="utf-8"> in the landing head');
const home = landing.replace(charset, (m) => `${m}${gateScript()}\n`);
for (const need of ['michiLandingGate', 'rel="canonical" href="https://michi-maker.com/"', '<title>', 'data-cta="enter_hero"']) {
  if (!home.includes(need)) throw new Error(`build-home: home.html lacks ${need}`);
}
if (/_expo\/static\/js/.test(home)) throw new Error('build-home: home.html must not load the app bundle');

fs.writeFileSync(appPath, shell);
fs.writeFileSync(homePath, home);
fs.rmSync(indexPath, { force: true });
console.log(`build-home: dist/app.html (app shell, ${shell.length} bytes), dist/home.html (landing + gate, ${home.length} bytes), no dist/index.html`);
