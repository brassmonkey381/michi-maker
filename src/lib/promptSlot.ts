/**
 * One uninvited dialog per visit.
 *
 * The app has two prompts that open on their own, from conditions rather than from a tap: the
 * rights attestation (on an editable binder) and the avatar consent offer (anywhere, right after
 * sign-in). Their conditions are independent and both are true at once for exactly the population
 * this was written for: of the twelve accounts whose Google photo was withdrawn, none had accepted
 * the rights attestation.
 *
 * NOT STACKING IS NOT ENOUGH. The first version of this only stopped them overlapping, and the
 * browser test caught what that still allowed: answer the photo question, and the sharing question
 * opens in its place a second later. Two legal-ish dialogs back to back on one screen is the
 * nagging the seven-day cadences exist to prevent, so a slot that has actually SHOWN something is
 * spent for the rest of the visit and the other prompt waits for the next one. Neither loses its
 * place: a prompt that never opened records nothing, so it is still due.
 *
 * Hence three operations rather than two. Claiming reserves the turn before any work; releasing
 * returns it for a prompt that decided not to show after all (a fetch failed, or the photo turned
 * out to be a generated monogram), which matters because holding a turn you never used would
 * silence the other prompt for nothing; spending closes the door for the visit.
 *
 * NOT for dialogs the user asked for (Share, Print, Report): a dialog opened by a tap should
 * always open. This is only for the ones that appear uninvited.
 *
 * Module-level rather than context, because the participants sit in different parts of the tree
 * (root layout and the binder screen) and a provider spanning both would exist only for this. It
 * resets with the page, which is what makes "per visit" the unit.
 */

let holder: string | null = null;
let spent = false;

/** Take the turn, or report that it is taken or already used. Re-claiming your own succeeds. */
export function claimPromptSlot(id: string): boolean {
  if (spent) return false;
  if (holder !== null && holder !== id) return false;
  holder = id;
  return true;
}

/** Give the turn back UNUSED. No-op once spent, and once given back the door is open again. */
export function releasePromptSlot(id: string): void {
  if (holder === id && !spent) holder = null;
}

/** A dialog is now on screen: nothing else opens uninvited for the rest of this visit. */
export function spendPromptSlot(id: string): void {
  if (holder === id) spent = true;
}

/** Who has it, for tests and for a prompt that wants to look without taking. */
export function promptSlotHolder(): string | null {
  return holder;
}

/** Tests only: back to a fresh page load. */
export function resetPromptSlot(): void {
  holder = null;
  spent = false;
}
