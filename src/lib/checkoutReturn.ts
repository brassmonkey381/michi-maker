/**
 * MIC-084: THE WAY BACK FROM A PRINT CHECKOUT IS ONE-SHOT (owner, 2026-11-26: "after we check out
 * for print, that binder always shows print messages and pop ups when i open that binder ...
 * don't have this keep happening").
 *
 * Stripe returns to the binder with ?checkout=success (or =cancelled). That flag used to stay in
 * the address, so going Back to the binder, reloading it, or opening it from history read it again
 * and reopened the print sheet and its "ready to print" modal every time. Now the flag is read
 * ONCE per page load, removed from the address at once (history.replaceState, nothing else in the
 * address changes), and kept only in memory for this visit; `consumeCheckoutResult()` clears it
 * after the first "ready" is shown, so a later open of the sheet is quiet.
 *
 * `readCheckoutResult` is the pure part (tested in checkoutReturn.test.ts).
 */
export type CheckoutResult = 'success' | 'cancelled' | null;

/** The result an address carries, and the same address without it. */
export function readCheckoutResult(href: string): { result: CheckoutResult; clean: string | null } {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { result: null, clean: null };
  }
  const raw = url.searchParams.get('checkout');
  if (raw === null) return { result: null, clean: null };
  url.searchParams.delete('checkout');
  return { result: raw === 'success' ? 'success' : raw === 'cancelled' ? 'cancelled' : null, clean: url.toString() };
}

let captured: CheckoutResult | undefined;

/**
 * This visit's checkout result. The first call reads the address and strips the flag from it;
 * every later call (any component) gets the same answer until it is consumed.
 */
export function checkoutResult(): CheckoutResult {
  if (captured !== undefined) return captured;
  captured = null;
  if (typeof window === 'undefined' || !window.location) return captured;
  const { result, clean } = readCheckoutResult(window.location.href);
  captured = result;
  if (clean) {
    try {
      window.history.replaceState(window.history.state, '', clean);
    } catch {
      // A browser that refuses replaceState keeps the flag in the address; the in-memory consume
      // below still stops a second show on this visit.
    }
  }
  return captured;
}

/** Whether this visit came back from a checkout, without reading or touching the address. */
export function hadCheckoutReturn(): boolean {
  return captured !== undefined && captured !== null;
}

/** The "ready to print" has been shown: this visit's result is used up. */
export function consumeCheckoutResult(): void {
  captured = null;
}
