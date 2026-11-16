/**
 * LOCAL BUILDS THAT TALK TO PRODUCTION (TRI-005, triage-studio docs/SESSIONS.md). Our local builds
 * use the production Supabase project, so every scripted browser that loaded one signed a new
 * anonymous guest in on production and wrote analytics rows: 2,356 headless guests by 2026-11-15,
 * which had to be deleted and took past guest counts with them.
 *
 * `guardBrowser(browser)` right after `chromium.launch(...)`: every context and page that browser
 * makes aborts guest sign-up (POST /auth/v1/signup, the only call that mints a user) and every
 * analytics write. Signing in to an existing test account (/auth/v1/token) still works.
 *
 * A run that really needs a guest account on production sets QA_ALLOW_GUEST=1, and its URLs carry
 * utm_medium=qa (memory: qa-walks-marker). Analytics stays blocked either way.
 */
const SIGNUP = '**/auth/v1/signup*';
const ANALYTICS = [
  '**/rest/v1/analytics_*',
  '**/rest/v1/rpc/*analytic*',
  '**/rest/v1/rpc/*track*',
  '**/functions/v1/*capi*',
  '**/functions/v1/*analytics*',
  '**/redditstatic.com/**',
  '**/*.reddit.com/**',
  '**/_vercel/insights/**',
];

export async function guardContext(ctx, { allowGuest = process.env.QA_ALLOW_GUEST === '1' } = {}) {
  const patterns = allowGuest ? ANALYTICS : [SIGNUP, ...ANALYTICS];
  for (const p of patterns) await ctx.route(p, (r) => r.abort());
  return ctx;
}

/** Wraps newContext and newPage so nothing this browser opens can skip the guard. */
export function guardBrowser(browser, opts) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => guardContext(await newContext(...args), opts);
  browser.newPage = async (...args) => {
    const ctx = await browser.newContext(...args);
    const page = await ctx.newPage();
    page.once('close', () => ctx.close().catch(() => {}));
    return page;
  };
  return browser;
}
