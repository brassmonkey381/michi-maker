/**
 * When a subscription's PRO access ends, from the subscription alone. Pure (no imports), so the
 * app's node tests can prove the rules (src/data/grantExpiry.test.ts). payments-webhook's
 * upsertSubscriptionGrant uses it; the rules and their history are documented there.
 *
 *  - canceled / incomplete_expired: at ended_at (or canceled_at, or now). A holiday trial the
 *    webhook cancels lands here, so cancelling ends PRO at once (MIC-073).
 *  - incomplete: now (the first payment never went through).
 *  - past_due / unpaid: paid-through (the unpaid term's start), plus the grace only when an
 *    earlier term was paid (never on the first term after a trial).
 *  - set to cancel at period end: exactly at period end.
 *  - otherwise: period end, plus the 3-day grace for paying members; a trial ends at trial end
 *    exactly (a holiday trial: Jan 1).
 */
export const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export interface SubShape {
  status: string;
  trial_end?: number | null;
  ended_at?: number | null;
  canceled_at?: number | null;
  cancel_at_period_end?: boolean | null;
}

export function grantExpiryMs(sub: SubShape, periodStartSec: number | null, periodEndSec: number | null, nowMs: number): number {
  const trialEndSec = typeof sub.trial_end === 'number' ? sub.trial_end : null;
  const inTrial = sub.status === 'trialing';
  const firstTermAfterTrial = trialEndSec !== null && periodStartSec !== null && periodStartSec === trialEndSec;
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    return (sub.ended_at ?? sub.canceled_at ?? Math.floor(nowMs / 1000)) * 1000;
  }
  if (sub.status === 'incomplete') return nowMs;
  if ((sub.status === 'past_due' || sub.status === 'unpaid') && periodStartSec) {
    return periodStartSec * 1000 + (firstTermAfterTrial ? 0 : GRACE_MS);
  }
  if (sub.cancel_at_period_end && periodEndSec) return periodEndSec * 1000;
  if (periodEndSec) return periodEndSec * 1000 + (inTrial ? 0 : GRACE_MS);
  return nowMs;
}
