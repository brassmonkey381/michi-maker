/**
 * One uninvited dialog ON SCREEN AT A TIME. Not one per visit.
 *
 * This replaces the old prompt SLOT, which spent itself the moment anything showed and left the
 * other prompt waiting for a visit that, for most people, never came. Both of the current prompts
 * matter — one is a privacy correction we owe the user, the other is the gate every shared binder
 * sits behind — so both must be able to happen in a single visit.
 *
 * ONE AT A TIME IS STILL REQUIRED, for two separate reasons, and neither is politeness:
 *
 *   iOS presents ONE modal per view controller. A second Modal opened from the same parent is
 *   refused, and can wedge presentation state so later sheets fail to open at all. That bug has
 *   already been paid for once in this codebase.
 *
 *   Two legal-ish dialogs stacked on one screen is not a choice, it is an obstacle course.
 *
 * So a prompt takes the turn, shows, and hands it back when it closes; the next due prompt is then
 * told to look again. The seven-day cadences in src/data/prompts.ts are what stop that becoming a
 * nag — the queue itself deliberately has no memory of what it has already shown, because that was
 * exactly the rule that made the second prompt unreachable.
 *
 * NOT for dialogs the user asked for (Share, Print, Report): a dialog opened by a tap must always
 * open. This is only for the ones that appear uninvited.
 *
 * Module-level rather than context, because the participants sit in different parts of the tree
 * (root layout, my-binders, the binder screen) and a provider spanning them would exist only for
 * this. It resets with the page.
 */

let holder: string | null = null;
const waiting = new Set<() => void>();

/** Take the turn, or report it taken. Re-taking your own succeeds, so an effect may re-run. */
export function takeTurn(id: string): boolean {
  if (holder !== null && holder !== id) return false;
  holder = id;
  return true;
}

/**
 * Hand the turn back — whether the prompt showed and was answered, or never opened at all.
 *
 * Waiters are notified so the next due prompt re-evaluates: a component that lost the turn has no
 * reason to re-render on its own, so without this the second prompt would sit unshown until
 * something else happened to re-render it, which is the old bug wearing a different hat.
 */
export function endTurn(id: string): void {
  if (holder !== id) return;
  holder = null;
  for (const notify of [...waiting]) notify();
}

/** Called when the turn frees up. Returns an unsubscribe for effect cleanup. */
export function onTurnFree(fn: () => void): () => void {
  waiting.add(fn);
  return () => {
    waiting.delete(fn);
  };
}

/** Who holds it, for tests and for a prompt that wants to look without taking. */
export function turnHolder(): string | null {
  return holder;
}

/** Tests only: back to a fresh page load. */
export function resetTurns(): void {
  holder = null;
  waiting.clear();
}
