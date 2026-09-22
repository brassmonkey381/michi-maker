/**
 * Does the airlock actually refuse?
 *
 * WHY THIS EXISTS. The guard is the one file in this rig whose failure costs real money or a real
 * account, and it had no test. It has already been wrong twice in production use: once when node's
 * own `fetch` turned out to sit outside Playwright's `context.route()` entirely and a check burned
 * a live PRO trial, and once when a URL-shaped rule could not tell michi /purchases asking for its
 * receipts from a button charging a saved card, which voided every run that loaded that page.
 *
 * Both fixes are behavioural, so both are asserted here rather than read back from the source.
 *
 * THE INVARIANT THIS FILE PROTECTS. The browser layer and the node layer must reach the SAME
 * verdict for the same request. A rule one honours and the other does not is not a weaker guard,
 * it is a hole, and it is invisible until something irreversible goes through it. Every case below
 * is therefore run through both layers and their answers compared.
 *
 *   node qa/guard-test.mjs
 */
import { install, guardedFetch } from './lib/guard.mjs';

const CHECKOUT = 'https://piikwvntldytjejxmcla.supabase.co/functions/v1/stripe-checkout';

const failures = [];
const pass = (name, detail = '') => process.stdout.write(`  ok      ${name.padEnd(52)}${detail}\n`);
const fail = (name, detail) => {
  failures.push(`${name}: ${detail}`);
  process.stdout.write(`  FAIL    ${name.padEnd(52)}${detail}\n`);
};

/**
 * Drive the BROWSER layer without a browser. `install` only ever calls `context.route`, so a
 * context is a handler slot; a route is somewhere to record which of continue/abort was chosen.
 * Testing through `install` rather than around it is the point: the handler it registers is the
 * code that actually runs in a run.
 */
async function browserVerdict(url, { method = 'POST', body = null, capabilities = [] } = {}) {
  let handler;
  const context = {
    route: (_pattern, fn) => {
      handler = fn;
    },
    on: () => {},
  };
  let tripped = null;
  await install(context, { capabilities, app: 'michi', onTrip: (d) => (tripped = d) });

  let outcome = null;
  const route = {
    continue: () => {
      outcome = 'continue';
    },
    abort: () => {
      outcome = 'abort';
    },
    request: () => ({ url: () => url, method: () => method, postData: () => body }),
  };
  await handler(route);
  return { blocked: outcome === 'abort', tripped };
}

/**
 * Drive the NODE layer. `guardedFetch` calls real `fetch` when it permits a request, which must
 * never happen in a test: a permitted stripe-checkout body would be a live POST to production.
 * So global fetch is replaced for the duration and its having been called IS the "allowed" signal.
 */
async function nodeVerdict(url, { method = 'POST', body = null, capabilities = [] } = {}) {
  const realFetch = globalThis.fetch;
  let reached = false;
  globalThis.fetch = async () => {
    reached = true;
    return new Response('{}', { status: 200 });
  };
  let tripped = null;
  const f = guardedFetch({ capabilities, onTrip: (d) => (tripped = d) });
  try {
    await f(url, { method, body });
  } catch {
    // a refusal throws; `reached` stays false
  } finally {
    globalThis.fetch = realFetch;
  }
  return { blocked: !reached, tripped };
}

/**
 * One case, asserted against BOTH layers. `expect` is the verdict a run must get; a disagreement
 * between the layers is reported as its own failure even when one of them happens to be right.
 */
async function bothLayers(name, url, opts, expect) {
  const b = await browserVerdict(url, opts);
  const n = await nodeVerdict(url, opts);
  const want = expect === 'blocked';

  if (b.blocked !== n.blocked) {
    return fail(name, `LAYERS DISAGREE: browser ${b.blocked ? 'blocked' : 'allowed'}, node ${n.blocked ? 'blocked' : 'allowed'}`);
  }
  if (b.blocked !== want) return fail(name, `expected ${expect}, both layers ${b.blocked ? 'blocked' : 'allowed'} it`);
  return pass(name, want ? `blocked${b.tripped?.action ? ` (action ${b.tripped.action})` : ''}` : 'allowed');
}

const j = (o) => JSON.stringify(o);

process.stdout.write('\nAirlock\n\n');

process.stdout.write('  The multiplexed checkout URL: only the two read actions may through\n');
await bothLayers('change_plan charges a saved card', CHECKOUT, { body: j({ action: 'change_plan', lookupKey: 'michi_pro_yearly' }) }, 'blocked');
await bothLayers('checkout opens a live Stripe page', CHECKOUT, { body: j({ action: 'checkout', lookupKey: 'michi_pro_yearly' }) }, 'blocked');
await bothLayers('portal opens a live cancel button', CHECKOUT, { body: j({ action: 'portal' }) }, 'blocked');
await bothLayers('history only lists invoices already paid', CHECKOUT, { body: j({ action: 'history' }) }, 'allowed');
await bothLayers('preview_change persists nothing', CHECKOUT, { body: j({ action: 'preview_change', lookupKey: 'michi_pro_yearly' }) }, 'allowed');

process.stdout.write('\n  Fail closed: not knowing what a request does is a refusal\n');
await bothLayers('no body at all', CHECKOUT, { body: null }, 'blocked');
await bothLayers('body is not JSON', CHECKOUT, { body: 'action=history' }, 'blocked');
await bothLayers('body is JSON with no action', CHECKOUT, { body: j({ lookupKey: 'michi_pro_yearly' }) }, 'blocked');
await bothLayers('action is not a string', CHECKOUT, { body: j({ action: ['history'] }) }, 'blocked');
await bothLayers('an action nobody has heard of', CHECKOUT, { body: j({ action: 'refund_everything' }) }, 'blocked');

process.stdout.write('\n  A rule with no readOnlyActions is absolute, whatever the body says\n');
await bothLayers('hosted checkout', 'https://checkout.stripe.com/c/pay/cs_live_abc', { body: j({ action: 'history' }) }, 'blocked');
await bothLayers('the customer portal', 'https://billing.stripe.com/p/session/live_abc', { body: j({ action: 'history' }) }, 'blocked');
await bothLayers('the Stripe API', 'https://api.stripe.com/v1/subscriptions', { body: j({ action: 'history' }) }, 'blocked');
await bothLayers('account deletion', 'https://piikwvntldytjejxmcla.supabase.co/functions/v1/delete-account', { body: j({ action: 'history' }) }, 'blocked');

process.stdout.write('\n  Node side: the RPC-name refusals that a rule table would never have listed\n');
{
  const cases = [
    ['change_plan by name', 'https://piikwvntldytjejxmcla.supabase.co/rest/v1/rpc/change_plan', [], true],
    ['delete_ by name', 'https://piikwvntldytjejxmcla.supabase.co/rest/v1/rpc/delete_account_data', [], true],
    ['a trial without allow-trial', 'https://piikwvntldytjejxmcla.supabase.co/rest/v1/rpc/start_pro_trial', [], true],
    ['a trial WITH allow-trial', 'https://piikwvntldytjejxmcla.supabase.co/rest/v1/rpc/start_pro_trial', ['allow-trial'], false],
    ['the sibling app trial, gated the same way', 'https://piikwvntldytjejxmcla.supabase.co/rest/v1/rpc/start_tcgscan_pro_trial', [], true],
  ];
  for (const [name, url, capabilities, want] of cases) {
    const { blocked } = await nodeVerdict(url, { capabilities, body: j({}) });
    if (blocked !== want) fail(name, `expected ${want ? 'blocked' : 'allowed'}, got ${blocked ? 'blocked' : 'allowed'}`);
    else pass(name, want ? 'blocked' : 'allowed');
  }
}

process.stdout.write('\n  A tripped guard says WHICH action it refused\n');
{
  const { tripped } = await browserVerdict(CHECKOUT, { body: j({ action: 'change_plan' }) });
  if (tripped?.action === 'change_plan') pass('the refusal names the action', 'change_plan');
  else fail('the refusal names the action', `event carried action=${JSON.stringify(tripped?.action)}`);
}

process.stdout.write('\n');
if (failures.length) {
  process.stdout.write(`FAILED: ${failures.length} guard assertion(s) did not hold.\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.stdout.write('\n');
  process.exitCode = 1;
} else {
  process.stdout.write('ok  the airlock refuses everything it must and permits only the two reads.\n\n');
}
