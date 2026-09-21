/**
 * Browser plumbing and the `ctx` object every check receives.
 *
 * `ctx` is deliberately small. A check gets: goto, assert, text helpers, the guarded click, the
 * network record, and a screenshot. It does NOT get the raw page's click, because that would route
 * around the DOM airlock, and it does not get a database handle, because phase 1 writes nothing.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { baseUrl, VIEWPORTS, looksLikeLoginWall } from './targets.mjs';
import { install, guardedClick, guardedFetch, classifyNoise } from './guard.mjs';
import { sessionSeed } from './personas.mjs';
import { assertSafePayload } from './guard.mjs';

/** Thrown when a check could not be measured. Becomes VOID, never FAIL. */
export class Unmeasurable extends Error {}

export async function launch() {
  return chromium.launch({ channel: 'msedge', headless: true });
}

export async function makeContext(browser, { persona, resolved, app, target, viewport, capabilities, ledger, today }) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport] || VIEWPORTS.laptop,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: false,
  });

  let tripped = false;
  await install(context, {
    capabilities,
    app,
    onTrip: (detail) => {
      if (tripped) return;
      tripped = true;
      ledger.tripGuard({ persona, app, target, ...detail });
    },
    onNet: (entry) => ledger.net({ persona, app, ...entry }),
  });

  if (resolved.kind === 'signed-in') {
    const seed = sessionSeed(resolved.session);
    assertSafePayload(seed.key, 'a localStorage seed key');
    await context.addInitScript(
      ({ key, value }) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* private mode; the tier check will catch it */
        }
      },
      seed,
    );
  }

  return context;
}

/**
 * The context for a check that needs no browser: the CDN manifest sweep is a set of HTTP reads and
 * opening a page for each one would cost minutes and prove nothing extra. Same assert surface, so a
 * check does not know or care which one it got.
 */
export function makeNodeCtx({ persona, app, target, resolved, capabilities = [], ledger }) {
  const assertions = [];
  return {
    /**
     * THE ONLY WAY A CHECK MAY MAKE A REQUEST. Node's global `fetch` is outside Playwright's route
     * handler, so a node-only check that calls it is outside the airlock. `lint.mjs` refuses a check
     * whose body mentions bare `fetch(`.
     */
    fetch: guardedFetch({
      capabilities,
      onTrip: (d) => ledger?.tripGuard({ persona, app, target, ...d }),
    }),
    app,
    target,
    persona,
    tier: resolved?.tier ?? null,
    uid: resolved?.session?.user?.id ?? null,
    /**
     * The persona's own access token. A REST probe run as `anon` cannot tell "this function does
     * not exist" from "this function is revoked from anon and granted to authenticated", and most
     * of the security-definer RPCs are exactly the second case.
     */
    token: resolved?.session?.access_token ?? null,
    assert(ok, detail) {
      assertions.push({ ok: Boolean(ok), detail });
      return Boolean(ok);
    },
    assertions: () => assertions,
    Unmeasurable,
  };
}

export function makeCtx({ page, app, target, persona, resolved, capabilities, ledger, runDir, today }) {
  const failedRequests = [];
  const consoleErrors = [];

  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText || '';
    // A request still in flight when the page navigates aborts, every time, in every browser. It is
    // not a defect and reporting it buries the ones that are.
    if (why.includes('ERR_ABORTED')) return;
    failedRequests.push({ url: r.url(), status: 0, failure: why });
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    // Keep the response body. A failure nobody can reproduce on demand is only diagnosable from
    // what was captured at the time: the 400s seen on 2026-09-21 were transient and left nothing
    // behind but a status code, which is not enough to say whether they mattered.
    const row = { url: r.url(), status: r.status(), body: null, method: r.request().method() };
    failedRequests.push(row);
    r.text().then((t) => { row.body = t.slice(0, 300); }).catch(() => {});
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 400)}`));

  const assertions = [];
  const click = guardedClick(page, {
    capabilities,
    onRefuse: (d) => ledger.note('click-refused', { persona, app, ...d }),
  });

  return {
    app,
    target,
    persona,
    tier: resolved.tier,
    /** The signed-in user id, which several storage keys are namespaced by. Null for a guest. */
    uid: resolved.session?.user?.id ?? null,
    page,
    capabilities,

    base: baseUrl(app, target),

    async goto(path, { waitFor = 'load', settle = 1200 } = {}) {
      const url = path.startsWith('http') ? path : `${this.base}${path}`;
      const res = await page.goto(url, { waitUntil: waitFor === 'load' ? 'load' : 'domcontentloaded', timeout: 45000 }).catch((e) => {
        throw new Unmeasurable(`navigation to ${path} failed: ${e.message}`);
      });
      const html = await page.content().catch(() => '');
      if (looksLikeLoginWall(html)) throw new Unmeasurable(`${url} is behind a Vercel login wall`);
      if (settle) await page.waitForTimeout(settle);
      return res;
    },

    /**
     * Wait until the app has decided what tier this session is, not merely until it painted. Both
     * apps render a signed-out shell first. Best effort: a signed-in run waits for the token to be
     * readable and for one render tick after it.
     */
    async tierSettled({ timeout = 12000 } = {}) {
      if (resolved.kind !== 'signed-in') return;
      await page
        .waitForFunction(
          (key) => {
            try {
              return Boolean(window.localStorage.getItem(key));
            } catch {
              return false;
            }
          },
          `sb-piikwvntldytjejxmcla-auth-token`,
          { timeout },
        )
        .catch(() => {
          throw new Unmeasurable('the seeded session never became readable in the page');
        });
      await page.waitForTimeout(1500);
    },

    text: () => page.innerText('body').catch(() => ''),
    title: () => page.title().catch(() => ''),
    url: () => page.url(),

    async has(needle) {
      const body = await page.innerText('body').catch(() => '');
      return body.includes(needle);
    },

    async count(selector) {
      return page.locator(selector).count().catch(() => 0);
    },

    click,

    /** Every assertion a check makes. The first failure wins; the rest still record. */
    assert(ok, detail) {
      assertions.push({ ok: Boolean(ok), detail });
      return Boolean(ok);
    },

    assertions: () => assertions,

    /** Failed requests that are not already-known noise. */
    unexplainedFailures() {
      const out = [];
      for (const f of failedRequests) {
        const verdict = classifyNoise(f.url, f.status, app, today);
        if (verdict === 'expired') out.push({ ...f, note: 'noise waiver expired' });
        else if (!verdict) out.push(f);
      }
      return out;
    },

    consoleErrors: () => consoleErrors.slice(),

    async shot(name) {
      const dir = join(runDir, 'shots');
      mkdirSync(dir, { recursive: true });
      const file = `${name.replace(/[^a-z0-9.-]+/gi, '-')}.png`;
      await page.screenshot({ path: join(dir, file), fullPage: false }).catch(() => {});
      return file;
    },

    Unmeasurable,
  };
}
