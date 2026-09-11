/**
 * Runs the opening riffle for a `?page=N` link: the binder opens at the front, holds, then turns
 * through to the page the link asked for. The timing lives in `data/openingFlip` (pure, tested);
 * this only schedules it and gets out of the way.
 *
 * ONCE PER MOUNT, and never again. Turning pages afterwards is the reader's business, and a hook
 * that re-ran on a dependency change would yank the binder back to the linked page under their
 * hand, which is the worst bug this feature could have.
 *
 * Every `onPage` call sits inside a timer callback rather than in the effect body, which is both
 * what the schedule needs and what the `set-state-in-effect` rule wants.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import { flipPlan } from '@/data/openingFlip';

export function useOpeningFlip({
  target,
  pageCount,
  ready,
  onPage,
}: {
  /** Zero-based page the link asked for. 0 or less means there is nothing to do. */
  target: number;
  /** How many pages the binder actually has; the target is clamped to the last one. */
  pageCount: number;
  /** False while the binder is still loading: scheduling against an unknown page count would lie. */
  ready: boolean;
  onPage: (index: number) => void;
}): void {
  const started = useRef(false);
  // The callback is read at fire time, so a caller that re-creates it every render does not
  // restart the riffle. `target` and `pageCount` are captured on the run that starts it.
  const onPageRef = useRef(onPage);
  useEffect(() => {
    onPageRef.current = onPage;
  });

  useEffect(() => {
    if (!ready || started.current || pageCount <= 0) return;
    if (target <= 0) {
      started.current = true; // nothing to animate, but never consider it again
      return;
    }
    started.current = true;
    const clamped = Math.min(target, pageCount - 1);
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (reduceMotion: boolean) => {
      if (cancelled) return;
      const plan = flipPlan(clamped, { reduceMotion });
      if (plan.startAt > 0) timers.push(setTimeout(() => onPageRef.current(plan.startAt), 0));
      plan.steps.forEach((index, i) => {
        timers.push(setTimeout(() => onPageRef.current(index), plan.holdMs + i * plan.stepMs));
      });
    };

    // Matches how the rest of the app asks (see CheatsheetButton): a promise, and a refusal is
    // treated as "no preference" rather than as a reason to skip the animation.
    AccessibilityInfo.isReduceMotionEnabled().then(schedule).catch(() => schedule(false));

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [ready, target, pageCount]);
}
