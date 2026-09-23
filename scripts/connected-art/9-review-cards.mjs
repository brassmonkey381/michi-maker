/**
 * STAGE 9: did name scoping pick better cards? A page for judging that by eye.
 *
 * THE COUNT IS NOT THE ANSWER. Stage 8 reports how many cards moved, but a count cannot say whether
 * they moved in the right direction. Every group here shows the photograph, the card the scoped
 * search chose, and, where they differ, the card the unscoped search would have chosen. Two rows of
 * artwork side by side settle in a second what a similarity number argues about.
 *
 * SIMILARITY IS A LABEL NOW, NOT A GATE. The failure this stage exists to check was a wrong card
 * scoring HIGHER than the right one (a Japanese Palkia lost to Metang at 0.65 against 0.49), so a
 * number below the old 0.60 gate no longer means "probably wrong" and one above it no longer means
 * "probably right". The numbers are printed, and dimmed, so they inform rather than decide.
 *
 * LOCAL FILE, DELIBERATELY, like 4-review-shapes.mjs: it references the forum photographs on this
 * disk by relative path and embeds none of them. Open it from disk, look, close it. The card art
 * comes from the catalog's own CDN, the same images the app shows.
 *
 *   node scripts/connected-art/9-review-cards.mjs
 *   then open state/connected-art/cards.html
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};

const need = (name) => {
  const p = join(DIR, name);
  if (!existsSync(p)) fail(`${name} not found.`);
  return JSON.parse(readFileSync(p, 'utf8'));
};

const { results: unscoped } = need('resolved.json');
const { results: scoped } = need('rescoped.json');
const catalog = need('scanner-catalog.json');

// `cards` is an OBJECT keyed by card id, so the id is the key and not a field on the value.
const card = (id) => (id === null || id === undefined ? null : catalog.cards?.[String(id)] ?? null);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The catalog's own name for a card, which is fuller than the caption's ("Palkia M LV.70"). */
function label(id) {
  const c = card(id);
  if (!c) return id ? `#${id}` : 'nothing';
  return `${c.name} ${c.number ?? ''} ${c.set_code ? `(${c.set_code})` : ''}`.replace(/\s+/g, ' ').trim();
}

function thumb(id, cls) {
  const c = card(id);
  const src = c?.image;
  if (!src) return `<div class="art ${cls} none">no art</div>`;
  return `<img class="art ${cls}" loading="lazy" src="${esc(src)}" alt="${esc(c.name)}">`;
}

const groups = Object.values(scoped).filter((g) => g.pockets?.length);

/**
 * Walk the pockets in the grid's reading order rather than the detector's, so the strip beside the
 * photograph runs the same way the eye does and the numbers on the boxes line up with it.
 */
function inOrder(g) {
  const flat = (g.order ?? []).flat();
  const seen = new Set(flat);
  const rest = g.pockets.map((_, i) => i).filter((i) => !seen.has(i));
  return [...flat, ...rest].map((i, n) => ({ i, n: n + 1, p: g.pockets[i] })).filter((x) => x.p);
}

let changedCards = 0;
let changedGroups = 0;
let noCaption = 0;

const cards = groups
  .map((g) => {
    const pockets = inOrder(g);
    const flips = pockets.filter((x) => x.p.cardId && x.p.cardId !== x.p.unscopedCardId);
    if (flips.length) changedGroups += 1;
    changedCards += flips.length;
    const scopedOk = g.scopeSize > 0;
    if (!scopedOk) noCaption += 1;

    const boxes = pockets
      .map(({ p, n }) => {
        const b = p.box;
        const l = (b.xmin * 100).toFixed(2);
        const t = (b.ymin * 100).toFixed(2);
        const w = ((b.xmax - b.xmin) * 100).toFixed(2);
        const h = ((b.ymax - b.ymin) * 100).toFixed(2);
        const flip = p.cardId !== p.unscopedCardId ? ' flip' : '';
        return `<div class="bx${flip}" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%"><span>${n}</span></div>`;
      })
      .join('');

    const strip = pockets
      .map(({ p, n }) => {
        const moved = p.cardId !== p.unscopedCardId;
        const was = moved
          ? `<div class="was">
               ${thumb(p.unscopedCardId, 'small')}
               <div class="wastext"><span class="k">was</span> ${esc(label(p.unscopedCardId))}
                 <span class="sim">${(p.unscopedSimilarity ?? 0).toFixed(3)}</span></div>
             </div>`
          : '';
        return `<div class="pocket${moved ? ' moved' : ''}">
  <div class="now">
    <div class="n">${n}</div>
    ${thumb(p.cardId, 'big')}
    <div class="nowtext">${esc(label(p.cardId))}
      <span class="sim">${(p.similarity ?? 0).toFixed(3)}</span>
      ${p.scoped ? '' : '<span class="tag warn">unscoped</span>'}
    </div>
  </div>
  ${was}
</div>`;
      })
      .join('');

    const filter = flips.length ? 'changed' : !scopedOk ? 'nocap' : 'same';
    return `<section class="group" data-f="${filter}">
  <div class="shot"><img loading="lazy" src="images/${esc(g.hash)}.jpg" alt="">${boxes}</div>
  <div class="side">
    <h2>${esc(g.caption || '(no caption)')}</h2>
    <div class="meta">
      ${esc(g.section ?? '')} &middot; ${g.grid.rows}&times;${g.grid.cols}
      &middot; ${scopedOk ? `scoped to ${g.scopeSize} anchors` : '<span class="warn">no caption to scope by</span>'}
      ${flips.length ? `&middot; <span class="chg">${flips.length} changed</span>` : ''}
    </div>
    <div class="strip">${strip}</div>
  </div>
</section>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connected art: was and now</title>
<style>
  :root{--bg:#14161a;--panel:#1c1f26;--line:#2b303a;--ink:#e8eaee;--muted:#8b93a1;--accent:#5b8cff;
        --ok:#3fb27f;--warn:#e0a33e;--chg:#c07ae8}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  header{position:sticky;top:0;z-index:5;background:rgba(20,22,26,.94);backdrop-filter:blur(8px);
         border-bottom:1px solid var(--line);padding:14px 20px}
  h1{margin:0 0 6px;font-size:17px;letter-spacing:.2px}
  .sub{color:var(--muted);font-size:13px;max-width:78ch}
  .filters{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}
  .filters button{background:var(--panel);color:var(--ink);border:1px solid var(--line);
    border-radius:999px;padding:5px 12px;font:inherit;font-size:12px;cursor:pointer}
  .filters button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
  main{padding:18px 20px 60px;display:flex;flex-direction:column;gap:16px}
  .group{display:grid;grid-template-columns:minmax(220px,340px) 1fr;gap:16px;
    background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px}
  @media (max-width:800px){.group{grid-template-columns:1fr}}
  .shot{position:relative;line-height:0;background:#0d0f12;border-radius:8px;overflow:hidden;
    align-self:start}
  .shot img{width:100%;height:auto;display:block}
  .bx{position:absolute;border:2px solid var(--accent);border-radius:3px;
      box-shadow:0 0 0 1px rgba(0,0,0,.55) inset}
  .bx.flip{border-color:var(--chg)}
  .bx span{position:absolute;left:-1px;top:-1px;background:var(--accent);color:#fff;
    font:700 11px/1 ui-sans-serif,system-ui;padding:3px 5px;border-radius:3px 0 3px 0}
  .bx.flip span{background:var(--chg)}
  h2{margin:0;font-size:15px}
  .meta{color:var(--muted);font-size:12px;margin:2px 0 10px}
  .chg{color:var(--chg)}
  .warn{color:var(--warn)}
  .strip{display:flex;gap:12px;flex-wrap:wrap}
  .pocket{border:1px solid var(--line);border-radius:10px;padding:8px;width:150px}
  .pocket.moved{border-color:color-mix(in srgb,var(--chg) 55%,transparent)}
  .now{position:relative}
  .n{position:absolute;left:4px;top:4px;z-index:2;background:rgba(0,0,0,.72);color:#fff;
     font:700 11px/1 ui-sans-serif,system-ui;padding:3px 6px;border-radius:5px}
  .art{width:100%;border-radius:6px;display:block;background:#0d0f12}
  .art.none{aspect-ratio:5/7;display:grid;place-items:center;color:var(--muted);font-size:11px}
  .art.small{width:46px;border-radius:4px;flex:none}
  .nowtext{font-size:11.5px;line-height:1.35;margin-top:5px}
  .sim{color:var(--muted);font-variant-numeric:tabular-nums}
  .was{display:flex;gap:7px;align-items:flex-start;margin-top:8px;padding-top:8px;
       border-top:1px dashed var(--line)}
  .wastext{font-size:11px;line-height:1.35;color:var(--muted);text-decoration:line-through;
           text-decoration-color:color-mix(in srgb,var(--muted) 60%,transparent)}
  .wastext .k{text-decoration:none;display:inline-block;color:var(--chg);font-weight:700}
  .was .art{opacity:.55}
  .tag{font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid var(--line);
       color:var(--muted);white-space:nowrap}
  .tag.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}
  .hidden{display:none}
</style></head>
<body>
<header>
  <h1>Connected art: what name scoping changed</h1>
  <div class="sub">
    ${groups.length} groups. The top card in each pocket is what the name-scoped search chose; a
    struck-through card underneath is what the unscoped search would have chosen instead. Similarity
    is printed but decides nothing here: the whole point is that wrong cards sometimes scored higher
    than right ones.
  </div>
  <div class="filters">
    <button data-f="all" aria-pressed="true">All ${groups.length}</button>
    <button data-f="changed" aria-pressed="false">Changed ${changedGroups}</button>
    <button data-f="nocap" aria-pressed="false">No caption ${noCaption}</button>
    <button data-f="same" aria-pressed="false">Unchanged ${groups.length - changedGroups - noCaption}</button>
  </div>
</header>
<main>
${cards}
</main>
<script>
  const buttons = [...document.querySelectorAll('.filters button')];
  const groups = [...document.querySelectorAll('.group')];
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    const f = b.dataset.f;
    groups.forEach((g) => g.classList.toggle('hidden', f !== 'all' && g.dataset.f !== f));
  }));
</script>
</body></html>`;

const out = join(DIR, 'cards.html');
writeFileSync(out, html);

const pockets = groups.flatMap((g) => g.pockets);
console.log(`Wrote ${out}`);
console.log(`  groups        : ${groups.length} (of ${Object.keys(unscoped).length} identified)`);
console.log(`  pockets       : ${pockets.length}`);
console.log(`  changed card  : ${changedCards} across ${changedGroups} groups`);
console.log(`  no caption    : ${noCaption} groups, which cannot be scoped and keep the old risk`);
console.log('\nOpen it from disk. It reads the photographs next to it and embeds none of them.');
