/**
 * Does the live webhook endpoint actually SEND the events our handler is written to receive?
 *
 * THE GAP THIS CLOSES, and it was live for two months. `payments-webhook` grew a
 * `charge.refunded` case (index.ts:404) whose whole job is to end a refunded Founder's lifetime
 * membership and free its seat of the 100. The Stripe endpoint was never subscribed to that event,
 * so the case had never once executed in production: a refunded Founder kept PRO forever and kept
 * consuming a seat. Nothing surfaced it, because an unsubscribed event is not an error anywhere —
 * Stripe simply never calls, and the handler simply never runs.
 *
 * The only record of what the endpoint was subscribed to lived in a checked-off line in
 * docs/GO-LIVE-BILLING.md saying "exactly the four the handler switches on". The handler had five.
 * A doc cannot notice that it has gone stale; this script asks Stripe.
 *
 * WHY ADD AND NEVER REMOVE. An extra subscribed event costs nothing — the handler's `default:`
 * case ignores it and still answers 200 (index.ts:433), so Stripe sees a healthy endpoint. A
 * MISSING event is silent data loss. So the run adds what is absent and only REPORTS what is
 * extra, because an event we no longer parse may still be one somebody is reading in the logs.
 *
 * DRY RUN BY DEFAULT. Without APPLY=1 it prints the comparison and writes nothing.
 *
 *   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\stripe-webhook-events.ps1"
 *   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\stripe-webhook-events.ps1" -Apply
 */
const key = process.env.STRIPE_SECRET_KEY;
const APPLY = process.env.APPLY === '1';

if (!key) {
  console.log('FAILED: STRIPE_SECRET_KEY is not set (exit code 2)');
  process.exitCode = 2;
}

async function stripe(method, path, params) {
  const body = params ? params.toString() : undefined;
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json?.error?.message ?? ''}`);
  return json;
}

/**
 * EVERY `case` IN payments-webhook's SWITCH, and nothing else. Keep this list and that switch in
 * step: an entry here that the handler does not parse is harmless noise, but a case there that is
 * missing here is exactly the failure this script exists to catch. Line numbers are where each one
 * is handled, so a reviewer can check the pairing rather than trust it.
 */
const HANDLED = [
  { event: 'checkout.session.completed', at: 'index.ts:314', why: 'grants the tier row (subscription) or the binder PDF (payment)' },
  { event: 'invoice.paid', at: 'index.ts:379', why: 'renewals — pushes expires_at to the new period end' },
  { event: 'customer.subscription.updated', at: 'index.ts:398', why: 'cancel-at-period-end, dunning, and the portal price switch' },
  { event: 'customer.subscription.deleted', at: 'index.ts:399', why: 'the subscription ended' },
  { event: 'charge.refunded', at: 'index.ts:404', why: 'a refunded Founder loses lifetime PRO and frees a seat of the 100' },
];

/** Only this endpoint is touched; anything else in the account is listed and left alone. */
const ENDPOINT_PATH = '/functions/v1/payments-webhook';

if (!process.exitCode) {
  console.log('');
  console.log(`  key mode: ${/^(sk|rk)_live/.test(key) ? 'LIVE' : 'TEST'}${APPLY ? '        APPLY=1, THIS WILL WRITE' : '        dry run, nothing will be written'}`);
  console.log('');

  console.log('[1/3] Reading the webhook endpoints...');
  const all = (await stripe('GET', 'webhook_endpoints', new URLSearchParams({ limit: '20' }))).data;
  const mine = all.filter((e) => e.url.includes(ENDPOINT_PATH));
  for (const e of all.filter((e) => !e.url.includes(ENDPOINT_PATH))) {
    console.log(`      left alone  ${e.id}  ${e.url}`);
  }

  if (mine.length !== 1) {
    console.log('');
    console.log(`FAILED: expected exactly one endpoint containing ${ENDPOINT_PATH}, found ${mine.length}. Nothing was written. (exit code 1)`);
    process.exitCode = 1;
  } else {
    const ep = mine[0];
    const current = ep.enabled_events ?? [];
    console.log(`      ${ep.id}  status=${ep.status}  livemode=${ep.livemode}`);
    console.log(`      api_version: ${ep.api_version ?? '(account default — unpinned)'}`);
    console.log('');

    console.log('[2/3] Comparing what Stripe sends against what the handler parses...');
    // A wildcard subscription already delivers everything, so there is nothing to add.
    const wildcard = current.includes('*');
    const missing = wildcard ? [] : HANDLED.filter((h) => !current.includes(h.event));
    const extra = current.filter((c) => c !== '*' && !HANDLED.some((h) => h.event === c));

    for (const h of HANDLED) {
      const on = wildcard || current.includes(h.event);
      console.log(`      ${on ? 'sent    ' : 'MISSING '} ${h.event.padEnd(32)} ${h.at.padEnd(14)} ${h.why}`);
    }
    for (const c of extra) console.log(`      extra    ${c.padEnd(32)} subscribed but the handler ignores it; left in place`);

    console.log('');
    if (!missing.length) {
      console.log('      Every event the handler parses is already being sent. Nothing to do.');
    } else {
      console.log(`      ${missing.length} event(s) the handler parses are NOT being sent: ${missing.map((m) => m.event).join(', ')}`);
      console.log('');

      if (!APPLY) {
        console.log('[3/3] DRY RUN, nothing written. Re-run with -Apply to subscribe them.');
      } else {
        console.log('[3/3] Subscribing...');
        // The API REPLACES enabled_events, so the full desired list goes up: everything already
        // there plus what was missing. Nothing is dropped.
        const desired = [...new Set([...current, ...missing.map((m) => m.event)])];
        const form = new URLSearchParams();
        desired.forEach((e, i) => form.append(`enabled_events[${i}]`, e));
        await stripe('POST', `webhook_endpoints/${ep.id}`, form);

        // READ IT BACK. A 200 means the request was accepted, not that Stripe will now call us —
        // and a read-back that only checks the response is how the portal change looked fine while
        // silently discarding half of what it was given.
        const after = await stripe('GET', `webhook_endpoints/${ep.id}`);
        const now = after.enabled_events ?? [];
        const stillMissing = HANDLED.filter((h) => !now.includes('*') && !now.includes(h.event));
        if (stillMissing.length) {
          console.log(`FAILED: ${stillMissing.map((s) => s.event).join(', ')} did not take. (exit code 1)`);
          process.exitCode = 1;
        } else {
          console.log(`      subscribed (${now.length}): ${now.join(', ')}`);
          console.log('');
          console.log('DONE: every event the handler parses is now delivered, and read back from Stripe.');
        }
      }
    }
  }
  console.log('');
}
