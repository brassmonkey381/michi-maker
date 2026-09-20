/**
 * HOW LONG THE FREE PRO TRIAL IS, in days. One number, because it is printed in a dozen places
 * (the button, its small print, every cap gate line, the plans page, the terms) and they have to
 * agree with each other and with what the server grants.
 *
 * The server is the authority: `public.trial_days()` in the app database, which both
 * `start_pro_trial` and `start_tcgscan_pro_trial` read. This constant is the wording. Change one,
 * change the other (owner, 2026-09-20: 14 days became 3, in both apps).
 *
 * Pure and dependency-free so `node --test` files and the pure copy modules can import it.
 */
export const TRIAL_DAYS = 3;

/** "3 days", for a sentence. */
export const TRIAL_DAYS_TEXT = `${TRIAL_DAYS} days`;
/** "3-day", for an adjective. */
export const TRIAL_DAYS_ADJ = `${TRIAL_DAYS}-day`;
