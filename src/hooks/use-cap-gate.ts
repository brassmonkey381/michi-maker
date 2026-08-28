/**
 * One way for every cap wall to report itself: a dialog on the first hit of the day, a toast on
 * every hit after it, and the same `cap.gate_shown` event either way.
 *
 * Before this each screen hand-rolled `showLimitToast(...)` next to `trackCapGate({...})`, which
 * is how some walls ended up instrumented and others not. Call `hit()` and both happen, in the
 * right form, once.
 *
 * `as` on the event is the point of the exercise: dialog and toast impressions have to be told
 * apart, or there is no way to learn whether stopping the user converts better than a pill they
 * can miss.
 *
 * WHAT THE EVENT SAYS ABOUT THE OFFER. The same wall answers three different people three
 * different ways — the trial to an eligible member, a plans note to one who cannot have it, the
 * free account to a guest — and until `offer` those were one row. Resolving it needs the trial
 * state at the moment of the hit, so this hook holds a `useTrial`. That is one extra ledger read
 * on the two screens that did not already have one (browse and the binder editor; home and My
 * binders mount ProTrialPrompt, which pays it anyway), and it is the same fetch CapGateOffer
 * performs a moment later when the dialog paints. Guests never query it at all.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CapDismissal, CapWall } from '@/components/monetization/CapGateDialog';
import { trialOfferVisible } from '@/components/monetization/TrialCta';
import { useTrial } from '@/hooks/use-trial';
import { hydrateCapPrompts, markCapPrompted, shouldPromptCap } from '@/lib/capPromptPacing';
import { trackCapGate, trackCapGateDismissed, trackProOfferDeclined } from '@/lib/analytics';

export interface CapHit extends CapWall {
  tier: string;
  /** Their count at the moment of the wall. */
  used: number;
  /** The limit they hit. */
  cap: number;
}

export function useCapGate(onToast: (message: string) => void) {
  const [wall, setWall] = useState<CapWall | null>(null);
  // The boolean, not the object: useTrial returns a fresh literal each render, and depending on
  // it directly would rebuild `hit` on every one.
  const offersTrial = trialOfferVisible(useTrial());
  // Load the pacing once per mount. Safe to call repeatedly: it returns immediately once hydrated.
  useEffect(() => {
    void hydrateCapPrompts();
  }, []);

  // The open wall, readable from an unmount cleanup that must not re-run when it changes. A dialog
  // still on screen when the screen goes away is an abandonment, and it has to be told apart from
  // the two real answers — see the cleanup below.
  const openRef = useRef<CapWall | null>(null);
  useEffect(() => {
    openRef.current = wall;
  }, [wall]);
  // Whether the wall currently on screen is showing the trial. CapGateOffer -> TrialCta fires
  // `pro.offer_shown` on this surface, and nothing used to close that loop for a cap gate: the
  // offer was recorded as seen and the walking away was recorded only as a cap dismissal, so the
  // print gate was the one surface whose offer had a denominator AND a numerator.
  const offeredTrialRef = useRef(false);

  const hit = useCallback(
    (h: CapHit) => {
      const { tier, used, cap, ...w } = h;
      const asDialog = shouldPromptCap(w.limit);
      if (asDialog) {
        markCapPrompted(w.limit);
        offeredTrialRef.current = !w.isGuest && offersTrial;
        setWall(w);
      } else {
        onToast(w.message);
      }
      trackCapGate({
        limit: w.limit,
        surface: w.surface,
        tier,
        used,
        cap,
        as: asDialog ? 'dialog' : 'toast',
        is_guest: w.isGuest,
        // Exactly what the dialog is about to draw (CapGateDialog → SignInPerk | CapGateOffer),
        // resolved from the same predicate CapGateOffer branches on so the two cannot disagree. A
        // toast draws no offer at all, and says so rather than borrowing the dialog's answer.
        offer: !asDialog ? 'toast' : w.isGuest ? 'signin' : offersTrial ? 'trial' : 'upgrade',
      });
    },
    [onToast, offersTrial],
  );

  /** Close the dialog, recording WHICH no it was. Both are answers; navigating away is not. */
  const dismissWall = useCallback((via: CapDismissal) => {
    const open = openRef.current;
    if (open) {
      trackCapGateDismissed({ limit: open.limit, surface: open.surface, via });
      // Closing a dialog that was offering the trial IS a decline of that offer, and it answers the
      // `pro.offer_shown` TrialCta emitted on this same surface. Only here, never in the unmount
      // cleanup below: leaving the screen is not an act aimed at the offer.
      if (offeredTrialRef.current) trackProOfferDeclined(open.surface);
    }
    offeredTrialRef.current = false;
    setWall(null);
  }, []);

  /**
   * The dialog was on screen when the screen went away. Recorded as its own kind of ending: it is
   * not a refusal of the offer, and folding it into one would inflate every dismissal rate.
   *
   * Empty deps on purpose — this must fire on unmount only, never when `wall` changes, which is
   * why it reads the ref above rather than the state.
   */
  useEffect(
    () => () => {
      const open = openRef.current;
      if (open) trackCapGateDismissed({ limit: open.limit, surface: open.surface, via: 'navigate' });
    },
    [],
  );

  /** For callers with a single close path (the dialog's X and backdrop). */
  const closeWall = useCallback(() => dismissWall('close'), [dismissWall]);

  /**
   * Close because they ACTED — pressed the trial, the plans link, or sign in. The dialog gets out
   * of the way so the result is visible, and NO dismissal is recorded: the press is the answer, and
   * counting it as a back-out would make every wall that worked look like one that was refused.
   * What they pressed is recorded by the thing they pressed (trial.start_click, the plans page.view).
   */
  const resolveWall = useCallback(() => {
    offeredTrialRef.current = false;
    setWall(null);
  }, []);

  return { hit, wall, closeWall, dismissWall, resolveWall };
}
