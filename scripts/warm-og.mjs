/**
 * Pre-render link-preview images so a shared binder unfurls instantly instead of making the
 * scraper wait several seconds for a cold composite (which it won't — it shows no image instead).
 *
 *   node scripts/warm-og.mjs                 # every public binder
 *   node scripts/warm-og.mjs <binder-id>...  # just these
 *   node scripts/warm-og.mjs --site https://michi-maker-xyz.vercel.app   # a preview deployment
 *
 * WHEN TO RUN IT. The app already warms a binder when its share sheet opens, so day to day this
 * is not needed. It exists for the one case the app cannot cover: bumping OG_IMAGE_REV in
 * api/_lib.js changes the image URL for EVERY binder at once, so a deploy that touches the
 * renderer leaves every existing share cold until someone re-opens each share sheet. Run this
 * straight after `npm run deploy` when the revision changed.
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY from the environment
 * (loads .env / .env.local if present) only to LIST the public binders; the warming itself is a
 * plain GET against the deployed site.
 */
import { readFileSync } from 'node:fs';

const CONCURRENCY = 3; // each warm can rasterise for seconds; don't stampede the functions

function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch {
      /* file optional */
    }
  }
}

async function publicBinderIds() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY not set');
  const res = await fetch(`${url}/rest/v1/binders?is_public=eq.true&select=id,title&order=updated_at.desc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`listing public binders failed: ${res.status}`);
  return res.json();
}

async function warm(site, binder) {
  const started = Date.now();
  try {
    const res = await fetch(`${site}/api/og-warm?id=${encodeURIComponent(binder.id)}`);
    const body = await res.json().catch(() => ({}));
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const kb = body.bytes ? `${Math.round(body.bytes / 1024)}KB` : '';
    const label = String(binder.title || '').slice(0, 32);
    if (body.warmed) {
      // `cache: HIT` means the CDN already held it and this call cost nothing.
      console.log(`  ok    ${binder.id.slice(0, 8)}  ${kb.padStart(7)}  ${secs}s  ${body.cache || ''}  ${label}`);
      return true;
    }
    console.log(`  FAIL  ${binder.id.slice(0, 8)}  ${body.reason || res.status}  ${label}`);
    return false;
  } catch (e) {
    console.log(`  FAIL  ${binder.id.slice(0, 8)}  ${e.message}`);
    return false;
  }
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const siteAt = args.indexOf('--site');
  const site = (siteAt >= 0 ? args[siteAt + 1] : process.env.EXPO_PUBLIC_APP_URL || 'https://michi-maker.com')
    .replace(/\/$/, '');
  const ids = args.filter((a, i) => !a.startsWith('--') && i !== siteAt + 1);

  const binders = ids.length ? ids.map((id) => ({ id })) : await publicBinderIds();
  console.log(`warming ${binders.length} preview image(s) on ${site}`);

  let ok = 0;
  const queue = [...binders];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        if (await warm(site, next)) ok++;
      }
    }),
  );
  console.log(`\n${ok}/${binders.length} warmed.`);
  process.exit(ok === binders.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
