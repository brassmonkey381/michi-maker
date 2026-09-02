/**
 * ONE WALL, FOUR DOORS. Find similar is reachable from home, My binders, the browser and a
 * selection of pockets in the editor, and each of those screens already owns a `useCapGate`. The
 * hit is built here so the four cannot word it, title it, or instrument it four different ways —
 * which is exactly what happened to the binder cap before `limitMessages` existed.
 *
 * The gate is on RUNNING a search, not on seeing the button: every door still shows the action and
 * answers the tap. An entry point that quietly disappears at free teaches nobody what a plan buys,
 * and it is the reason `hasAdvancedSearch` sat unused for a month with nothing gated behind it.
 *
 * `used`/`cap` are 0 because there is nothing to count — this is a capability, not an allowance.
 * They are sent anyway rather than made optional, so every cap-gate row has the same columns and a
 * query over the funnel does not have to special-case the boolean walls.
 */
import type { CapSurface } from '@/lib/analytics';

import { similarityGateMessage, similarityTrialMessage } from './limitMessages.ts';
import type { Tier } from './tiers.ts';

/** The `limit` key on the analytics row and the once-a-day dialog pacing. */
export const SIMILARITY_LIMIT_KEY = 'findSimilar';

export function similarityWall(tier: Tier, surface: CapSurface) {
  const isGuest = tier === 'guest';
  return {
    limit: SIMILARITY_LIMIT_KEY,
    surface,
    isGuest,
    title: 'Find similar is a PRO feature',
    message: similarityGateMessage(tier),
    // No trial line for a guest: they cannot start one (start_pro_trial refuses anons), and the
    // dialog gives them the free account instead.
    trialMessage: isGuest ? undefined : similarityTrialMessage(),
    tier,
    used: 0,
    cap: 0,
  };
}
