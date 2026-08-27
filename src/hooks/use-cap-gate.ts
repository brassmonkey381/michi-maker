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
 */
import { useCallback, useEffect, useState } from 'react';

import type { CapWall } from '@/components/monetization/CapGateDialog';
import { hydrateCapPrompts, markCapPrompted, shouldPromptCap } from '@/lib/capPromptPacing';
import { trackCapGate } from '@/lib/analytics';

export interface CapHit extends CapWall {
  tier: string;
  /** Their count at the moment of the wall. */
  used: number;
  /** The limit they hit. */
  cap: number;
}

export function useCapGate(onToast: (message: string) => void) {
  const [wall, setWall] = useState<CapWall | null>(null);
  // Load the pacing once per mount. Safe to call repeatedly: it returns immediately once hydrated.
  useEffect(() => {
    void hydrateCapPrompts();
  }, []);

  const hit = useCallback(
    (h: CapHit) => {
      const { tier, used, cap, ...w } = h;
      const asDialog = shouldPromptCap(w.limit);
      if (asDialog) {
        markCapPrompted(w.limit);
        setWall(w);
      } else {
        onToast(w.message);
      }
      trackCapGate({ limit: w.limit, surface: w.surface, tier, used, cap, as: asDialog ? 'dialog' : 'toast' });
    },
    [onToast],
  );

  const closeWall = useCallback(() => setWall(null), []);
  return { hit, wall, closeWall };
}
