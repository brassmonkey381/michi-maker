/**
 * The suite registry. The console reads this to build its Plan screen, `rig spec` reads it to
 * generate SPEC.md, and `rig lint` reads it to refuse a malformed check before a browser opens.
 *
 * Adding an area is one import and one line. Adding a check is a data edit inside its suite file.
 */
import reachability from './reachability.mjs';
import data from './data.mjs';
import gating from './gating.mjs';
import drift from './drift.mjs';

export const SUITES = [drift, data, gating, reachability];

export const AREAS = SUITES.map((s) => ({
  area: s.area,
  label: s.label,
  blurb: s.blurb,
  count: s.checks.length,
  danger: [...new Set(s.checks.map((c) => c.danger))],
  apps: [...new Set(s.checks.map((c) => c.app))],
  heavy: s.checks.some((c) => c.heavy),
}));

export function allChecks() {
  return SUITES.flatMap((s) => s.checks);
}

/** Select checks for a run. Every filter is an intersection; an empty selection is an error. */
export function select({ areas, apps, personas, target, includeHeavy }) {
  return allChecks().filter((c) => {
    if (areas?.length && !areas.includes(c.area)) return false;
    if (apps?.length && !apps.includes(c.app) && c.app !== 'both') return false;
    if (personas?.length && !c.personas.some((p) => personas.includes(p))) return false;
    if (c.targets && target && !c.targets.includes(target)) return false;
    if (c.heavy && !includeHeavy) return false;
    return true;
  });
}

/**
 * The write budget, summed over a selection and rendered above the Run button.
 * A consequence should be a decision, not a discovery.
 */
export function writeBudget(checks, personas = []) {
  const tally = { 'read-only': 0, 'writes-local': 0, 'writes-user-data': 0, 'writes-ledger': 0, money: 0 };
  for (const c of checks) tally[c.danger] = (tally[c.danger] || 0) + 1;
  const sentences = [];
  if (tally['read-only']) sentences.push(`${tally['read-only']} checks read only and write nothing anywhere.`);
  if (tally['writes-local']) sentences.push(`${tally['writes-local']} checks write browser storage on a disposable profile, which is discarded with the run.`);
  if (tally['writes-user-data']) sentences.push(`${tally['writes-user-data']} checks create rows in the SHARED PRODUCTION project and rely on teardown to remove them.`);
  if (tally['writes-ledger']) sentences.push(`${tally['writes-ledger']} checks write an entitlement or a trial row. THESE ARE IRREVERSIBLE PER ACCOUNT.`);
  if (tally.money) sentences.push(`${tally.money} checks can reach live Stripe. Real money.`);
  // The PERSONAS cost something before a single check runs, and that cost is the one most worth
  // stating plainly: a permanent account row, and a trial that can never be started again.
  let personaWorst = 'read-only';
  if (personas.includes('pro-trial')) {
    sentences.unshift('The PRO trial persona creates ONE new permanent account and burns both apps 3-day trials on it. Those trials can never be started again on that account. It is disposable and prefixed qa-rig-, so this is expected, but it is not reversible.');
    personaWorst = 'writes-ledger';
  }
  if (personas.includes('free')) {
    sentences.unshift('The Free persona creates ONE new permanent account, prefixed qa-rig-. The rig cannot delete it; run the sweep separately.');
    if (personaWorst === 'read-only') personaWorst = 'writes-user-data';
  }
  if (personas.includes('guest')) {
    sentences.push('Each fresh guest context adds one anonymous auth row that nothing sweeps today.');
  }

  const rank = ['read-only', 'writes-local', 'writes-user-data', 'writes-ledger', 'money'];
  const checkWorst = tally.money ? 'money' : tally['writes-ledger'] ? 'writes-ledger' : tally['writes-user-data'] ? 'writes-user-data' : tally['writes-local'] ? 'writes-local' : 'read-only';
  const worst = rank.indexOf(personaWorst) > rank.indexOf(checkWorst) ? personaWorst : checkWorst;
  return { tally, sentences, worst };
}
