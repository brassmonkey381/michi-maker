// Copy deck, step 2: write the owner's edits from the copy editor back into the source.
//
//   node scripts/copy-deck/apply.mjs <catalog.json> <edits.json> [--dry]
//
// edits.json is [{ id, phone?, web? }] ("web" is the Desktop box: michi ships web only, and Phone
// means a narrow screen). A row shown on both whose Phone and Desktop text differ becomes
// `isPhoneWidth() ? phone : desktop` in the code (src/lib/phoneWidth.ts). Each edit is checked
// against the source first: if the code moved since the catalog was made, that row FAILS and
// nothing in it is guessed. Rows from the tcgscan-browse kit are refused: that text changes in the
// kit's own repo and arrives with a re-pin. Prints one line per change and writes
// <edits>.applied.json with the ids that landed.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const [catalogPath, editsPath, flag] = process.argv.slice(2);
if (!catalogPath || !editsPath) { console.log('FAILED: usage: apply.mjs <catalog.json> <edits.json> [--dry]'); process.exit(2); }
const DRY = flag === '--dry';
const APP = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const ROOTS = { app: APP };

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const edits = JSON.parse(readFileSync(editsPath, 'utf8'));
const byId = new Map(catalog.strings.map((s) => [s.id, s]));

// `${…}` (templates) or `{…}` (JSX) placeholders, braces balanced, so nested templates survive.
function split(text, open) {
  const parts = [];
  let i = 0, lit = '';
  while (i < text.length) {
    if (text.startsWith(open, i)) {
      let depth = 0, j = i + open.length - 1;
      for (; j < text.length; j++) { if (text[j] === '{') depth++; else if (text[j] === '}' && --depth === 0) break; }
      if (j >= text.length) throw new Error(`an unclosed ${open}`);
      parts.push({ lit }, { ph: text.slice(i, j + 1) });
      lit = ''; i = j + 1;
    } else { lit += text[i++]; }
  }
  parts.push({ lit });
  return parts;
}
const holes = (text, open) => split(text, open).filter((p) => p.ph).map((p) => p.ph.replace(/\s+/g, ' ')).sort().join('\n');

const js = (t, q = "'") => q + t.replace(/\\/g, '\\\\').replace(new RegExp(q, 'g'), '\\' + q).replace(/\n/g, '\\n') + q;
const tpl = (t) => '`' + split(t, '${').map((p) => p.ph ?? p.lit.replace(/`/g, '\\`')).join('') + '`';
// JSX text: the characters lint and the parser object to become entities (the editor shows them plain).
const JSX_ENT = { "'": '&apos;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;', '&': '&amp;' };
const jsxSafe = (lit) => lit.replace(/[&'"<>{}]/g, (c) => JSX_ENT[c]);
const jsxText = (t) => jsxSafe(t);
const jsxRun = (t) => split(t, '{').map((p) => p.ph ?? jsxSafe(p.lit)).join('');

function check(row, t) {
  if (!t.trim()) throw new Error('the new text is empty');
  if (row.mode === 'tpl' && holes(t, '${') !== holes(row.text, '${')) throw new Error(`keep every \${…} exactly: ${holes(row.text, '${').split('\n').join(' ')}`);
  if (row.mode === 'jsxrun' && holes(t, '{') !== holes(row.text, '{')) throw new Error(`keep every {…} exactly: ${holes(row.text, '{').split('\n').join(' ')}`);
  if (row.mode === 'jsx' || row.mode === 'str' || row.mode === 'tpl') if (row.mode !== 'tpl' && /\$\{|\{[^}]*\}/.test(t) && !/\{[^}]*\}/.test(row.text)) throw new Error('this text has no {…} slots; remove the braces');
}
function encode(row, t) {
  if (row.mode === 'jsx') return jsxText(t);
  if (row.mode === 'jsxrun') return jsxRun(t);
  if (row.mode === 'tpl') return tpl(t);
  const q = row.raw[0] === '"' ? '"' : "'";
  if (row.bare) return /["\\\n]/.test(t) ? `{${js(t)}}` : `"${t}"`;
  return js(t, q);
}
const COND = 'isPhoneWidth()';
function encodeSplit(row, web, phone) {
  if (row.mode === 'jsx') return `{${COND} ? ${js(phone)} : ${js(web)}}`;
  if (row.mode === 'jsxrun') return `{${COND} ? <>${jsxRun(phone)}</> : <>${jsxRun(web)}</>}`;
  if (row.mode === 'tpl') return `(${COND} ? ${tpl(phone)} : ${tpl(web)})`;
  if (row.bare) return `{${COND} ? ${js(phone)} : ${js(web)}}`;
  return `(${COND} ? ${js(phone)} : ${js(web)})`;
}
function ensureHelperImport(src) {
  if (/import\s*\{[^}]*\bisPhoneWidth\b[^}]*\}\s*from\s*'@\/lib\/phoneWidth';/.test(src)) return src;
  const imports = [...src.matchAll(/^import[^;]*;\s*$/gm)];
  const at = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
  return src.slice(0, at) + "\nimport { isPhoneWidth } from '@/lib/phoneWidth';" + src.slice(at);
}

const files = new Map(); // repo:file -> [{row, start, end, code}]
const failed = [], applied = [], risky = [];
for (const e of edits) {
  const row = byId.get(e.id);
  if (!row) { failed.push(`${e.id}: not in this catalog (the code changed; re-extract)`); continue; }
  if (!ROOTS[row.repo]) { failed.push(`${row.repo}/${row.file}:${row.line} "${row.text.slice(0, 50)}": lives in the ${row.repo} kit; change it there and re-pin`); continue; }
  try {
    const phone = row.platform === 'web' ? null : (e.phone ?? row.text);
    const web = row.platform === 'phone' ? null : (e.web ?? row.text);
    for (const t of [phone, web]) if (t !== null) check(row, t);
    if ((phone ?? web) === row.text && (web ?? phone) === row.text) continue; // nothing changed
    const code = phone !== null && web !== null && phone !== web ? encodeSplit(row, web, phone) : encode(row, phone ?? web);
    const key = `${row.repo}:${row.file}`;
    if (!files.has(key)) files.set(key, []);
    files.get(key).push({ row, code, phone, web, split: phone !== null && web !== null && phone !== web });
    if (row.risky) risky.push(row);
  } catch (err) { failed.push(`${row.file}:${row.line} "${row.text.slice(0, 50)}": ${err.message}`); }
}

const touched = [];
for (const [key, list] of files) {
  const [repo, file] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const path = join(ROOTS[repo], file);
  let src = readFileSync(path, 'utf8');
  const placed = [];
  for (const c of list) {
    let start = c.row.start;
    if (src.slice(start, c.row.end) !== c.row.raw) {
      const hits = [];
      for (let i = src.indexOf(c.row.raw); i >= 0; i = src.indexOf(c.row.raw, i + 1)) hits.push(i);
      if (hits.length !== 1) { failed.push(`${file}:${c.row.line} "${c.row.text.slice(0, 50)}": the code changed here since the catalog was made (${hits.length} matches); re-extract`); continue; }
      start = hits[0];
    }
    placed.push({ ...c, start, end: start + c.row.raw.length });
  }
  placed.sort((a, b) => b.start - a.start);
  for (const c of placed) src = src.slice(0, c.start) + c.code + src.slice(c.end);
  if (placed.some((c) => c.split)) src = ensureHelperImport(src);
  if (!DRY && placed.length) writeFileSync(path, src);
  if (placed.length) touched.push(`${repo}/${file}`);
  for (const c of placed.reverse()) {
    applied.push(c.row.id);
    const show = c.split ? `phone "${c.phone}" / desktop "${c.web}"` : `"${c.phone ?? c.web}"`;
    console.log(`+ ${repo}/${file}:${c.row.line}  "${c.row.text.slice(0, 60)}" -> ${show.slice(0, 140)}`);
  }
}
for (const f of failed) console.log(`- FAILED ${f}`);
for (const r of risky) console.log(`! CHECK ${r.repo}/${r.file}:${r.line} "${r.text}" is also used as a value in code`);
if (!DRY) writeFileSync(editsPath.replace(/\.json$/, '') + '.applied.json', JSON.stringify({ applied, touched }, null, 2));
console.log(`${DRY ? 'DRY RUN: ' : ''}${applied.length} applied, ${failed.length} failed, ${touched.length} files: ${touched.join(', ')}`);
process.exit(failed.length ? 1 : 0);
