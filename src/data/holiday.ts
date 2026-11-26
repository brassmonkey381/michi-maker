/**
 * MIC-073 THE HOLIDAY TRIAL (owner, 2026-11-25): "a special free trial grant that gives anyone who
 * signs up for a free trial, access until the end of the year", and "cancelling the trial [should]
 * immediately revert the account to free user tier".
 *
 *   - A checkout trial started before HOLIDAY_LAST_START ends at HOLIDAY_TRIAL_END (Jan 1, midnight
 *     Pacific) instead of after 3 days, then charges the plan's price.
 *   - From HOLIDAY_LAST_START on it falls back to the normal 3 days on its own: Stripe Checkout
 *     needs a trial to end at least 48 hours out, so a Jan 1 end stops being possible on Dec 30.
 *   - Who: anyone who never paid for michi PRO or VIP, including people whose old 3-day trial ended
 *     (owner pick A). Someone on a trial right now is left alone (owner pick B). The server decides
 *     (supabase/functions/_shared/holiday.ts); this file is the dates and the words.
 *   - Cancelling during a holiday trial ends PRO at once (payments-webhook cancels it immediately).
 *     That is said at checkout and above "Manage billing", not on the banner (owner review).
 *
 * Pure and dependency-free, so node --test and the edge functions can import it.
 */

/** Jan 1, 2027 at midnight Pacific (PST, UTC-8). */
export const HOLIDAY_TRIAL_END = Date.parse('2027-01-01T08:00:00Z');
/** Dec 30 at midnight Pacific: the last moment a Jan 1 trial end is at least 48 hours away. */
export const HOLIDAY_LAST_START = Date.parse('2026-12-30T08:00:00Z');

/** The trial end for a checkout started now, or null when the holiday offer is over. */
export function holidayTrialEnd(now: number = Date.now()): number | null {
  return now < HOLIDAY_LAST_START ? HOLIDAY_TRIAL_END : null;
}

/** Whether the holiday offer is on (the banner, the button words, the pop-up). */
export function holidayActive(now: number = Date.now()): boolean {
  return holidayTrialEnd(now) !== null;
}

/** The button at every PRO wall while the offer is on (owner: "Try PRO for FREE until Jan 1"). */
export const HOLIDAY_CTA_LABEL = 'Try PRO for FREE until Jan 1';

/**
 * The trial button's words everywhere ("Try PRO for FREE"), with "until Jan 1" while the offer is
 * on. Read once at load: a visit never spans the Dec 30 switch-over in practice, and a reload
 * picks up the plain words.
 */
export const TRIAL_CTA_TEXT = holidayActive() ? HOLIDAY_CTA_LABEL : 'Try PRO for FREE';

/** The plans page banner (owner review: "free until Jan 1", with no cancel line). */
export const HOLIDAY_BANNER = {
  title: 'Holiday gift: PRO free until Jan 1',
  body: 'Start your free trial today and keep PRO through the holidays. After that, $2.99 a month or $24.99 a year.',
} as const;

/** Said at checkout and above "Manage billing" during a holiday trial. */
export const HOLIDAY_CANCEL_NOTE = 'Cancelling during the free trial ends PRO right away.';
