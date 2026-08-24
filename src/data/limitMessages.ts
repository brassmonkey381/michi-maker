/**
 * Cap-limit copy, in one place so every surface (Home, My binders, the editor) words a limit
 * the same way — and, crucially, nudges GUESTS to sign in (the free tier lifts the cap) rather
 * than to a paid upgrade. Signed-in free/pro users get the upgrade wording.
 *
 * Guests are anonymous accounts: their real next step at a cap is a free account, not a plan.
 * See the guest-signin-notes rule — a guest at a gate gets "Sign in", never an upgrade pitch.
 */
import { TIER_LIMITS, type Tier, type TierLimits } from './tiers.ts';

export function binderLimitMessage(tier: Tier, limits: TierLimits): string {
  if (tier === 'guest') {
    const n = limits.binders;
    return `Guests can keep ${n} binder${n === 1 ? '' : 's'}. Sign in (free) to make up to ${TIER_LIMITS.free.binders}.`;
  }
  return `You’ve reached your ${limits.binders}-binder limit. Upgrade for more room.`;
}

export function pageLimitMessage(tier: Tier, limits: TierLimits): string {
  if (tier === 'guest') {
    return `Guests get ${limits.pagesPerBinder} pages per binder. Sign in (free) for ${TIER_LIMITS.free.pagesPerBinder}.`;
  }
  return `You’ve reached the ${limits.pagesPerBinder}-page limit. Upgrade for more.`;
}

/**
 * The button a page-limit toast carries, or null for no button.
 *
 * Guests get null, and that is the same rule as the copy above rather than an oversight: their
 * next step is a free account, not a price table, and signing in is an AuthSheet rather than a
 * route — so their toast keeps the "Sign in (free)" wording and stays the quiet pill. Everyone
 * from free upward gets a real route to the plans page, which is the whole point of the
 * prominent tone: a cap that ends the interaction should hand back a way forward.
 */
export function pageLimitCta(tier: Tier): { label: string; href: '/plans' } | null {
  return tier === 'guest' ? null : { label: 'See plans', href: '/plans' };
}
