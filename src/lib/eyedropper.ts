/**
 * THE EYEDROPPER: arm it, then the next card you tap ANYWHERE hands over its colours.
 *
 * The alternative was a card list inside the colour sheet — search by name, pick from the results
 * — and it was the wrong shape (owner, 2026-09-17). The cards are already on screen: in the
 * binder's pockets, in the dock, in a row of search results. Asking someone to find one of them
 * again, by typing its name into a second search, is making them look for something they are
 * already looking at.
 *
 * So this holds no cards at all. It holds ONE HANDLER, set while the dropper is armed, and every
 * place a card can be tapped asks it first:
 *
 *     if (pickWithEyedropper(cardId)) return;   // the tap was a colour pick, not a placement
 *
 * That line is the whole integration, which is why it can sit in a dozen tap handlers without any
 * of them knowing what colour search is. A tap site that has not opted in simply behaves normally
 * while the dropper is armed — no surface is broken by not knowing about this.
 *
 * ONE SHOT, like a real eyedropper: taking a colour disarms it. Nobody wants the next three taps
 * to keep changing the mix, and an armed mode that outlives its own use is a mode you get stuck
 * in. Everything that arms it should also give the person a visible way out (`cancelEyedropper`).
 *
 * Module state, not React state, because the tap that answers may be in a completely different
 * subtree from the sheet that asked — a binder pocket behind a docked picker. Subscribe to repaint
 * the affordances that show it is armed.
 */

type PickHandler = (cardId: string) => void;

let handler: PickHandler | null = null;
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version += 1;
  listeners.forEach((l) => l());
}

/** Repaint when the dropper is armed or released (the cursor hint, a highlighted button). */
export function subscribeEyedropper(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Monotonic counter for useSyncExternalStore. */
export function eyedropperVersion(): number {
  return version;
}

/** True while the next card tap will be taken as a colour pick. */
export function eyedropperArmed(): boolean {
  return handler !== null;
}

/**
 * Arm the dropper. Re-arming replaces the previous handler rather than stacking: two things
 * waiting for the same tap would both fire on it, and only one of them opened the sheet.
 */
export function armEyedropper(onPick: PickHandler): void {
  handler = onPick;
  bump();
}

/** Put it away without taking a colour. Safe to call when it was never armed. */
export function cancelEyedropper(): void {
  if (!handler) return;
  handler = null;
  bump();
}

/**
 * Offer a tapped card to the dropper. Returns true when the tap was CONSUMED, so the caller must
 * do nothing else with it — no placement, no selection, no navigation.
 *
 * Disarms before calling the handler, so a handler that opens a sheet (which can itself mount a
 * tappable card) cannot be re-entered by its own side effects.
 */
export function pickWithEyedropper(cardId: string | null | undefined): boolean {
  if (!handler || !cardId) return false;
  const take = handler;
  handler = null;
  bump();
  take(cardId);
  return true;
}
