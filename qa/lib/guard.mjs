/**
 * THE AIRLOCK. Installed on every browser context before the first navigation, with no opt-out.
 *
 * Three layers, because each one catches what the others cannot:
 *   1. NETWORK. A request matching an `abort` rule never leaves the machine, and its having matched
 *      is a terminal event for the run. This is what makes "a check accidentally reached Stripe"
 *      impossible rather than unlikely.
 *   2. DOM. `ctx.click` resolves a control's accessible name before clicking and refuses the ones
 *      that move money or destroy an account. A selector drifts; the words on a Pay button do not.
 *   3. SECRETS. Nothing allowlisted from tcgscan.secrets may appear in an init script, a storage
 *      seed or a URL.
 *
 * Layer 1 catches a click we failed to anticipate. Layer 2 catches a request shape we failed to
 * anticipate. Neither is redundant.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertNotLeaked } from './secrets.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(HERE, '..', 'catalog');

export const network = JSON.parse(readFileSync(join(CATALOG, 'network.json'), 'utf8'));
export const noise = JSON.parse(readFileSync(join(CATALOG, 'noise.json'), 'utf8'));

/** Glob to RegExp. Deliberately tiny: `**` is any run of characters, `*` stops at a slash. */
function globToRe(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = escaped.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${body}$`);
}

const COMPILED = network.rules.map((r) => ({ ...r, re: globToRe(r.match) }));
const CLICK_REFUSALS = network.clickRefusals.map((r) => ({ ...r, re: new RegExp(r.pattern, 'i') }));

function matchRule(url, method) {
  for (const rule of COMPILED) {
    if (!rule.re.test(url)) continue;
    if (rule.methods && rule.methods.includes(method)) continue;
    return rule;
  }
  return null;
}

/**
 * ONE URL, MANY ACTIONS. `stripe-checkout` multiplexes: `history` lists receipts you already paid
 * for, `preview_change` quotes an upgrade, and `change_plan` charges the saved card. A URL-shaped
 * rule cannot tell them apart, so michi /purchases — a page whose entire job is to show what you
 * have already bought — voided every run that merely loaded it, and the rig could not audit any
 * billing surface at all.
 *
 * `readOnlyActions` on a rule names the actions that only read. Everything else still trips.
 *
 * FAIL CLOSED, in both directions. A body that is absent, is not JSON, or carries no string
 * `action` is refused, because not knowing what a request does is exactly the case the airlock
 * exists for. Returns the permitted action, or null to abort.
 */
/**
 * What a tripped request was ASKING for, for the event log. A guard that fires and does not say
 * which action it refused sends you reading source to find out; this run cost exactly that.
 * Best-effort and never throws: it only ever annotates a refusal that has already happened.
 */
function actionOf(body) {
  if (typeof body !== 'string' || !body) return null;
  try {
    const a = JSON.parse(body)?.action;
    return typeof a === 'string' ? a : null;
  } catch {
    return null;
  }
}

function readOnlyAction(rule, body) {
  if (!rule.readOnlyActions?.length) return null;
  if (typeof body !== 'string' || !body) return null;
  let action;
  try {
    action = JSON.parse(body)?.action;
  } catch {
    return null;
  }
  return typeof action === 'string' && rule.readOnlyActions.includes(action) ? action : null;
}

/**
 * Is this failed request already-known noise?
 * Returns the entry, the string 'expired' when its waiver has run out, or null.
 */
export function classifyNoise(url, status, app, today) {
  for (const e of noise.entries) {
    // Status 0 is a request FAILURE rather than an HTTP response. A font that 404s and a font whose
    // request fails outright are the same defect seen from two sides, and Playwright reports which
    // one you get depending on cache state, so a noise entry covers both.
    if (e.status !== status && status !== 0) continue;
    if (!url.includes(e.urlIncludes)) continue;
    if (e.app !== 'both' && e.app !== app) continue;
    return e.expires < today ? 'expired' : e;
  }
  return null;
}

/**
 * Install every layer on a context. `onTrip` is called once, with the run already doomed: a guard
 * that fires is exit code 4 regardless of how the rest of the run scores.
 */
export async function install(context, { capabilities = [], onTrip, onNet, app }) {
  const has = (cap) => capabilities.includes(cap);

  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const rule = matchRule(url, method);

    if (!rule) return route.continue();

    if (rule.policy === 'abort') {
      const allowed = readOnlyAction(rule, req.postData());
      if (allowed) {
        onNet?.({ url, method, rule: rule.match, action: allowed });
        return route.continue();
      }
      onTrip?.({ url, method, rule: rule.match, why: rule.why, action: actionOf(req.postData()) });
      return route.abort('blockedbyclient');
    }
    if (rule.policy === 'gated' && !has(rule.capability)) {
      onTrip?.({ url, method, rule: rule.match, why: `${rule.why} (run lacked ${rule.capability})` });
      return route.abort('blockedbyclient');
    }
    if (rule.policy === 'deny') return route.abort('blockedbyclient');
    if (rule.policy === 'observe') onNet?.({ url, method, rule: rule.match });
    return route.continue();
  });

  // Secrets must never appear in a URL, even one the page built itself.
  context.on('request', (req) => {
    try {
      assertNotLeaked(req.url(), `a request URL (${req.method()})`);
    } catch (e) {
      onTrip?.({ url: req.url(), method: req.method(), rule: 'secret-leak', why: e.message });
    }
  });
}

/**
 * Wrap a page with the refusing click. Every suite clicks through this and never through
 * `page.click`, so the refusal cannot be bypassed by a suite that forgets.
 */
export function guardedClick(page, { capabilities = [], onRefuse } = {}) {
  return async function click(selector, { timeout = 10000 } = {}) {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout });
    const name = ((await el.getAttribute('aria-label')) || (await el.innerText().catch(() => '')) || '').trim();
    for (const refusal of CLICK_REFUSALS) {
      if (!refusal.re.test(name)) continue;
      if (refusal.capability && capabilities.includes(refusal.capability)) continue;
      const detail = { name, pattern: refusal.pattern, why: refusal.why };
      onRefuse?.(detail);
      throw new Error(`BLOCKED CLICK: "${name}" matches ${refusal.pattern}. ${refusal.why}`);
    }
    await el.click({ timeout });
    return name;
  };
}

/** Init scripts and storage seeds go through here, so a secret cannot ride into the page. */
export function assertSafePayload(payload, where) {
  assertNotLeaked(typeof payload === 'string' ? payload : JSON.stringify(payload), where);
}

/**
 * THE HOLE THIS CLOSES, and it cost a real trial to find.
 *
 * The network airlock is a Playwright `context.route()` handler, so it only sees traffic a BROWSER
 * makes. A check that runs without a page and calls node's own `fetch` is outside it entirely. On
 * 2026-09-21 a node-only check enumerated every RPC name it found in the deployed bundle and POSTed
 * an empty body to each one as a signed-in user. One of those names was `start_pro_trial`, which
 * takes no required arguments, so it succeeded and permanently burned the test account's only
 * trial: the exact irreversible action the browser-side guard was built to prevent.
 *
 * Every node-side request now goes through the same rule table, and `lint.mjs` refuses a check that
 * calls bare `fetch`. Two layers again, because either alone would have missed this.
 */
export function guardedFetch({ onTrip, capabilities = [] }) {
  return async function fetchGuarded(url, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const rule = matchRule(String(url), method);

    if (rule) {
      // The multiplexed-URL exception, applied identically to node-side traffic. The two layers
      // must agree on what is a read: a rule the browser honours and node does not is a hole.
      const allowed = rule.policy === 'abort' ? readOnlyAction(rule, init.body) : null;
      if (!allowed && (rule.policy === 'abort' || (rule.policy === 'gated' && !capabilities.includes(rule.capability)))) {
        const detail = { url: String(url), method, rule: rule.match, why: rule.why, action: actionOf(init.body), side: 'node' };
        onTrip?.(detail);
        throw new Error(`BLOCKED REQUEST: ${method} ${url} matches ${rule.match}. ${rule.why}`);
      }
      if (rule.policy === 'deny') throw new Error(`denied by policy: ${url}`);
    }

    // An RPC whose name changes a plan, deletes or archives is refused even when no rule names it,
    // because a rule table only covers what somebody thought of. `change_plan` is the sharpest of
    // these: it finalizes an invoice and charges the saved card with no hosted page in front of it.
    if (/\/rpc\/(change_plan|delete_|reclaim_|restore_)/i.test(String(url))) {
      const detail = { url: String(url), method, rule: 'irreversible-rpc-name', why: 'the RPC name matches an irreversible action', side: 'node' };
      onTrip?.(detail);
      throw new Error(`BLOCKED REQUEST: ${url} names an irreversible action.`);
    }

    // Trials are irreversible per account too, but they are a thing the rig is now expected to do:
    // the pro-trial persona exists precisely to burn one on a disposable account. So they are gated
    // on the capability rather than forbidden, and a run without it still cannot reach them.
    if (/\/rpc\/start_[a-z_]*trial/i.test(String(url)) && !capabilities.includes('allow-trial')) {
      const detail = { url: String(url), method, rule: 'trial-rpc-name', why: 'a trial is one per account forever; this run did not carry allow-trial', side: 'node' };
      onTrip?.(detail);
      throw new Error(`BLOCKED REQUEST: ${url} starts a trial and this run lacks allow-trial.`);
    }

    return fetch(url, init);
  };
}
