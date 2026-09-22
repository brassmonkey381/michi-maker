/**
 * Give a subscriber a self-serve yearly <-> monthly switch, WITHOUT letting them switch onto
 * anything that would bill them twice.
 *
 * THE PROBLEM THIS SOLVES. Someone who bought PRO yearly could change their card or cancel, and
 * could not move to monthly. Their only route was cancel-and-rebuy, which forfeits the rest of the
 * term they already paid for. Stripe Checkout cannot offer an interval switch in-session either.
 *
 * READ THIS BEFORE CONCLUDING THE API IS BROKEN. `features.subscription_update.products` is
 * documented as "not returned by default; request it with the `expand` request parameter". It
 * stores perfectly well. A GET without
 *   expand[]=features.subscription_update.products
 * comes back with the field simply ABSENT, which looks exactly like a write that was discarded —
 * and was twice mistaken for one here, the first time badly enough that a working change was
 * reverted and the feature written off as dashboard-only. Every read-back in this file expands it.
 *
 * WHY A DEDICATED CONFIGURATION PER APP FAMILY, rather than just enabling it on the default:
 *   - THE BUNDLE MUST NOT BE SWITCHABLE. The obvious list to tick includes the two-app bundle, and
 *     a customer who legitimately holds michi PRO *and* TCGScan Pro (two subscriptions, allowed by
 *     design) could switch one onto the bundle and pay $74.99 + $49.99 for a ledger row that can
 *     only exist once. The portal bypasses `stripe-checkout`, so none of that function's duplicate
 *     guards ever run. Keeping the list in this file makes "the bundle is not switchable" a
 *     reviewable fact rather than a dashboard checkbox somebody might untick later.
 *   - ONE FAMILY PER CONFIG. `products` is the list a subscription may move ONTO, so a single
 *     shared list would let a michi subscriber convert their subscription into a TCGScan one — not
 *     a double charge, but a cross-family move that `stripe-checkout` forbids everywhere else (see
 *     `appFamilyOf`, which exists precisely because a bundle customer holds two separate
 *     subscriptions that must never be resolved into each other).
 *   - The default configuration is dashboard-managed, so it is also the one most likely to be
 *     changed by hand without anyone noticing.
 *
 * DRY RUN BY DEFAULT. Without APPLY=1 it resolves everything, prints exactly what it would write,
 * and writes nothing.
 *
 *   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\stripe-portal-config.ps1"
 *   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\stripe-portal-config.ps1" -Apply
 */
const key = process.env.STRIPE_SECRET_KEY;
const APPLY = process.env.APPLY === '1';

if (!key) {
  console.log('FAILED: STRIPE_SECRET_KEY is not set (exit code 2)');
  process.exitCode = 2;
}

async function stripe(method, path, form) {
  const body = form ? form.toString() : undefined;
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
 * One configuration per app family. `switchable` is deliberately ONE product's two intervals and
 * nothing else: not the bundle (it would double-bill a two-app customer), not Founder (a one-time
 * price cannot back a subscription, and a lifetime membership is not a thing to fall off by
 * accident), not VIP (retired — a subscription whose product is absent simply gets no update
 * option, which is the right outcome for a tier we no longer sell).
 */
const FAMILIES = [
  {
    family: 'michi',
    label: 'michi-maker',
    keys: ['michi_pro_monthly', 'michi_pro_yearly'],
    terms: 'https://www.michi-maker.com/legal/terms',
    privacy: 'https://www.michi-maker.com/legal/privacy',
    headline: 'Manage your michi-maker membership',
  },
  {
    family: 'tcgscan',
    label: 'TCGScan',
    keys: ['tcgscan_pro_monthly', 'tcgscan_pro_yearly'],
    terms: 'https://www.tcgscan.ai/legal/terms',
    privacy: 'https://www.tcgscan.ai/legal/privacy',
    headline: 'Manage your TCGScan membership',
  },
];

/** Marks a configuration as ours, and which family it serves, so a re-run updates rather than piles up. */
const TAG = 'tcgscan_portal_family';

const money = (p) => `$${(p.unit_amount / 100).toFixed(2)}/${p.recurring.interval}`;

if (!process.exitCode) {
  console.log('');
  console.log(`  key mode: ${/^(sk|rk)_live/.test(key) ? 'LIVE' : 'TEST'}${APPLY ? '        APPLY=1, THIS WILL WRITE' : '        dry run, nothing will be written'}`);
  console.log('');

  console.log('[1/4] Reading the existing portal configurations...');
  const existing = (await stripe('GET', 'billing_portal/configurations', new URLSearchParams({ limit: '20' }))).data;
  for (const c of existing) {
    const mine = c.metadata?.[TAG];
    console.log(`      ${c.id}  default=${String(c.is_default).padEnd(5)} active=${String(c.active).padEnd(5)} ${mine ? `ours (${mine})` : 'not ours'}`);
  }

  console.log('[2/4] Resolving the switchable interval pairs...');
  const plans = [];
  let bad = 0;
  for (const f of FAMILIES) {
    const prices = [];
    for (const k of f.keys) {
      const found = (await stripe('GET', 'prices', new URLSearchParams({ 'lookup_keys[]': k, 'expand[]': 'data.product', limit: '2' }))).data[0];
      if (!found || !found.active) {
        console.log(`      MISSING  ${k}`);
        bad += 1;
        continue;
      }
      if (!found.recurring) {
        console.log(`      SKIPPED  ${k} is not recurring, so it cannot back a subscription`);
        continue;
      }
      prices.push(found);
    }
    if (prices.length < 2) {
      console.log(`      ${f.label}: fewer than two recurring prices, nothing to switch between`);
      bad += 1;
      continue;
    }
    const productId = typeof prices[0].product === 'string' ? prices[0].product : prices[0].product.id;
    if (prices.some((p) => (typeof p.product === 'string' ? p.product : p.product.id) !== productId)) {
      console.log(`      ${f.label}: the two prices sit on different products, which the portal cannot express`);
      bad += 1;
      continue;
    }
    console.log(`      ${f.label.padEnd(12)} ${prices.map(money).join('  <->  ')}   product ${productId}`);
    plans.push({ ...f, productId, prices });
  }

  if (bad || plans.length !== FAMILIES.length) {
    console.log('');
    console.log('FAILED: could not resolve every family cleanly. Nothing was written. (exit code 1)');
    process.exitCode = 1;
  } else {
    console.log('');
    console.log('      Switchable: the two intervals of ONE product per family.');
    console.log('      NOT switchable: the two-app bundle (would double-bill), Founder (one-time), VIP (retired).');
    console.log('');

    if (!APPLY) {
      console.log('[3/4] DRY RUN, nothing written. Re-run with -Apply to create the configurations.');
      console.log('[4/4] Skipped.');
    } else {
      console.log('[3/4] Writing one configuration per family...');
      const ids = {};
      for (const p of plans) {
        const form = new URLSearchParams();
        form.set(`metadata[${TAG}]`, p.family);
        form.set('business_profile[headline]', p.headline);
        form.set('business_profile[terms_of_service_url]', p.terms);
        form.set('business_profile[privacy_policy_url]', p.privacy);

        // Mirrors the account default, feature for feature, so switching a customer onto this
        // configuration changes ONLY what they can do about their plan.
        form.set('features[invoice_history][enabled]', 'true');
        form.set('features[payment_method_update][enabled]', 'true');
        form.set('features[customer_update][enabled]', 'true');
        ['name', 'email', 'address', 'phone'].forEach((a, i) =>
          form.set(`features[customer_update][allowed_updates][${i}]`, a),
        );
        form.set('features[subscription_cancel][enabled]', 'true');
        form.set('features[subscription_cancel][mode]', 'at_period_end');
        form.set('features[subscription_cancel][proration_behavior]', 'none');

        form.set('features[subscription_update][enabled]', 'true');
        form.set('features[subscription_update][default_allowed_updates][0]', 'price');
        // PRICE ONLY. Not `quantity` (these are one-seat plans, so a quantity box is a way to be
        // charged twice by mistake) and not `promotion_code` (there is no promotion, and a box
        // asking for a code nobody has is a support ticket).

        // NO PRORATION, and the anchor left alone. Both intervals are the same PRO tier, so a
        // switch never changes what the customer can do — only when they are next billed. With
        // `none` + `unchanged` they keep the term they already paid for and the new price applies
        // at renewal: no surprise charge, and no forfeiting eleven months of a yearly term to move
        // to monthly. `create_prorations` would hand a yearly-to-monthly switcher an immediate
        // credit note, which is a refund conversation nobody asked for.
        form.set('features[subscription_update][proration_behavior]', 'none');
        form.set('features[subscription_update][billing_cycle_anchor]', 'unchanged');

        // YEARLY -> MONTHLY IS SCHEDULED, NOT IMMEDIATE. `shortening_interval` is Stripe's own
        // name for this exact case ("changing from a yearly to monthly pricing interval"), and it
        // defers the switch to the end of the current period. So a member who paid for a year
        // keeps the whole year and simply starts billing monthly when it ends — which is the thing
        // they were trying to achieve, and strictly better than relying on proration_behavior to
        // avoid a credit note. Monthly -> yearly is not "shortening", so it applies at once.
        form.set('features[subscription_update][schedule_at_period_end][conditions][0][type]', 'shortening_interval');

        // A SWITCH DURING A TRIAL MUST NOT END THE TRIAL. The default config carries
        // `end_trial`, which would charge a trialling member the moment they picked an interval —
        // the same defect that made buying the bundle mid-trial destroy the remaining free days.
        form.set('features[subscription_update][trial_update_behavior]', 'continue_trial');

        form.set('features[subscription_update][products][0][product]', p.productId);
        p.prices.forEach((pr, i) =>
          form.set(`features[subscription_update][products][0][prices][${i}]`, pr.id),
        );

        const mine = existing.find((c) => c.metadata?.[TAG] === p.family && c.active);
        const cfg = mine
          ? await stripe('POST', `billing_portal/configurations/${mine.id}`, form)
          : await stripe('POST', 'billing_portal/configurations', form);
        ids[p.family] = cfg.id;
        console.log(`      ${mine ? 'updated' : 'created'}  ${cfg.id}  ${p.label}`);
      }

      // ── 4. READ IT BACK, AND CHECK THE FIELD THAT WAS SILENTLY DROPPED LAST TIME ─────────────
      //
      // A 200 from Stripe means the request was accepted, not that the list a customer will see is
      // the list we sent — an earlier attempt at this asserted only `subscription_update.enabled`
      // and reported success without ever looking at the products. The `expand` above is
      // load-bearing: without it the field is absent and this check fails on a correct write.
      console.log('[4/4] Reading back (with products EXPANDED) and verifying what was stored...');
      let wrong = 0;
      for (const p of plans) {
        const after = await stripe(
          'GET',
          `billing_portal/configurations/${ids[p.family]}`,
          new URLSearchParams({ 'expand[]': 'features.subscription_update.products' }),
        );
        const su = after.features?.subscription_update;
        const got = su?.products;
        if (!su?.enabled) {
          console.log(`      FAILED  ${p.label}: subscription_update is not enabled`);
          wrong += 1;
          continue;
        }
        if (!Array.isArray(got) || got.length !== 1) {
          console.log(`      FAILED  ${p.label}: expected exactly 1 switchable product, got ${got === undefined ? '(field absent)' : got?.length}`);
          wrong += 1;
          continue;
        }
        const wantPrices = new Set(p.prices.map((x) => x.id));
        const gotPrices = new Set(got[0].prices ?? []);
        const same =
          got[0].product === p.productId &&
          wantPrices.size === gotPrices.size &&
          [...wantPrices].every((x) => gotPrices.has(x));
        if (!same) {
          console.log(`      FAILED  ${p.label}: stored list does not match what was sent`);
          console.log(`              sent  product=${p.productId} prices=${[...wantPrices].join(',')}`);
          console.log(`              got   product=${got[0].product} prices=${[...gotPrices].join(',')}`);
          wrong += 1;
          continue;
        }
        console.log(`      ok      ${p.label.padEnd(12)} ${ids[p.family]}  trial_update=${su.trial_update_behavior}  proration=${su.proration_behavior}  scheduled=${(su.schedule_at_period_end?.conditions ?? []).map((c) => c.type).join(',') || 'never'}`);
      }

      console.log('');
      if (wrong) {
        console.log(`FAILED: ${wrong} configuration(s) did not store what they were sent. Do NOT wire these up. (exit code 1)`);
        process.exitCode = 1;
      } else {
        console.log('DONE. Both configurations verified. Wire them into stripe-checkout:');
        console.log('');
        for (const p of plans) console.log(`    ${p.family.padEnd(8)} ${ids[p.family]}`);
        console.log('');
        console.log('  They do NOTHING until the portal session names one, so nothing changes for a');
        console.log('  customer until stripe-checkout is deployed with these ids.');
      }
    }
  }
  console.log('');
}
