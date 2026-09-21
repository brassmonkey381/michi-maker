/**
 * Where the rig points, and how it knows a page is actually ready.
 *
 * TWO THINGS THAT LOOK THE SAME AND ARE NOT: a page that has painted, and a page whose TIER has
 * settled. Both apps render a signed-out shell first and then re-render once the session and the
 * entitlement rows land. Asserting a gate before the tier settles reads the guest state on a PRO
 * account, which is a false red that wastes an afternoon. `tierSettled` is the wait that stops it.
 */

export const TARGETS = {
  prod: {
    michi: 'https://michi-maker.com',
    tcgscan: 'https://tcgscan.ai',
    label: 'production',
    writes: 'real',
  },
  export: {
    michi: 'http://127.0.0.1:8088',
    tcgscan: 'http://127.0.0.1:8091',
    label: 'local static export',
    writes: 'real',
    note: 'A local export still talks to the one production Supabase project. Local means the BUNDLE is local, never the data.',
  },
};

export const APPS = ['michi', 'tcgscan'];

export const SUPABASE_REF = 'piikwvntldytjejxmcla';
export const SUPABASE_URL = `https://${SUPABASE_REF}.supabase.co`;
export const AUTH_STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;
export const DATA_PROJECT = 'https://bmhjizcmwtmcrstadqto.supabase.co';

export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  laptop: { width: 1440, height: 900 },
  mid: { width: 1024, height: 768 },
  phone: { width: 390, height: 844 },
};

export function baseUrl(app, target) {
  const t = TARGETS[target];
  if (!t) throw new Error(`unknown target ${target}`);
  const base = t[app];
  if (!base) throw new Error(`unknown app ${app}`);
  return base;
}

/**
 * Detect a Vercel login wall. A protected preview answers 200 with its own HTML, so a naive suite
 * reads it as "the site is up" and then fails every content assertion for the wrong reason. Returning
 * VOID instead of FAIL is the difference between "we could not measure" and "the product is broken".
 */
export function looksLikeLoginWall(html) {
  return /Vercel Authentication|_vercel\/sso|Log in to Vercel/i.test(html || '');
}

/**
 * ROUTES, as a table rather than a crawl. A crawl of tcgscan would pull the scanner model down on
 * /scan and roughly 25 MB of catalog on michi's browse, which is not what a reachability sweep is
 * for. Heavy routes are marked so a light sweep can skip them and a full sweep can budget for them.
 *
 * `alive` is the cheapest honest proof the route rendered its own content rather than a shell, a
 * redirect, or somebody else's page.
 */
export const ROUTES = {
  michi: [
    { path: '/welcome', alive: 'text=Michi', auth: 'any', note: 'A cold first visit redirects here from /.' },
    // A FIRST VISIT DOES NOT SEE THE HOME FEED. michi redirects a cold browser to /welcome, so a
    // fresh QA context lands there every time and "Featured Binders" is the wrong thing to look
    // for. Either landing is correct; what would be wrong is neither.
    { path: '/', alive: 'any=Featured Binders|Michi', auth: 'any', note: 'A cold browser redirects to /welcome; a returning one gets the home feed. Both are correct.' },
    { path: '/browse', alive: 'text=Browse All Cards', auth: 'any', heavy: true },
    { path: '/discover', alive: 'placeholder=Search public binders', auth: 'any' },
    { path: '/my-binders', alive: 'text=My Binders', auth: 'any' },
    { path: '/plans', alive: 'text=Build binders free', auth: 'any' },
    { path: '/pricing', alive: 'url=/plans', auth: 'any', note: 'Redirects. The assertion is the final pathname.' },
    { path: '/subscriptions', alive: 'url=/plans', auth: 'any' },
    { path: '/contest', alive: 'text=How it works', auth: 'any' },
    { path: '/contest-binders', alive: 'text=Contest binders', auth: 'any' },
    { path: '/learn', alive: 'title=Michi-Maker', auth: 'any' },
    { path: '/michi-method', alive: 'title=michi', auth: 'any' },
    { path: '/purchases', alive: 'text=Purchases', auth: 'any' },
    { path: '/studio', alive: 'text=Not authorized', auth: 'any', note: 'Non-admin is the expected state. An admin sees the console instead, so this check is scoped to non-admin personas.' },
    { path: '/sitemap.xml', alive: 'xml', auth: 'any', raw: true },
  ],
  tcgscan: [
    { path: '/landing.html', alive: 'raw', auth: 'any', raw: true, note: 'A cold first visit hard-redirects here from /.' },
    { path: '/', alive: 'tab=Home', auth: 'any' },
    { path: '/browse', alive: 'text=Cards', auth: 'any', heavy: true },
    { path: '/browse?shelf=sealed', alive: 'text=Sealed', auth: 'any' },
    { path: '/collection', alive: 'tab=Collection', auth: 'any' },
    { path: '/settings', alive: 'tab=Settings', auth: 'any' },
    { path: '/plans', alive: 'text=PRO', auth: 'any' },
    { path: '/welcome', alive: 'text=One trading card game today', auth: 'any' },
    { path: '/sessions', alive: 'text=Scan sessions', auth: 'signed-in' },
    { path: '/scan', alive: 'tab=Scan', auth: 'any', heavy: true, note: 'Downloads a model. Excluded from the light sweep.' },
  ],
};
