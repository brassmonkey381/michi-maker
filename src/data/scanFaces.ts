/**
 * WHICH POCKETS GET TO WEAR A REAL SCAN — the display-side twin of ownedCopies' claim accounting.
 *
 * THE INVARIANT, and the defect it replaces. A scan is a photograph of one physical card, so a
 * binder must never show more copies of a card wearing scans than the user owns scans of it. The
 * old resolution (byEntry, then newest-per-card byCard) broke that the moment a pocket had no
 * live claim: remove a copy and re-add it, place a fourth copy when three are owned, run the
 * wizard, or upgrade a guest account (which strips every stamp), and the pocket wore the newest
 * scan anyway — presenting photos of cards that are not in that pocket, in unlimited number.
 *
 * THE MODEL: allocation from a finite pool, not lookup in an infinite map.
 *
 *   1. A pocket whose stamp resolves to a LIVE, SCANNED copy wears that copy's own photo — up to
 *      the lot's quantity (a lot of three identical cards with one photo can honestly back three
 *      pockets; a fourth claimant is over-subscribed and shows catalog art).
 *   2. A pocket whose stamp resolves to a LIVE, UNSCANNED copy shows CATALOG ART, locked. It
 *      knows exactly which physical card it holds and that card has no photo; borrowing another
 *      copy's photo is the wrong-face defect this module exists to end. (CopyPickerSheet promises
 *      exactly this: "No photo yet — shows the catalogue image".)
 *   3. A pocket with NO stamp, or a DEAD one (the lot was deleted; the claim names nothing), draws
 *      from the card's UNCLAIMED scans — photos of copies no other pocket is already wearing.
 *      This is what keeps legacy pre-stamp binders, wizard fills, and migrated guests showing
 *      their scans instead of going blank, while the pool's finiteness enforces the invariant:
 *      three scans across five pockets is three real faces and two catalog ones, never five.
 *
 * Everything is deterministic in slot order (pages in order, slots within each page), so the same
 * binder renders the same faces on every visit and contested capacity goes to the earliest pocket
 * rather than flickering between claimants.
 *
 * DISPLAY-ONLY, deliberately. This never writes a stamp: self-healing claims during render would
 * race the placement ledger (ownedCopies) and turn a view toggle into a mutation. The claims
 * ledger has its own repairs to make; this module only refuses to LIE about it.
 *
 * Pure and dependency-light so `node --test` can run it (see scanFaces.test.ts).
 */

/** One scanned owned copy: a portfolio_entries row that has a photo. */
export interface ScannedCopy {
  entryId: string;
  /** Public URL of this copy's crop in the scan-images bucket. */
  url: string;
  /** How many identical physical cards the lot holds — its display capacity. Always >= 1. */
  quantity: number;
}

/** The slot fields allocation reads. Structural, so DemoSlot satisfies it as-is. */
export interface FaceSlot {
  id: string;
  type: string;
  cardId?: string;
  sourceEntryId?: string;
}

/**
 * Assign scan faces to card pockets: slot id → the URL that pocket wears. Absent = catalog art.
 *
 * @param slots          every slot of the binder, in page-then-position order (allocation is
 *                       binder-wide: two pages must not both think they own the same photo).
 * @param copiesByCard   cardId → that card's scanned copies, newest scan first. The pool.
 */
export function allocateScanFaces(
  slots: readonly FaceSlot[],
  copiesByCard: ReadonlyMap<string, readonly ScannedCopy[]>,
): Map<string, string> {
  const scannedByEntry = new Map<string, ScannedCopy>();
  for (const copies of copiesByCard.values()) {
    for (const c of copies) scannedByEntry.set(c.entryId, c);
  }

  const faces = new Map<string, string>();
  /** entryId → pockets already wearing this copy's photo. Bounded by the lot's quantity. */
  const used = new Map<string, number>();
  const wear = (slotId: string, copy: ScannedCopy): void => {
    faces.set(slotId, copy.url);
    used.set(copy.entryId, (used.get(copy.entryId) ?? 0) + 1);
  };
  const hasCapacity = (copy: ScannedCopy): boolean =>
    (used.get(copy.entryId) ?? 0) < Math.max(1, copy.quantity);

  // Pass 1 — stamped pockets take their own copy's photo first. Two passes, because a claim
  // outranks a scavenge: an unstamped pocket early in the binder must not walk off with a photo
  // that a stamped pocket later in the binder is entitled to by name.
  const pooled: FaceSlot[] = [];
  for (const slot of slots) {
    if (slot.type !== 'card' || !slot.cardId) continue;
    const stamp = slot.sourceEntryId;
    if (!stamp) {
      pooled.push(slot);
      continue;
    }
    const copy = scannedByEntry.get(stamp);
    if (copy && hasCapacity(copy)) wear(slot.id, copy);
    // Else: catalog, locked (rule 2). The pocket named its physical card — unscanned, deleted,
    // or already fully worn — and that card has no photo left to give it.
  }

  // Pass 2 — unclaimed pockets scavenge the card's remaining photos, newest first.
  for (const slot of pooled) {
    const copies = copiesByCard.get(slot.cardId as string);
    if (!copies) continue;
    const free = copies.find(hasCapacity);
    if (free) wear(slot.id, free);
  }

  return faces;
}
