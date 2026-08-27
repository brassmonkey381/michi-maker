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
 * Kept artwork is a RETENTION cap, so the wording is "keeping N of M" rather than "you have hit
 * a wall" — the way out is deleting a slice as much as it is a bigger allowance. Lived inline in
 * BinderScreen until the gate toasts were given buttons; it is here now so all three caps word
 * themselves the same way and share one CTA rule.
 */
export function artLimitMessage(tier: Tier, limits: TierLimits): string {
  if (tier === 'guest') {
    return `Guests can keep ${limits.artUploads} artworks. Sign in (free) to keep up to ${TIER_LIMITS.free.artUploads}.`;
  }
  return `You’ve reached your ${limits.artUploads}-artwork limit. Upgrade for more room.`;
}

/**
 * The button a cap toast carries. Every tier gets one: a cap that ends the action the user was
 * mid-way through should hand back a way forward, and which way forward differs by tier.
 *
 * Guests are routed to the auth sheet, NEVER to the price table — the free tier is what lifts
 * their cap, so a plans pitch would be selling to someone who has not signed up yet. That is the
 * same rule the copy above follows, expressed as a button. The label matches the sentence it sits
 * under ("Sign in (free)") rather than inventing a second phrasing for the same action.
 */
export type LimitCta =
  | { kind: 'plans'; label: string }
  | { kind: 'signin'; label: string };

export function limitCta(tier: Tier): LimitCta {
  return tier === 'guest'
    ? { kind: 'signin', label: 'Sign in (free)' }
    : { kind: 'plans', label: 'See plans' };
}

/**
 * The same three caps, phrased as what the free PRO trial OPENS rather than what the current plan
 * refuses — the copy CapGateOffer uses when the user is still trial-eligible.
 *
 * Always PRO's numbers, never `limits`: this is shown to someone standing at their own cap, and
 * naming the ceiling they are about to leave tells them nothing. No guest branch, because the
 * trial requires a real account (start_pro_trial refuses anons) and guests get SignInPerk first.
 *
 * The wall is named before the offer — "you're at 3, PRO gives 12" answers the question the user
 * just asked, where "try PRO free!" is an advert that happens to have appeared.
 */
export function binderTrialMessage(limits: TierLimits): string {
  return `You’ve reached your ${limits.binders}-binder limit. PRO holds ${TIER_LIMITS.pro.binders}. Try it free for 14 days.`;
}

export function pageTrialMessage(limits: TierLimits): string {
  return `You’ve reached the ${limits.pagesPerBinder}-page limit. PRO binders hold ${TIER_LIMITS.pro.pagesPerBinder}. Try it free for 14 days.`;
}

export function artTrialMessage(limits: TierLimits): string {
  return `You’re keeping ${limits.artUploads} artworks, all this plan allows. PRO keeps ${TIER_LIMITS.pro.artUploads}. Try it free for 14 days.`;
}
