/**
 * REAL HTML AT `/` (MIC-037, SEO plan action 4). Runs in `buildCommand` (vercel.json) after
 * inject-meta and build-seo-data.
 *
 * The web build is one file, dist/index.html, served for `/` and (through the rewrites) for every
 * app route. A crawler reading `/` got "Michi-Maker / Loading" and the title "poke-michi". Now the
 * build writes two files:
 *
 *   dist/app.html    the plain app shell (loading splash in #root). Every app route without a page
 *                    of its own is rewritten to it, and the page functions compose onto it.
 *   dist/index.html  the HOME page: the same shell with home's title, canonical and description,
 *                    and a readable body (api/page-static.js homePage()) in place of the splash.
 *                    `/` and `/welcome` serve it.
 *
 * `/` stays a static, edge-cached file (no function in front of the ad landing). The bytes are the
 * same for a person and a crawler; React replaces the body when the app mounts.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { compose, isPlainShell } = require(path.join(root, 'api/_shell.js'));
const { pages } = require(path.join(root, 'api/page-static.js'));

const indexPath = path.join(root, 'dist/index.html');
const appPath = path.join(root, 'dist/app.html');

// Re-runnable: when index.html is already the composed home, the plain shell is app.html.
const current = fs.readFileSync(indexPath, 'utf8');
const shell = isPlainShell(current) ? current : fs.readFileSync(appPath, 'utf8');
if (!isPlainShell(shell)) throw new Error('build-home: no plain app shell in dist/index.html or dist/app.html');

const home = compose(shell, pages.homePage());
if (!home.includes('id="seo"')) throw new Error('build-home: the home body did not land in #root');
if (!home.includes('rel="canonical"')) throw new Error('build-home: the home canonical is missing');

fs.writeFileSync(appPath, shell);
fs.writeFileSync(indexPath, home);
console.log(`build-home: dist/app.html (app shell, ${shell.length} bytes), dist/index.html (home, ${home.length} bytes)`);
