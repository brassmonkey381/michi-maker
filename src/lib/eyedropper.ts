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

/**
 * THE POINTER IS A PROPERTY OF THE MODE, NOT OF A RENDER.
 *
 * This lived in the banner component and never fired once: michi compiles with the React
 * Compiler, which memoised the banner's `eyedropperArmed()` read into a constant `false`, so the
 * effect that injects it never ran. Driving it from the same code path that arms the dropper
 * makes that class of failure impossible — if the dropper is armed, the cursor is applied, with
 * no component in between.
 *
 * A stylesheet rule rather than `body.style.cursor`, because react-native-web puts
 * `cursor: pointer` on every Pressable — a body-level cursor loses on exactly the things worth
 * hovering, the cards. Hence `*{...!important}`.
 */
const CURSOR_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<g fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 21l1-4 9-9 3 3-9 9z"/><path d="M14 6l4-4 4 4-4 4z"/></g>' +
    '<g fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 21l1-4 9-9 3 3-9 9z"/><path d="M14 6l4-4 4 4-4 4z"/></g></svg>',
);
const CURSOR_RULE = `*{cursor:url("data:image/svg+xml,${CURSOR_SVG}") 3 21,crosshair!important}`;
const STYLE_ID = 'michi-eyedropper-cursor';

/** Web only, by construction: `document` is undefined on native and in the node test run. */
function showDropperCursor(on: boolean): void {
  if (typeof document === 'undefined' || !document.head) return;
  const existing = document.getElementById(STYLE_ID);
  if (!on) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CURSOR_RULE;
  document.head.appendChild(style);
}

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
  showDropperCursor(true);
  bump();
}

/** Put it away without taking a colour. Safe to call when it was never armed. */
export function cancelEyedropper(): void {
  if (!handler) return;
  handler = null;
  showDropperCursor(false);
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
  showDropperCursor(false);
  bump();
  take(cardId);
  return true;
}
