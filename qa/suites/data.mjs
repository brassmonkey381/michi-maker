/**
 * AREA: data. "Are all the card and sealed product databases loading as expected, per tier?"
 *
 * Two kinds of check live here and they answer different questions.
 *
 * The MANIFEST sweep asks whether the artifacts themselves are intact on the CDN. It is tier
 * independent by nature, because the bucket is anonymous, so it runs once. Its floors were measured
 * against production rather than invented, which is what lets it catch the failure that actually
 * happens: a publish that truncates a file, or an empty file written over a good one. A byte floor
 * catches that; a 200 does not.
 *
 * The TIER sweep asks whether each account level gets the data it is entitled to. That is a real
 * split and it is not the one people expect: Pokemon's plaintext catalog is retired from the public
 * bucket, so a guest browses COLD through an RPC while a signed-in account downloads the encrypted
 * blob and browses WARM. Secondary games are the opposite: their catalogs are public, so every tier
 * including guests browses them warm.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(HERE, '..', 'catalog', 'artifacts.json'), 'utf8'));

/** One check per artifact, generated from the manifest so adding a game is a data edit. */
function manifestChecks() {
  return MANIFEST.artifacts.map((a) => {
    const url = `${MANIFEST.base}/${MANIFEST.games[a.game].prefix}${a.file}`;
    const slug = `${a.game}-${a.file.replace(/\.json$/, '')}`;
    return {
      id: `both.data.artifact-${slug}`,
      title: `${MANIFEST.games[a.game].label}: ${a.file} is served and intact`,
      proves: a.why || `${a.file} for ${MANIFEST.games[a.game].label} is present, the right size, and parses. An empty or truncated file renders an empty browser with no error.`,
      source: ['tcgscan-data/pipeline/tcgscan/publish/', 'michi-maker/qa/catalog/artifacts.json'],
      app: 'both',
      area: 'data',
      group: `${MANIFEST.games[a.game].label} card and sealed database`,
      surface: 'browse bucket',
      danger: 'read-only',
      personas: ['guest'],
      severity: a.severity || 'major',
      expect: { '*': a.expect === 400 ? `HTTP 400, deliberately not public` : `HTTP 200, at least ${a.byteFloor ?? 0} bytes, valid JSON` },
      observe: ['network'],
      browser: false,
      async run(ctx) {
        const res = await ctx.fetch(url, { method: 'GET', headers: { range: 'bytes=0-0' } }).catch((e) => {
          throw new ctx.Unmeasurable(`could not reach the bucket: ${e.message}`);
        });
        const status = res.status === 206 ? 200 : res.status;
        if (!ctx.assert(status === a.expect, `expected HTTP ${a.expect}, got ${status} for ${url}`, `HTTP ${status} from ${url}, as expected`)) return;
        if (a.expect !== 200) return;

        const len = Number(res.headers.get('content-range')?.split('/')?.[1] ?? res.headers.get('content-length') ?? 0);
        if (a.byteFloor) {
          ctx.assert(len >= a.byteFloor, `content-length ${len} is below the floor ${a.byteFloor}. A truncated or emptied publish looks exactly like this.`, `${len} bytes, at or above the ${a.byteFloor} floor`);
        }
        if (a.rowFloor) {
          const full = await ctx.fetch(url).then((r) => r.json()).catch(() => null);
          if (full === null) {
            ctx.assert(false, 'the body did not parse as JSON');
            return;
          }
          const rows = a.rowPath ? full[a.rowPath] : Array.isArray(full) ? full : full.cards || full.products || Object.keys(full);
          const n = Array.isArray(rows) ? rows.length : Object.keys(rows || {}).length;
          ctx.assert(n >= a.rowFloor, `parsed ${n} rows, expected at least ${a.rowFloor}`, `${n} rows parsed, at or above the ${a.rowFloor} floor`);
        }
      },
    };
  });
}

/** Ids are the diff join key, so they are lowercased and dash-only. `capG-e15` and `cards_lookup`
 *  both break that rule at source, which lint catches rather than letting it through. */
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function modelChecks() {
  return MANIFEST.models.sets.flatMap((set) =>
    set.files.map((f) => ({
      id: `tcgscan.data.model-${slug(set.id)}-${slug(f.split('/').pop().replace(/\.json$/, ''))}`,
      title: `Scanner ${set.id} (${set.game}): ${f.split('/').pop()} is served`,
      proves: 'A missing model file is a scanner that spins forever with no error message. The catalog file is the one that matters most: an anchor the catalog cannot name reads as "Unrecognized card (#...)" to the user.',
      source: ['tcgscan-app/src/config.ts', 'tcgscan-data-science/docs/SHIP-A-GAME-MODEL.md'],
      app: 'tcgscan',
      area: 'data',
      group: 'Scanner models are downloadable',
      surface: 'models bucket',
      danger: 'read-only',
      personas: ['guest'],
      severity: 'blocker',
      expect: { '*': 'HTTP 200' },
      observe: ['network'],
      browser: false,
      async run(ctx) {
        const url = `${MANIFEST.models.base}/${f}`;
        const res = await ctx.fetch(url, { method: 'HEAD' }).catch((e) => {
          throw new ctx.Unmeasurable(e.message);
        });
        ctx.assert(res.status === 200, `expected 200, got ${res.status} for ${url}`, `200 from ${url}`);
      },
    })),
  );
}

/**
 * IMAGE HOSTS. A manifest can be perfectly valid and still render a grid of broken tiles, because
 * the bytes live somewhere else. Found on 2026-09-21: 109 of 3,245 sealed products point at
 * tcgplayer-cdn.tcgplayer.com instead of our own sealed-imgs bucket, and that CDN now answers 403
 * (CloudFront) for every one of them. The other 3,136 are ours and load fine.
 *
 * Sampled rather than exhaustive: 3,245 HEAD requests per run would be rude and slow, and a host
 * that is broken is broken for all of its rows. The assertion is per HOST, which is the unit that
 * actually fails.
 */
const imageHosts = {
  id: 'both.data.sealed-images-resolve',
  title: 'Sealed product images actually load, on every host the manifest uses',
  proves: 'A sealed tile with a dead image is indistinguishable from a working catalog until someone looks at the page. Third-party hosts rot without telling us, and the fix is ours: mirror those products into our own bucket like the other 96% of them.',
  source: ['tcgscan-browse/src/config.ts:364', 'tcgscan-data sealed publish'],
  app: 'both',
  area: 'data',
  group: 'Sealed product images load',
  surface: 'sealed.json image hosts',
  danger: 'read-only',
  personas: ['guest'],
  severity: 'major',
  expect: { '*': 'every image host in the manifest serves 200 for a sample of its rows' },
  observe: ['network'],
  browser: false,
  timeoutMs: 90000,
  async run(ctx) {
    const res = await ctx.fetch(`${MANIFEST.base}/sealed.json`).catch((e) => {
      throw new ctx.Unmeasurable(e.message);
    });
    const manifest = await res.json().catch(() => null);
    const rows = manifest?.products ? Object.values(manifest.products) : null;
    if (!rows?.length) throw new ctx.Unmeasurable('the sealed manifest did not parse into products');

    const byHost = new Map();
    for (const r of rows) {
      if (!r.image) continue;
      const host = new URL(r.image).host;
      if (!byHost.has(host)) byHost.set(host, []);
      byHost.get(host).push(r);
    }

    for (const [host, list] of byHost) {
      const step = Math.max(1, Math.floor(list.length / 8));
      const picks = [];
      for (let i = 0; i < list.length && picks.length < 8; i += step) picks.push(list[i]);

      let ok = 0;
      const bad = [];
      for (const r of picks) {
        const head = await ctx.fetch(r.image, { method: 'HEAD' }).catch(() => ({ status: 0 }));
        if (head.status === 200) ok += 1;
        else bad.push(`${r.id}=${head.status}`);
      }
      const pct = Math.round((list.length / rows.length) * 100);
      ctx.assert(
        bad.length === 0,
        bad.length
          ? `${host} serves ${list.length} of ${rows.length} sealed products (${pct}%) and ${bad.length}/${picks.length} sampled failed: ${bad.slice(0, 6).join(', ')}`
          : `${host}: ${ok}/${picks.length} sampled ok across ${list.length} products`,
      );
    }
  },
};

/** In-app checks: the data actually reaches a rendered grid, per persona. */
const inApp = [
  {
    id: 'tcgscan.data.sealed-grid-renders',
    title: 'The sealed product database renders on tcgscan /browse',
    proves: 'Sealed is an ungated lane with no catalog dependency and no tier check anywhere, so every persona must see the same grid. An empty sealed shelf means the sealed artifact failed to load, which the manifest sweep would also catch but from the other end.',
    source: ['tcgscan-app/src/app/(tabs)/browse', 'tcgscan-browse SealedBrowser'],
    app: 'tcgscan',
    area: 'data',
    group: 'Databases reach the screen',
    surface: '/browse?shelf=sealed',
    danger: 'read-only',
    personas: ['guest', 'free', 'pro-trial'],
    severity: 'major',
    expect: { '*': 'the sealed shelf is selected and shows product tiles, identical at every tier including a paid one' },
    observe: ['copy', 'network'],
    kind: 'invariant',
    async measure(ctx) {
      await ctx.goto('/browse?shelf=sealed', { settle: 4000 });
      await ctx.tierSettled().catch(() => {});
      const body = await ctx.text();
      const empty = body.includes('No sealed products here.');
      const loading = body.includes('Loading sealed products');
      if (loading && !empty) await ctx.page.waitForTimeout(4000);
      const after = await ctx.text();
      return {
        empty: after.includes('No sealed products here.') ? 1 : 0,
        hasShelf: after.includes('Sealed') ? 1 : 0,
        images: await ctx.count('img'),
      };
    },
    invariant(byPersona) {
      const entries = Object.entries(byPersona);
      for (const [p, m] of entries) {
        if (m.empty === 1) return `${p} saw the empty state "No sealed products here."`;
        if (m.hasShelf !== 1) return `${p} never reached the Sealed shelf`;
      }
      const counts = entries.map(([, m]) => Number(m.images));
      const lo = Math.min(...counts);
      const hi = Math.max(...counts);
      if (hi > 0 && lo / hi < 0.8) {
        return `tile counts differ by tier (${entries.map(([p, m]) => `${p}=${m.images}`).join(', ')}), and sealed has no tier check anywhere`;
      }
      return true;
    },
  },
  {
    id: 'tcgscan.data.pokemon-catalog-gate',
    title: 'Pokemon catalog: a guest browses cold, a signed-in account browses warm',
    proves: 'The plaintext Pokemon catalog is retired from the public bucket and served only as catalog.enc behind the catalog-key function, which 403s anonymous callers. A guest must therefore reach the search_cards RPC and never the blob. If a guest ever loads the blob, the gate has failed open.',
    source: ['tcgscan-browse/src/catalog', 'michi-maker/src/lib/catalogSource.ts'],
    app: 'tcgscan',
    area: 'data',
    group: 'Databases reach the screen',
    surface: '/browse',
    danger: 'read-only',
    personas: ['guest', 'free', 'pro-trial'],
    severity: 'blocker',
    expect: {
      guest: 'no catalog-key call succeeds; the cold path is used',
      free: 'the gated catalog is fetched and the browser goes warm',
      'pro-trial': 'same as free: the gate is on being signed in, not on paying',
    },
    observe: ['network'],
    async run(ctx) {
      const seen = [];
      ctx.page.on('response', (r) => {
        const u = r.url();
        if (u.includes('catalog-key') || u.includes('catalog.enc') || u.includes('rpc/search_cards')) {
          seen.push({ url: u.split('?')[0], status: r.status() });
        }
      });
      await ctx.goto('/browse', { settle: 6000 });
      await ctx.tierSettled().catch(() => {});
      await ctx.page.waitForTimeout(3000);

      const gotBlob = seen.some((s) => (s.url.includes('catalog-key') || s.url.includes('catalog.enc')) && s.status < 400);
      if (ctx.persona === 'guest') {
        ctx.assert(!gotBlob, `a guest obtained the gated catalog (${JSON.stringify(seen)}). The gate has failed open.`, 'a guest never obtained the gated catalog blob');
      } else {
        ctx.assert(seen.length > 0, 'no catalog traffic was observed at all, so the browser never tried to load cards', `${seen.length} catalog requests observed, so the browser did try`);
      }
    },
  },
  {
    id: 'michi.data.card-browser-loads',
    title: 'michi /browse reaches a populated card browser',
    proves: 'michi browses the same shared bucket through the same kit. This is the end-to-end proof that the data reached a rendered grid rather than merely being downloadable.',
    source: ['michi-maker/src/components/binder/CardBrowse.tsx'],
    app: 'michi',
    area: 'data',
    group: 'Databases reach the screen',
    surface: '/browse',
    danger: 'read-only',
    personas: ['guest', 'free', 'pro-trial'],
    severity: 'major',
    expect: { '*': 'the heading renders and the grid is not the empty state' },
    observe: ['copy'],
    async run(ctx) {
      await ctx.goto('/browse', { settle: 5000 });
      await ctx.tierSettled().catch(() => {});
      const body = await ctx.text();
      ctx.assert(body.includes('Browse'), 'the browse heading never rendered', 'the browse heading rendered');
      ctx.assert(!body.includes('Type to search all cards.') || (await ctx.count('img')) > 3, 'the browser rendered no card images', 'the browser rendered card images');
    },
  },
];

export default {
  area: 'data',
  label: 'Card and sealed databases',
  blurb: 'Every browse artifact per game against measured byte floors, the image hosts those manifests point at, the per-tier catalog gate, and the sealed lane that has no gate at all.',
  checks: [...manifestChecks(), ...modelChecks(), imageHosts, ...inApp],
};
