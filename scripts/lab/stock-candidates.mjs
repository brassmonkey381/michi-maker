// Candidate pictures for the seeded pocket, searched through the app's stock-art function as the
// test account (verify_jwt is on). Secrets come from tcgscan.secrets and are never printed.
//   node scripts/lab/stock-candidates.mjs "volcano" "floral" "electricity:illustration"
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad';
const secrets = Object.fromEntries(readFileSync('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const env = Object.fromEntries(readFileSync('C:/Users/Brian/source/repos/tcgscan/michi-maker/.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY || !secrets.MICHI_TEST_EMAIL || !secrets.MICHI_TEST_PASSWORD) { console.log('missing url, key or test login'); process.exit(2); }

const tok = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: secrets.MICHI_TEST_EMAIL, password: secrets.MICHI_TEST_PASSWORD }) }).then((r) => r.json());
if (!tok.access_token) { console.log('sign-in failed:', tok.error_description ?? tok.msg ?? tok.error ?? 'unknown'); process.exit(3); }

const queries = process.argv.slice(2);
const sections = [];
for (const spec of queries) {
  const [q, kind = 'photo'] = spec.split(':');
  const res = await fetch(`${URL_}/functions/v1/stock-art`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ q, kind, per: 24 }) });
  const data = await res.json().catch(() => ({}));
  const hits = (data.hits ?? []).filter((h) => kind === 'illustration' || h.provider === 'pexels');
  console.log(q, 'status', res.status, 'providers', JSON.stringify(data.providers ?? {}), 'pexels hits', hits.length);
  sections.push({ q: kind === 'photo' ? q : `${q} (${kind})`, hits });
}
writeFileSync(`${OUT}/stock-candidates.json`, JSON.stringify(sections, null, 1));

const tile = (h, i) => `<figure><img src="${h.thumbUrl ?? h.previewUrl ?? h.url ?? h.imageUrl}"><figcaption><b>#${i + 1}</b> ${h.author ?? ''}<br><span class="dim">${h.width ?? '?'}x${h.height ?? '?'} · ${h.id ?? ''}</span></figcaption></figure>`;
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:16px;font:14px system-ui;background:#fff;color:#111;width:1180px}
h2{margin:10px 0 6px;font-size:20px} .grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
figure{margin:0} img{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:8px;display:block;background:#eee}
figcaption{padding:4px 2px;line-height:1.3} .dim{color:#777;font-size:12px}
</style>${sections.map((s) => `<h2>"${s.q}" (${s.hits.length}, cropped the way one pocket shows it)</h2><div class="grid">${s.hits.map(tile).join('')}</div>`).join('')}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1212, height: 900 } });
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/stock-candidates.png`, fullPage: true });
await browser.close();
console.log('sheet written');
