/**
 * App-wide card-size preference (S / M / L) — the single global knob the home-screen
 * `CardSizeToggle` writes and every card surface reads via `useCardSize`, so one control resizes
 * all carousels/strips live. Module-level + subscription (mirrors the kit's `browseState`); it's
 * session-sticky (resets on reload), not persisted to disk. Individual browsers can still override
 * locally via their own toolbar toggle — this is only the shared default.
 */
import { useSyncExternalStore } from 'react';

import type { CardSize } from 'tcgscan-browse';

let current: CardSize = 'M';
const listeners = new Set<() => void>();

/** Set the global card size and notify every subscribed surface. */
export function setGlobalCardSize(size: CardSize): void {
  if (size === current) return;
  current = size;
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** `[size, setSize]` for the app-wide card size. Re-renders the caller when the global changes. */
export function useCardSize(): readonly [CardSize, (size: CardSize) => void] {
  const size = useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
  return [size, setGlobalCardSize] as const;
}
