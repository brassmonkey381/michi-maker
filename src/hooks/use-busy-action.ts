/**
 * A BUTTON THAT IS WORKING SAYS SO (owner, 2026-11-10: "Buttons that take a little while to do an
 * action and return a result ... should show their state changes and be disabled while processing
 * or loading"). `run(fn)` marks the button busy until fn settles and ignores presses meanwhile;
 * the caller shows `busy` as a disabled, relabelled button.
 *
 * Behind the 'busy-buttons' dev flag: with it off, run just calls fn and busy stays false, so every
 * button behaves exactly as before.
 */
import { useCallback, useRef, useState } from 'react';

import { flag } from '@/lib/flags';

const BUSY_BUTTONS = flag('busy-buttons');

export function useBusyAction(): { busy: boolean; run: (fn: () => unknown) => void } {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const run = useCallback((fn: () => unknown) => {
    // fn starts in the press itself (a clipboard write or a share needs the user's gesture).
    if (!BUSY_BUTTONS) {
      void fn();
      return;
    }
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let out: unknown;
    try {
      out = fn();
    } catch {
      out = undefined;
    }
    void Promise.resolve(out)
      .catch(() => {})
      .finally(() => {
        running.current = false;
        setBusy(false);
      });
  }, []);
  return { busy, run };
}

/** For buttons whose busy flag already exists: is the busy look on? */
export const busyLook = (busy: boolean): boolean => BUSY_BUTTONS && busy;
