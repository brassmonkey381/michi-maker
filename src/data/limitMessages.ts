/**
 * Cap-limit copy, in one place so every surface (Home, My binders, the editor) words a limit
 * the same way — and, crucially, nudges GUESTS to sign in (the free tier lifts the cap) rather
 * than to a paid upgrade. Signed-in free/pro users get the upgrade wording.
 *
 * Guests are anonymous accounts: their real next step at a cap is a free account, not a plan.
 * See the guest-signin-notes rule — a guest at a gate gets "Sign in", never an upgrade pitch.
 */
import { TIER_LIMITS, type Tier, type TierLimits } from './tiers.ts';
import { TRIAL_DAYS_TEXT } from './trialLength.ts';

export function binderLimitMessage(tier: Tier, limits: TierLimits): string {
  if (tier === 'guest') {
    const n = limits.binders;
    return `Guests can keep ${n} binder${n === 1 ? '' : 's'}. Create a free account to make up to ${TIER_LIMITS.free.binders}.`;
  }
  return `You’ve reached your ${limits.binders}-binder limit. Your binders stay as they are. PRO has no binder limit.`;
}

export function pageLimitMessage(tier: Tier, limits: TierLimits): string {
  if (tier === 'guest') {
    return `Guests get ${limits.pagesPerBinder} pages per binder. Create a free account for ${TIER_LIMITS.free.pagesPerBinder}.`;
  }
  return `You’ve reached the ${limits.pagesPerBinder}-page limit. Every page you have stays. PRO has no page limit.`;
}

/**
 * Kept artwork is a RETENTION cap, so the wording is "keeping N of M" rather than "you have hit
 * a wall" — the way out is deleting a slice as much as it is a bigger allowance. Lived inline in
 * BinderScreen until the gate toasts were given buttons; it is here now so all three caps word
 * themselves the same way and share one CTA rule.
 */
export function artLimitMessage(tier: Tier, limits: TierLimits): string {
  if (tier === 'guest') {
    return `Guests can keep ${limits.artUploads} artworks. Create a free account to keep up to ${TIER_LIMITS.free.artUploads}.`;
  }
  return `You’ve reached your ${limits.artUploads}-artwork limit. Everything you’ve saved stays. Delete one to add another, or PRO keeps as many as you like.`;
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

export function limitCta(tier: Tier, trialEligible = false): LimitCta {
  if (tier === 'guest') return { kind: 'signin', label: 'Create account (free)' };
  // A free account that can still take the trial is offered it by name (owner, 2026-10-29); one
  // that has used it, or a paid tier at a higher cap, is shown the plans.
  return { kind: 'plans', label: tier === 'free' && trialEligible ? 'Try PRO for FREE' : 'See plans' };
}

/**
 * The same three caps, phrased as what the free PRO trial OPENS rather than what the current plan
 * refuses — the copy CapGateOffer uses when the user is still trial-eligible.
 *
 * Always PRO's numbers, never `limits`: this is shown to someone standing at their own cap, and
 * naming the ceiling they are about to leave tells them nothing. No guest branch, because the
 * trial requires a real account (start_pro_trial refuses anons) and guests get SignInPerk first.
 *
 * The wall is named before the offer — "you're at 2, PRO has no limit" answers the question the user
 * just asked, where "try PRO free!" is an advert that happens to have appeared.
 */
export function binderTrialMessage(limits: TierLimits): string {
  return `You’ve reached your ${limits.binders}-binder limit. Your binders stay as they are. PRO has no binder limit. Try it free for ${TRIAL_DAYS_TEXT}.`;
}

export function pageTrialMessage(limits: TierLimits): string {
  return `You’ve reached the ${limits.pagesPerBinder}-page limit. Every page you have stays. PRO has no page limit. Try it free for ${TRIAL_DAYS_TEXT}.`;
}

export function artTrialMessage(limits: TierLimits): string {
  return `You’re keeping ${limits.artUploads} artworks, all this plan allows. They all stay. PRO keeps as many as you like. Try it free for ${TRIAL_DAYS_TEXT}.`;
}

/**
 * FIND SIMILAR is a capability, not a count, so the sentence has no number in it and cannot say
 * "you have reached". It says what the feature does instead: someone who has just tapped it may
 * never have seen a result from it, and "Find similar is a PRO feature" alone tells them nothing
 * about what they are being sold.
 *
 * GUESTS ARE NOT TOLD WHAT IS PRO (owner, 2026-10-29): a guest's one next step is the free
 * account, and a free account gets one free taste of Find similar, so "create a free account to
 * try it" is true. Which features are PRO is something they find out as a member, not at the door.
 */
export function similarityGateMessage(tier: Tier): string {
  return tier === 'guest'
    ? 'Find similar matches a card against the whole catalogue by its artwork. Create a free account to try it.'
    : 'Find similar matches a card against the whole catalogue by its artwork. It is part of PRO.';
}

export function similarityTrialMessage(): string {
  return `Find similar matches a card against the whole catalogue by its artwork. PRO includes it. Try it free for ${TRIAL_DAYS_TEXT}.`;
}
