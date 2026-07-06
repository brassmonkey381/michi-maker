/**
 * Card-size source of truth: which real-world footprint each card kind occupies. Kept
 * dependency-light (only types) so both the content helpers and the UI can import it.
 *
 * The concrete jumbo card ids and V-UNION piece tuples that used to live here are gone: the
 * editor now sources jumbo cards and V-UNION groups from the runtime browse catalog
 * (`Catalog.listJumbo()` / `Catalog.vunionGroups()` — see `src/lib/catalog.ts`).
 */

import type { CardKind } from '@/data/binderTypes';

/** The pocket footprint a single card of this kind occupies (jumbo = 2×2; everything else 1×1). */
export function footprintForKind(kind?: CardKind): { rows: number; cols: number } {
  return kind === 'jumbo' ? { rows: 2, cols: 2 } : { rows: 1, cols: 1 };
}
