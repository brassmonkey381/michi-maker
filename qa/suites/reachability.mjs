/**
 * AREA: reachability. Every route in both apps renders its own content.
 *
 * MICHI IS NEVER CHECKED BY HTTP STATUS. Its Vercel config has a catch-all rewrite, so every URL on
 * michi-maker.com answers 200 with the SPA shell, including ones that do not exist. A status check
 * there is a green light wired to nothing. The assertion has to be DOM level: did this route render
 * the thing only this route renders.
 *
 * tcgscan is the opposite. It exports per-route HTML, so a 404 there is real and worth asserting,
 * and two routes with no Vercel rewrite (/sealed/:id and /storage/:id) genuinely 404 on a hard load
 * while working fine in-app. A local static server resolves those bracketed filenames and returns
 * 200, which would manufacture a green over a live bug, so those are pinned to the prod target.
 */
import { ROUTES } from '../lib/targets.mjs';

function aliveCheck(alive) {
  return async (ctx) => {
    if (alive.startsWith('text=')) {
      const needle = alive.slice(5);
      const body = await ctx.text();
      return { ok: body.includes(needle), detail: `looked for "${needle}"` };
    }
    // `any=` when more than one landing is correct, such as a route that redirects a cold browser.
    if (alive.startsWith('any=')) {
      const needles = alive.slice(4).split('|');
      const body = await ctx.text();
      return { ok: needles.some((n) => body.includes(n)), detail: `looked for any of ${needles.join(', ')}` };
    }
    if (alive.startsWith('title=')) {
      const needle = alive.slice(6);
      const t = await ctx.title();
      return { ok: t.includes(needle), detail: `title was "${t}", looked for "${needle}"` };
    }
    if (alive.startsWith('url=')) {
      const needle = alive.slice(4);
      return { ok: ctx.url().includes(needle), detail: `final url was ${ctx.url()}, expected it to contain ${needle}` };
    }
    if (alive.startsWith('placeholder=')) {
      const needle = alive.slice(12);
      const n = await ctx.count(`[placeholder*="${needle}"]`);
      return { ok: n > 0, detail: `looked for a placeholder containing "${needle}"` };
    }
    if (alive.startsWith('tab=')) {
      const needle = alive.slice(4);
      const body = await ctx.text();
      return { ok: body.includes(needle), detail: `looked for the ${needle} tab` };
    }
    if (alive === 'xml') {
      const body = await ctx.page.content();
      return { ok: body.includes('<loc>') || body.includes('<urlset'), detail: 'looked for sitemap entries' };
    }
    const body = await ctx.text();
    return { ok: body.trim().length > 200, detail: `body was ${body.trim().length} characters` };
  };
}

const checks = [];

for (const [app, routes] of Object.entries(ROUTES)) {
  for (const route of routes) {
    const slug = route.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
    checks.push({
      id: `${app}.reachability.${slug}`,
      title: `${app} ${route.path} renders`,
      proves: route.note || `${route.path} reaches its own content rather than a shell, a redirect, or somebody else's page.`,
      source: [`${app === 'michi' ? 'michi-maker' : 'tcgscan-app'}/src/app${route.path === '/' ? '/index' : route.path}`],
      app,
      area: 'reachability',
      group: `${app === 'michi' ? 'michi-maker.com' : 'tcgscan.ai'} routes render`,
      surface: route.path,
      danger: 'read-only',
      personas: route.auth === 'signed-in' ? ['free'] : ['guest', 'free'],
      severity: route.path === '/' ? 'blocker' : 'major',
      heavy: Boolean(route.heavy),
      expect: { '*': `the route renders (${route.alive})` },
      observe: ['copy'],
      async run(ctx) {
        await ctx.goto(route.path, { settle: route.heavy ? 5000 : 2000 });
        if (ctx.persona !== 'guest') await ctx.tierSettled().catch(() => {});

        // tcgscan exports per-route HTML, so a hard 404 is real information. michi rewrites
        // everything to the shell, so its status says nothing and is not asserted.
        const body = await ctx.text();
        if (app === 'tcgscan' && body.includes('404') && body.length < 400) {
          ctx.assert(false, `${route.path} returned a 404 page`);
          return;
        }

        const verdict = await aliveCheck(route.alive)(ctx);
        ctx.assert(verdict.ok, `${route.path} did not look alive: ${verdict.detail}`);
      },
    });
  }
}

checks.push({
  id: 'both.reachability.console-and-network-clean',
  title: 'No unexplained console errors or failed requests on the home route',
  proves: 'A page can render correctly and still be quietly broken. This is the catch-all, and it only reports failures that are not on the known-noise list, so it stays worth reading.',
  source: ['michi-maker/qa/catalog/noise.json'],
  app: 'tcgscan',
  area: 'reachability',
  group: 'No unexplained console or network errors',
  surface: '/',
  danger: 'read-only',
  personas: ['guest', 'free'],
  severity: 'minor',
  expect: { '*': 'nothing beyond the allow-listed font 404s and the alternates 400' },
  observe: ['console', 'network'],
  async run(ctx) {
    await ctx.goto('/', { settle: 4000 });
    const failures = ctx.unexplainedFailures();
    const errors = ctx.consoleErrors();
    ctx.assert(
      failures.length === 0,
      failures.length
        ? `unexplained failed requests: ${failures.slice(0, 6).map((f) => `${f.status} ${f.method || 'GET'} ${f.url}${f.body ? ` -> ${f.body.slice(0, 120)}` : ''}`).join(' | ')}`
        : 'clean',
    );
    ctx.assert(errors.length === 0, errors.length ? `console errors: ${errors.slice(0, 4).join(' | ')}` : 'clean');
  },
});

export default {
  area: 'reachability',
  label: 'Routes and site health',
  blurb: 'Every route in both apps renders its own content, with console and network noise measured against a dated allow-list.',
  checks,
};
