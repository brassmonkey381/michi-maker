/**
 * MIC-069 referral gap B (owner, 2026-11-26): a referral counts only for a NEW account, one made
 * after its owner first opened the inviter's link. During the holiday, people who trialled before
 * can trial again, so two existing accounts could otherwise swap links and each earn a print.
 *
 * Pure (no imports): stripe-checkout uses it, src/data/referralRule.test.ts proves it.
 *   - never your own code;
 *   - the browser must say when the link was first opened (no time: no referral);
 *   - that time must be believable: not in the future, not older than 90 days;
 *   - the account must be created at or after that open (30 minutes of slack, for a guest session
 *     made the moment the link page loads).
 * A "no" only means no referral is recorded. It never blocks the checkout.
 */
export const REFERRAL_SLACK_MS = 30 * 60 * 1000;
export const REFERRAL_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function referralCounts(p: {
  inviterId: string | null | undefined;
  inviteeId: string;
  accountCreatedMs: number;
  openedAtMs: number | null | undefined;
  nowMs: number;
}): boolean {
  if (!p.inviterId || p.inviterId === p.inviteeId) return false;
  const opened = p.openedAtMs;
  if (typeof opened !== 'number' || !Number.isFinite(opened)) return false;
  if (opened > p.nowMs + 5 * 60 * 1000 || opened < p.nowMs - REFERRAL_MAX_AGE_MS) return false;
  return p.accountCreatedMs >= opened - REFERRAL_SLACK_MS;
}
