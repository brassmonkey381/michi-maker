/**
 * ONE SWITCH FOR EVERY HOVER CARD. While a page is turning, nothing should be hovering: the
 * title cards, the art-placeholder cards, the binder's own description card all close, and none
 * reopen until the turn has landed. The pages are moving under the pointer, so a card that
 * followed it would name the wrong page half the time and paint over the sheet in flight.
 *
 * A module-level store rather than context: the turn state lives in BinderPages and the hovers
 * live in three unrelated components, and none of them should have to thread a prop through the
 * screen to agree. `useHoverSuspended` re-renders exactly the hooks that read it.
 */
import { useSyncExternalStore } from 'react';

let suspended = false;
const listeners = new Set<() => void>();

/** Called by the page-turn owner: true while a turn (page or cover) is in flight. */
export function setHoverSuspended(on: boolean): void {
  if (suspended === on) return;
  suspended = on;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const read = () => suspended;

/** True while hover cards must stay closed. */
export function useHoverSuspended(): boolean {
  return useSyncExternalStore(subscribe, read, read);
}
