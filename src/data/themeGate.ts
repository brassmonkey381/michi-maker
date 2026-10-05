/**
 * THE ARTWORK-SEARCH WALL, built here so its three doors word it the same way.
 *
 * The doors are the browse page, the binder editor's card dock, and anywhere else that mounts
 * CardBrowse. Each already owns a `useCapGate`, so the hit is a plain object they hand it — the
 * same shape and the same instrumentation as the similarity wall next to it (see similarityGate,
 * which this deliberately mirrors rather than generalises: two walls is not yet a pattern).
 *
 * WHAT MAKES THIS A WALL AT ALL. Every tier can RUN a theme query; free and guest accounts get the
 * top few matches and a row saying how many more there are. Pressing that row is what lands here.
 * So this is not a refusal — the search worked — and the copy says what a plan adds rather than
 * what was denied. It was a toast reading "Artwork search shows the top matches on your plan. See
 * Plans to search every match", which named no plan and offered no way to have one; a person who
 * presses "+75 more matches" has told us exactly what they want (owner decision 2026-09-10).
 *
 * The trial line is what the cap-gate dialog turns into a one-press Start free trial, and it is
 * withheld from guests for the reason every other wall withholds it: `start_pro_trial` refuses an
 * anonymous caller, so the dialog offers them the free account instead.
 */
import type { CapSurface } from '@/lib/analytics';

import type { Tier } from './tiers.ts';

/** The `limit` key on the analytics row and the once-a-day dialog pacing. */
export const THEME_SEARCH_LIMIT_KEY = 'themeSearch';

const UNLOCK =
  'Unlock theme search with over 500 themes related to art style, environment, cameos, scenery, and more.';

export function themeSearchGateMessage(tier: Tier): string {
  return tier === 'guest' ? `${UNLOCK} A free account is the first step.` : UNLOCK;
}

export function themeSearchTrialMessage(): string {
  // The BUTTON under this line already says "Start free 14-day PRO trial", and the line under
  // that already promises no credit card. Saying the term a third time here was the dialog
  // talking about itself instead of about what the reader gets.
  return UNLOCK;
}

/**
 * WHERE THIS WALL OFFERS THE TRIAL, AND WHERE IT DOES NOT (owner, 2026-10-04).
 *
 * The rule since 2026-08-27 is that the trial belongs at a wall someone hits while BUILDING: the
 * binder cap, the page cap, the artwork cap, the print gate. The browse page is a search box, and
 * it was the one place still handing out one-press trials to people three minutes into a first
 * visit. Every trial started there was spent on four or five searches and never reached the
 * editor; none converted. So on `browse` the wall shows the plans note. In the editor the same
 * wall keeps the trial, because there the person is mid-way through making something it unlocks.
 */
const SURFACES_WITHOUT_TRIAL: ReadonlySet<CapSurface> = new Set<CapSurface>(['browse']);

export function themeSearchWall(tier: Tier, surface: CapSurface) {
  const isGuest = tier === 'guest';
  const noTrial = SURFACES_WITHOUT_TRIAL.has(surface);
  return {
    limit: THEME_SEARCH_LIMIT_KEY,
    surface,
    isGuest,
    title: 'Every match comes with PRO',
    message: themeSearchGateMessage(tier),
    trialMessage: isGuest || noTrial ? undefined : themeSearchTrialMessage(),
    ...(noTrial ? { offersTrial: false as const } : {}),
    // Every time, not once a day. Nothing raises this wall by accident: it takes a press on
    // "+N more matches" or a third press of the theme demo, and both are someone asking to see
    // the offer. A toast on the second ask would drop the one control that answers them.
    always: true,
    tier,
    // A capability, not an allowance: there is nothing to count. Sent anyway so every cap-gate row
    // has the same columns (the reason similarityGate does it too).
    used: 0,
    cap: 0,
  };
}
