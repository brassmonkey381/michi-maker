/**
 * One volunteered dialog at a time.
 *
 * The app has two prompts that open on their own, from conditions rather than from a tap: the
 * rights attestation (on an editable binder) and the avatar consent offer (anywhere, right after
 * sign-in). Their conditions are independent and both are true at once for exactly the population
 * this was written for: of the twelve accounts whose Google photo was withdrawn, none had accepted
 * the rights attestation, so opening a binder would have stacked two modals on one screen.
 *
 * So they take turns. Whoever claims the slot first opens; the other simply does not open this
 * time, and because it never opened it never records a showing, so it is still due on the next
 * screen or the next launch. Nothing is lost and nothing is doubled up.
 *
 * NOT for dialogs the user asked for (Share, Print, Report): a dialog opened by a tap should
 * always open. This is only for the ones that appear uninvited.
 *
 * Module-level rather than context, because the participants sit in different parts of the tree
 * (root layout and the binder screen) and a provider spanning both would exist only for this.
 */

let holder: string | null = null;

/** Take the slot, or report that someone else has it. Re-claiming your own slot succeeds. */
export function claimPromptSlot(id: string): boolean {
  if (holder !== null && holder !== id) return false;
  holder = id;
  return true;
}

/** Give it back. Safe to call when you never had it (unmount cleanup runs either way). */
export function releasePromptSlot(id: string): void {
  if (holder === id) holder = null;
}

/** Who has it, for tests and for a prompt that wants to check without taking. */
export function promptSlotHolder(): string | null {
  return holder;
}
