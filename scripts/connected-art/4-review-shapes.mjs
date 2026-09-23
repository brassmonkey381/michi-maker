/**
 * Build a local page for eyeballing the shape reading.
 *
 * A shape is only checkable against the picture it was read from, so every row shows the
 * photograph with the detector's boxes drawn over it, numbered in the order the grid put them in.
 * If the numbers run left to right along a row, the reading is right; if they jump about, it is
 * not, and that is visible in a second without reading any JSON.
 *
 * LOCAL FILE, DELIBERATELY. It references the photographs on this disk through relative paths and
 * embeds none of them. They are someone else's photographs, kept here to identify cards and for
 * nothing else, so this page cannot be published or sent anywhere: open it from disk, look, close
 * it. state/connected-art/ is gitignored for the same reason.
 *
 *   node scripts/connected-art/4-review-shapes.mjs
 *   then open state/connected-art/review.html
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');
const shapesPath = join(DIR, 'shapes.json');
if (!existsSync(shapesPath)) {
  console.log('FAILED: shapes.json not found. Run 3-detect-shapes.mjs first.');
  process.exit(2);
}
const { results } = JSON.parse(readFileSync(shapesPath, 'utf8'));
const ok = results.filter((r) => !r.error && r.boxes?.length);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Things worth looking at first: they are where a wrong shape would hide. */
function flags(r) {
  const out = [];
  if (!r.michiPage) out.push({ cls: 'bad', text: 'no page fits' });
  if (r.countMatch === false) out.push({ cls: 'warn', text: `caption says ${r.namedCards}, found ${r.detected}` });
  if (r.grid.rows > 1 && r.grid.cols > 1) out.push({ cls: 'ok', text: 'grid' });
  if (r.boxes.some((b) => b.score < 0.5)) out.push({ cls: 'warn', text: 'low-confidence box' });
  return out;
}
const rank = (r) => (!r.michiPage ? 0 : r.countMatch === false ? 1 : r.grid.rows > 1 && r.grid.cols > 1 ? 2 : 3);
const sorted = [...ok].sort((a, b) => rank(a) - rank(b) || a.hash.localeCompare(b.hash));

const byPage = {};
for (const r of ok) byPage[r.michiPage ?? 'none'] = (byPage[r.michiPage ?? 'none'] ?? 0) + 1;

const cards = sorted
  .map((r) => {
    // Where each box sits, as a percentage, so the overlay scales with whatever width the image
    // is rendered at.
    const order = (r.order ?? []).flat();
    const pos = new Map(order.map((boxIndex, n) => [boxIndex, n + 1]));
    const boxes = r.boxes
      .map((b, i) => {
        const l = (b.xmin * 100).toFixed(2);
        const t = (b.ymin * 100).toFixed(2);
        const w = ((b.xmax - b.xmin) * 100).toFixed(2);
        const h = ((b.ymax - b.ymin) * 100).toFixed(2);
        const n = pos.get(i) ?? '?';
        const weak = b.score < 0.5 ? ' weak' : '';
        return `<div class="bx${weak}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%"><span>${n}</span></div>`;
      })
      .join('');
    const tags = flags(r)
      .map((f) => `<span class="tag ${f.cls}">${esc(f.text)}</span>`)
      .join('');
    const disagree =
      r.latticeGrid && !r.agree
        ? `<span class="tag muted">lattice read ${r.latticeGrid.rows}&times;${r.latticeGrid.cols}</span>`
        : '';
    return `<figure class="card" data-page="${esc(r.michiPage ?? 'none')}">
  <div class="shot"><img loading="lazy" src="images/${esc(r.hash)}.jpg" alt="">${boxes}</div>
  <figcaption>
    <div class="row"><b class="shape">${r.grid.rows}&times;${r.grid.cols}</b><span class="arrow">&rarr;</span><b class="page">${esc(r.michiPage ?? 'none')}</b></div>
    <div class="cap">${esc(r.caption ?? '(no caption)')}</div>
    <div class="sec">${esc(r.section ?? '')}</div>
    <div class="tags">${tags}${disagree}</div>
  </figcaption>
</figure>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connected art: shape check</title>
<style>
  :root{--bg:#14161a;--panel:#1c1f26;--line:#2b303a;--ink:#e8eaee;--muted:#8b93a1;--accent:#5b8cff;
        --ok:#3fb27f;--warn:#e0a33e;--bad:#e2584d}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  header{position:sticky;top:0;z-index:5;background:rgba(20,22,26,.94);backdrop-filter:blur(8px);
         border-bottom:1px solid var(--line);padding:14px 20px}
  h1{margin:0 0 6px;font-size:17px;letter-spacing:.2px}
  .sub{color:var(--muted);font-size:13px}
  .filters{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}
  .filters button{background:var(--panel);color:var(--ink);border:1px solid var(--line);
    border-radius:999px;padding:5px 12px;font:inherit;font-size:12px;cursor:pointer}
  .filters button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
  main{padding:18px 20px 60px;display:grid;gap:18px;
       grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}
  .card{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .shot{position:relative;line-height:0;background:#0d0f12}
  .shot img{width:100%;height:auto;display:block}
  .bx{position:absolute;border:2px solid var(--accent);border-radius:3px;
      box-shadow:0 0 0 1px rgba(0,0,0,.55) inset}
  .bx.weak{border-color:var(--warn);border-style:dashed}
  .bx span{position:absolute;left:-1px;top:-1px;background:var(--accent);color:#fff;
    font:700 11px/1 ui-sans-serif,system-ui;padding:3px 5px;border-radius:3px 0 3px 0}
  .bx.weak span{background:var(--warn)}
  figcaption{padding:10px 12px 12px}
  .row{display:flex;align-items:center;gap:8px;margin-bottom:4px}
  .shape{font-size:17px}
  .arrow{color:var(--muted)}
  .page{color:var(--accent)}
  .cap{font-size:13px}
  .sec{color:var(--muted);font-size:12px;margin-top:2px}
  .tags{margin-top:7px;display:flex;gap:5px;flex-wrap:wrap}
  .tag{font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
  .tag.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 45%,transparent)}
  .tag.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
  .tag.bad{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 45%,transparent)}
  .hidden{display:none}
</style></head>
<body>
<header>
  <h1>Connected art: does the shape match the picture?</h1>
  <div class="sub">
    ${ok.length} groups read. Boxes are what the detector found; the number on each is the order the
    grid put it in. If the numbers run left to right along each row, the shape is right.
    Trouble first: no page fits, then caption/detection disagreements, then real grids.
  </div>
  <div class="filters">
    <button data-f="all" aria-pressed="true">All ${ok.length}</button>
    ${Object.keys(byPage)
      .sort()
      .map((k) => `<button data-f="${esc(k)}" aria-pressed="false">${esc(k)} &times;${byPage[k]}</button>`)
      .join('')}
  </div>
</header>
<main id="grid">
${cards}
</main>
<script>
  const buttons = [...document.querySelectorAll('.filters button')];
  const cards = [...document.querySelectorAll('.card')];
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    const f = b.dataset.f;
    cards.forEach((c) => c.classList.toggle('hidden', f !== 'all' && c.dataset.page !== f));
  }));
</script>
</body></html>`;

const out = join(DIR, 'review.html');
writeFileSync(out, html);
console.log(`Wrote ${out}`);
console.log(`  ${ok.length} groups with boxes`);
for (const k of Object.keys(byPage).sort()) console.log(`    ${k.padEnd(6)} x${byPage[k]}`);
console.log('\nOpen it from disk. It reads the photographs next to it and embeds none of them.');
