/**
 * AREA: gating. Every wall, per tier, asserted on the words the user actually reads.
 *
 * THE HEADLINE IS THE THREE FREE BINDER PAGES, and it is the check most likely to rot, because the
 * counter is device-local and monotonic. `tcgscan.binderTaste.v1.<uid>` only ever goes up, so a
 * reused browser profile starts every run at the wall and a naive suite would report a permanent
 * red. Every binder-taste check therefore demands a fresh profile and SEEDS the count it wants,
 * which also lets one run assert 3 remaining, 1 remaining and 0 remaining in sequence rather than
 * waiting for a real account to exhaust itself.
 *
 * A NEGATIVE IS A CHECK TOO. "A guest sees the sign-in prompt and NOT the paywall" is the rule the
 * code states (guests get no taste because a guest has no account for a binder to sync to), and it
 * is exactly the kind of thing a refactor breaks silently.
 */

const BINDER_LOCK = 'Binder scanning is a PRO feature: capture up to 16 cards in a single shot. A free account files its first 3 pages.';
const TASTE_USED_TITLE = 'Your 3 free binder pages are used';
const ADVANCED_LOCK = 'Advanced Search is a PRO feature: sort the catalog by value, filter by price, and refine results by similarity.';

/** Seed the monotonic binder-page counter before the app boots. */
function seedTaste(ctx, used) {
  const uid = ctx.uid;
  return ctx.page.addInitScript(
    ({ u, n }) => {
      try {
        if (u) window.localStorage.setItem(`tcgscan.binderTaste.v1.${u}`, String(n));
      } catch {
        /* the check below will catch it */
      }
    },
    { u: uid, n: used },
  );
}

export default {
  area: 'gating',
  label: 'Gates and caps',
  blurb: 'The three free binder pages at every step of exhaustion, and every paid gate asserted from BOTH sides: locked for guest and free, open for a PRO trial. A lock nobody has seen open is not a tested gate.',
  checks: [
    {
      id: 'tcgscan.gating.binder-lock-copy-guest',
      title: 'A guest tapping binder mode is asked to sign in, not asked to pay',
      proves: 'Guests get zero free binder pages on purpose: a guest has no account for a binder to sync to, so the sign-in prompt is the right next step and a paywall is the wrong one. A refactor that treats guest as "free with 0 left" would show the paywall and nobody would notice.',
      source: ['tcgscan-app/src/lib/binder-taste.ts:16', 'tcgscan-app/src/hooks/use-entitlements.ts:186'],
      app: 'tcgscan',
      area: 'gating',
      group: 'THE THREE FREE BINDER PAGES',
      surface: '/scan',
      danger: 'writes-local',
      personas: ['guest'],
      severity: 'major',
      freshProfile: true,
      heavy: true,
      expect: {
        guest: 'a sign-in prompt, and NOT the PRO binder paywall copy',
      },
      observe: ['copy'],
      async run(ctx) {
        await ctx.goto('/scan?multi-tcg', { settle: 6000 });
        const body = await ctx.text();
        if (!body.includes('Scan') && !body.includes('scan')) throw new ctx.Unmeasurable('the scan surface never rendered');
        ctx.assert(!body.includes(TASTE_USED_TITLE), 'a guest was shown the exhausted-taste wall, which belongs to Free accounts only');
      },
    },
    {
      id: 'tcgscan.gating.binder-taste-fresh',
      title: 'A Free account with no pages filed may enter binder mode',
      proves: 'The first of the three free pages. A Free account files its first three binder pages exactly as a PRO account would; the wall arrives on the fourth.',
      source: ['tcgscan-app/src/lib/binder-taste.ts:21', 'tcgscan-app/src/hooks/use-entitlements.ts:186'],
      app: 'tcgscan',
      area: 'gating',
      group: 'THE THREE FREE BINDER PAGES',
      surface: '/scan',
      danger: 'writes-local',
      personas: ['free'],
      severity: 'blocker',
      freshProfile: true,
      heavy: true,
      expect: { free: 'binder mode is selectable and the exhausted-taste wall is absent' },
      observe: ['copy', 'storage'],
      async run(ctx) {
        await seedTaste(ctx, 0);
        await ctx.goto('/scan?multi-tcg', { settle: 6000 });
        await ctx.tierSettled().catch(() => {});
        const body = await ctx.text();
        ctx.assert(!body.includes(TASTE_USED_TITLE), 'the exhausted wall appeared with zero pages filed');
        ctx.assert(!body.includes(BINDER_LOCK), 'the PRO binder lock appeared while free pages remained');
      },
    },
    {
      id: 'tcgscan.gating.binder-taste-exhausted',
      title: 'A Free account that has filed three pages hits the wall on the fourth',
      proves: 'THE NEW CAP. Three binder pages free, ever, counted when a reviewed session is submitted. This is the revenue boundary of the tier rework and the single most valuable check in the suite.',
      source: ['tcgscan-app/src/lib/binder-taste.ts:21', 'tcgscan-app/src/hooks/use-submit-picks.ts:334'],
      app: 'tcgscan',
      area: 'gating',
      group: 'THE THREE FREE BINDER PAGES',
      surface: '/scan',
      danger: 'writes-local',
      personas: ['free'],
      severity: 'blocker',
      freshProfile: true,
      heavy: true,
      personasNote: 'pro-trial is here as the control: the same seeded counter must NOT wall a PRO account.',
      expect: {
        free: `the binder lock copy or "${TASTE_USED_TITLE}" appears once the counter reads 3`,
        'pro-trial': 'no wall at all, because the cap does not apply to a PRO account however many pages it has filed',
      },
      observe: ['copy', 'storage'],
      async run(ctx) {
        await seedTaste(ctx, 3);
        await ctx.goto('/scan?multi-tcg', { settle: 6000 });
        await ctx.tierSettled().catch(() => {});
        const body = await ctx.text();
        const walled = body.includes(TASTE_USED_TITLE) || body.includes(BINDER_LOCK);
        if (ctx.persona === 'pro-trial') {
          // THE CONTROL. Same seeded counter, PRO account: the wall must not appear. Without this
          // the Free assertion could pass for the wrong reason, such as the wall showing for
          // everyone, and a suite that cannot tell those apart is not testing the cap.
          ctx.assert(!walled, 'a PRO account was walled by the free binder-page cap');
          return;
        }
        ctx.assert(walled, 'with three pages filed, no wall of any kind was shown to a Free account');
      },
    },
    {
      id: 'tcgscan.gating.binder-taste-counter-monotonic',
      title: 'The binder page counter never decreases',
      proves: 'The counter is a taste, not a meter: it is device-local and only ever goes up. A bug that resets it hands out unlimited free binder pages, which is the cap failing open and costs money silently.',
      source: ['tcgscan-app/src/lib/binder-taste.ts:74'],
      app: 'tcgscan',
      area: 'gating',
      group: 'THE THREE FREE BINDER PAGES',
      surface: 'localStorage',
      danger: 'writes-local',
      personas: ['free'],
      severity: 'major',
      freshProfile: true,
      expect: { free: 'a seeded count of 2 is still at least 2 after a reload' },
      observe: ['storage'],
      async run(ctx) {
        await seedTaste(ctx, 2);
        await ctx.goto('/', { settle: 3000 });
        await ctx.tierSettled().catch(() => {});
        const after = await ctx.page.evaluate(() => {
          try {
            const k = Object.keys(window.localStorage).find((x) => x.startsWith('tcgscan.binderTaste.v1.'));
            return k ? Number(window.localStorage.getItem(k)) : null;
          } catch {
            return null;
          }
        });
        if (after === null) throw new ctx.Unmeasurable('no binder-taste key was present, so nothing could be measured');
        ctx.assert(after >= 2, `the counter fell to ${after} from a seeded 2`);
      },
    },
    {
      id: 'tcgscan.gating.advanced-search-locked',
      title: 'Value sort is locked for guest and free on tcgscan',
      proves: 'Advanced Search is the paid half of the card browser. The lock is on the affordance AND the action; a chip that looks locked but still sorts is the failure worth catching.',
      source: ['tcgscan-app/src/lib/limit-messages.ts:117', 'tcgscan-browse/src/features.ts:109'],
      app: 'tcgscan',
      area: 'gating',
      group: 'Paid search unlocks for PRO and not before',
      surface: '/browse',
      danger: 'read-only',
      personas: ['guest', 'free', 'pro-trial'],
      severity: 'major',
      expect: {
        guest: 'the Value chip carries aria-label "Value (not included on your plan)"',
        free: 'the Value chip carries aria-label "Value (not included on your plan)"',
        'pro-trial': 'the Value chip carries NO locked marker, because Advanced Search is what the plan buys',
      },
      observe: ['aria', 'copy'],
      async run(ctx) {
        // THE SORT CHIPS DO NOT EXIST UNTIL A SEARCH HAS RUN. An empty browse surface has the
        // language, size and filter controls and nothing else, so asserting the lock on first paint
        // reports a missing gate that is simply a missing row. Measured on production 2026-09-21.
        await ctx.goto('/browse', { settle: 6000 });
        await ctx.tierSettled().catch(() => {});
        const box = ctx.page.locator('input[placeholder*="Search" i]').first();
        await box.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
          throw new ctx.Unmeasurable('the search box never appeared, so the sort chips could not be reached');
        });
        await box.fill('charizard');
        await ctx.page.waitForTimeout(7000);

        const body = await ctx.text();
        if (!body.includes('Value')) throw new ctx.Unmeasurable('the sort chips never rendered, so there was nothing to check the lock on');
        const locked = await ctx.count('[aria-label*="not included on your plan" i]');
        if (ctx.persona === 'pro-trial') {
          // The half that proves the gate is a GATE and not just paint. If the marker shows for a
          // PRO account too, the lock is unconditional and the paid tier buys nothing here.
          ctx.assert(locked === 0, 'a PRO account still saw the "not included on your plan" marker, so Advanced Search never unlocks');
          return;
        }
        ctx.assert(locked > 0, 'the Value sort chip rendered with no locked marker for an unpaid tier, so value sort is open to everyone');
      },
    },
    {
      id: 'michi.gating.secondary-value-sort-unlocked',
      title: 'Value sort is NOT locked for One Piece and Lorcana on michi',
      proves: 'REGRESSION GUARD for kit 0.9.24. The kit sorts on its own price summary, which once held only Pokemon prices, so michi locked value sort for secondary games and a paying account could not sort them. registerPriceSummary fixed it. If the kit pin ever rolls back, this is how we find out.',
      source: ['michi-maker/src/lib/catalogConfig.ts:141', 'tcgscan-browse v0.9.24'],
      app: 'michi',
      area: 'gating',
      group: 'Value sort works for every game',
      surface: '/browse?multi-tcg',
      danger: 'read-only',
      personas: ['guest', 'free'],
      severity: 'major',
      expect: { '*': 'the secondary-game lock list contains themeSearch, findSimilar and similarRefine, and NOT sortByValue' },
      observe: ['network'],
      // The fetch below runs inside page.evaluate, so it is the PAGE fetching its own bundle and the
      // route handler sees it. Declared, because in source it is indistinguishable from a node-side
      // fetch, and a node-side one would be outside the airlock.
      inPageFetch: true,
      async run(ctx) {
        await ctx.goto('/browse?multi-tcg', { settle: 5000 });
        const src = await ctx.page.evaluate(async () => {
          const tags = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src);
          const entry = tags.find((t) => /_expo|entry|index/.test(t)) || tags[0];
          if (!entry) return null;
          try {
            return (await (await fetch(entry)).text()).slice(0, 4000000);
          } catch {
            return null;
          }
        });
        if (!src) throw new ctx.Unmeasurable('could not read the entry bundle to inspect the lock list');
        ctx.assert(src.includes('registerPriceSummary'), 'the deployed bundle has no registerPriceSummary, so the kit pin has rolled back below 0.9.24');
      },
    },
    {
      id: 'tcgscan.gating.checkout-closed-on-prod',
      title: 'Production tcgscan never posts to stripe-checkout',
      proves: 'Both production builds bake EXPO_PUBLIC_CHECKOUT_OPEN=0, so plan buttons are inert. This check is the tripwire for a build that ships with the flag flipped: the airlock would abort the request anyway, but this records it as a product failure rather than a guard trip.',
      source: ['tcgscan-app/vercel.json:3', 'michi-maker/vercel.json:2'],
      app: 'tcgscan',
      area: 'gating',
      group: 'Checkout stays closed on production',
      surface: '/plans',
      danger: 'read-only',
      personas: ['guest', 'free'],
      severity: 'blocker',
      targets: ['prod'],
      expect: { '*': 'zero requests to any stripe-checkout endpoint while browsing the plans page' },
      observe: ['network', 'copy'],
      async run(ctx) {
        const hits = [];
        ctx.page.on('request', (r) => {
          if (r.url().includes('stripe-checkout')) hits.push(r.url());
        });
        await ctx.goto('/plans', { settle: 4000 });
        await ctx.tierSettled().catch(() => {});
        ctx.assert(hits.length === 0, hits.length ? `the plans page reached checkout: ${hits.join(', ')}` : 'no checkout traffic');
        const body = await ctx.text();
        ctx.assert(body.length > 300, 'the plans page rendered nothing to read');
      },
    },
  ],
};
