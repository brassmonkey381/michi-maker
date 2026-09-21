/**
 * Static checks, before a browser opens. Everything here is a mistake that would otherwise show up
 * as a confusing red an hour into a run, or worse, as a quiet green.
 *
 * THE ID RULE MATTERS MOST. Check ids are the join key for run-to-run diffs, so a duplicate makes
 * two different results overwrite each other and a rename reads as GONE plus NEW, which turns that
 * week's diff into a lie.
 */
const DANGER = ['read-only', 'writes-local', 'writes-user-data', 'writes-ledger', 'money'];
// Three personas, all of them buildable. `pro` and `vip` were removed on 2026-09-21 (owner call):
// a trial grants the same products a paid PRO holds, so every PRO gate resolves identically, and a
// real paid tier cannot be reached without a live charge or the management token.
const PERSONAS = ['guest', 'free', 'pro-trial'];

export function lint(checks) {
  const problems = [];
  const seen = new Set();

  for (const c of checks) {
    const where = c.id || c.title || '(an unnamed check)';

    if (!c.id) problems.push(`${where}: no id`);
    else if (seen.has(c.id)) problems.push(`${c.id}: duplicate id. Ids are the diff join key, so a duplicate silently merges two different results.`);
    else seen.add(c.id);

    if (c.id && !/^(michi|tcgscan|both)\.[a-z-]+\.[a-z0-9-]+$/.test(c.id)) {
      problems.push(`${where}: id must be <app>.<area>.<slug>, lowercase, dots and dashes only`);
    }
    if (!c.title) problems.push(`${where}: no title`);
    if (!c.proves) problems.push(`${where}: no "proves". Every check has to say what it protects, in words a reader at 2am can use.`);
    if (!c.source || ![].concat(c.source).length) problems.push(`${where}: no source citation`);
    if (!DANGER.includes(c.danger)) problems.push(`${where}: danger must be one of ${DANGER.join(', ')} (got ${c.danger})`);
    if (!c.personas?.length) problems.push(`${where}: no personas`);
    for (const p of c.personas || []) if (!PERSONAS.includes(p)) problems.push(`${where}: unknown persona ${p}`);
    if (!c.expect || !Object.keys(c.expect).length) problems.push(`${where}: no expect block, so SPEC.md would have an empty row`);
    if (!c.observe?.length) problems.push(`${where}: no observe list, so a reader cannot judge how much to trust it`);

    const isInvariant = c.kind === 'invariant';
    if (isInvariant && (typeof c.measure !== 'function' || typeof c.invariant !== 'function')) {
      problems.push(`${where}: an invariant needs both measure() and invariant()`);
    }
    if (!isInvariant && typeof c.run !== 'function') problems.push(`${where}: no run()`);

    // A money check without the capability declared would be aborted by the airlock anyway, but
    // catching it here names the real mistake instead of reporting a guard trip.
    if (c.danger === 'money' && !(c.requires || []).includes('allow-money')) {
      problems.push(`${where}: danger 'money' must declare requires: ['allow-money']`);
    }
    // A ledger write from a CHECK still needs an explicit capability. The pro-trial persona writes
    // one too, but that is the persona's declared cost and the write budget already states it.
    if (c.danger === 'writes-ledger' && !(c.requires || []).some((r) => r.startsWith('allow-'))) {
      problems.push(`${where}: a ledger write must declare an allow- capability, because it is irreversible per account`);
    }

    // michi answers 200 for every URL, so an HTTP-status assertion there is a green light wired to
    // nothing. This is a real bug class, caught statically.
    if (c.app === 'michi' && /status|http/i.test(String(c.observe))) {
      problems.push(`${where}: michi rewrites every URL to the SPA shell, so HTTP status proves nothing there. Assert DOM content instead.`);
    }

    // BARE FETCH IS OUTSIDE THE AIRLOCK. Playwright's route handler only sees browser traffic, so a
    // check that calls node's global fetch can reach anything at all. One that enumerated RPC names
    // burned a real PRO trial on 2026-09-21, which is why this is a lint error and not a convention.
    // A fetch INSIDE page.evaluate runs in the page, so the route handler does cover it. That is a
    // real and useful case, but it looks identical to the dangerous one in source, so the author
    // declares which it is rather than the linter guessing.
    const body = String(c.run || c.measure || '');
    const bare = body.replace(/ctx\.fetch\s*\(/g, '').replace(/\w+\.fetch\s*\(/g, '');
    if (/(^|[^.\w])fetch\s*\(/.test(bare) && !c.inPageFetch) {
      problems.push(`${where}: calls bare fetch(), which bypasses the network airlock entirely. Use ctx.fetch(), or set inPageFetch: true if it genuinely runs inside page.evaluate.`);
    }
    if (c.inPageFetch && c.browser === false) {
      problems.push(`${where}: declares inPageFetch but has no browser, so nothing routes its requests.`);
    }
  }

  return problems;
}
