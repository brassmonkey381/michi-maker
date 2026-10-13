/**
 * Candidate pictures for the preset backdrop library, for the owner to pick from.
 *
 *   node scripts/presets/gather-candidates.mjs
 *
 * Writes state/out/preset-candidates.json (every hit, with the provider's download address and
 * credit) and state/out/preset-candidates.html (a contact sheet of the providers' own thumbnails,
 * numbered, one row per group). Nothing is downloaded or hosted here; that is rehost.mjs, which
 * takes the picks. Keys come from .env, the same two the puzzle backdrop finder uses.
 *
 * THE GROUPS (owner, 2026-10-13): textures for sleeves and art backings, and themes for the
 * picture behind the share image. Themes are searched landscape because the share image is
 * 1200x630; textures any shape because a pocket is a portrait card and a backing fills whatever
 * the art is.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, fail, readVars, step } from '../lib/michi.mjs';

export const GROUPS = {
  texture: [
    ['rainbow', 'rainbow holographic texture'],
    ['gold', 'gold foil texture'],
    ['silver', 'silver metal texture'],
    ['marble', 'white marble texture'],
    ['wood', 'wood grain texture'],
    ['leather', 'black leather texture'],
    ['carbon', 'carbon fiber texture'],
    ['glitter', 'glitter sparkle texture'],
    ['rosegold', 'rose gold texture'],
    ['linen', 'linen fabric texture'],
  ],
  theme: [
    ['water', 'water surface ripples'],
    ['fire', 'fire flames dark'],
    ['earth', 'earth soil rock texture'],
    ['light', 'light rays bokeh bright'],
    ['dark', 'dark abstract background'],
    ['city', 'city skyline night'],
    ['forest', 'forest trees misty'],
    ['ocean', 'ocean waves aerial'],
    ['sky', 'blue sky clouds'],
    ['mountain', 'mountain landscape'],
    ['snow', 'snow winter landscape'],
    ['desert', 'desert sand dunes'],
    ['space', 'galaxy stars space'],
    ['sunset', 'sunset sky colors'],
    ['flowers', 'flower field'],
    ['neon', 'neon lights abstract'],
    ['autumn', 'autumn leaves'],
    ['storm', 'lightning storm'],
    ['beach', 'tropical beach'],
    ['blossom', 'cherry blossom'],
  ],
};

const PER = 4; // per provider per group, so a row is eight pictures

const keys = readVars(join(ROOT, '.env'), ['EXPO_PUBLIC_PEXELS_KEY', 'EXPO_PUBLIC_PIXABAY_KEY']);
if (!keys.EXPO_PUBLIC_PEXELS_KEY || !keys.EXPO_PUBLIC_PIXABAY_KEY) fail('provider keys missing from .env');

async function pexels(q, landscape) {
  const res = await fetch(
    `https://api.pexels.com/v1/search?per_page=${PER}${landscape ? '&orientation=landscape' : ''}&query=${encodeURIComponent(q)}`,
    { headers: { Authorization: keys.EXPO_PUBLIC_PEXELS_KEY } },
  );
  if (!res.ok) return [];
  const j = await res.json();
  return (j.photos ?? []).map((p) => ({
    provider: 'pexels', id: String(p.id), thumb: p.src?.medium, download: p.src?.large2x ?? p.src?.original,
    width: p.width, height: p.height, author: p.photographer, authorUrl: p.photographer_url, page: p.url,
  }));
}

async function pixabay(q, landscape) {
  const res = await fetch(
    `https://pixabay.com/api/?per_page=${PER + 1}&safesearch=true${landscape ? '&orientation=horizontal' : ''}`
    + `&min_width=1600&key=${keys.EXPO_PUBLIC_PIXABAY_KEY}&q=${encodeURIComponent(q)}`,
  );
  if (!res.ok) return [];
  const j = await res.json();
  return (j.hits ?? []).slice(0, PER).map((p) => ({
    provider: 'pixabay', id: String(p.id), thumb: p.webformatURL, download: p.largeImageURL,
    width: p.imageWidth, height: p.imageHeight, author: p.user, authorUrl: `https://pixabay.com/users/${p.user}-${p.user_id}/`, page: p.pageURL,
  }));
}

step(1, 'searching both providers');
const out = [];
for (const [kind, list] of Object.entries(GROUPS)) {
  const landscape = kind === 'theme';
  for (const [slug, q] of list) {
    const [a, b] = await Promise.all([pexels(q, landscape), pixabay(q, landscape)]);
    const hits = [];
    for (let i = 0; i < PER; i += 1) {
      if (a[i]) hits.push(a[i]);
      if (b[i]) hits.push(b[i]);
    }
    hits.forEach((h, i) => { h.n = i + 1; });
    out.push({ kind, slug, query: q, hits });
    console.log(`  ${kind}/${slug}: ${a.length} pexels, ${b.length} pixabay`);
  }
}

step(2, 'writing the sheet');
const dir = join(ROOT, 'state', 'out');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'preset-candidates.json'), JSON.stringify(out, null, 2), 'utf8');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rows = out.map((g) => `
  <section>
    <h2>${esc(g.kind)} / <b>${esc(g.slug)}</b> <small>${esc(g.query)}</small></h2>
    <div class="row">${g.hits.map((h) => `
      <figure>
        <img src="${esc(h.thumb)}" loading="lazy" alt="">
        <figcaption><b>${g.slug}-${h.n}</b> ${esc(h.provider)} · ${esc(h.author)} · ${h.width}x${h.height}</figcaption>
      </figure>`).join('')}
    </div>
  </section>`).join('');
writeFileSync(join(dir, 'preset-candidates.html'), `<!doctype html><meta charset="utf-8"><title>Preset candidates</title>
<style>
 body{font:14px system-ui;margin:16px;background:#111;color:#eee}
 h2{font-size:15px;margin:18px 0 6px} h2 small{color:#999;font-weight:normal;margin-left:8px}
 .row{display:grid;grid-template-columns:repeat(8,1fr);gap:6px}
 figure{margin:0} img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:4px;background:#222}
 .texture img{aspect-ratio:1} figcaption{font-size:11px;color:#bbb;margin-top:2px}
</style>
<h1>Preset backdrop candidates</h1>
<p>Reply with one pick per group, as <b>slug-number</b> (for example <b>gold-3</b>), or "skip" to drop a group.</p>
${rows.replace(/<section>\n    <h2>texture/g, '<section class="texture">\n    <h2>texture')}`, 'utf8');
console.log(`  ${join(dir, 'preset-candidates.html')}`);
console.log(`\nOK: ${out.length} group(s), ${out.reduce((n, g) => n + g.hits.length, 0)} candidate(s).`);
