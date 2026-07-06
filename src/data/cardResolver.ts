/**
 * Unified card-id → `DemoCard` resolution.
 *
 * A slot's `cardId` references the runtime browse catalog (~28k cards, loaded lazily — see
 * `src/lib/catalog.ts`). This resolver is the single seam that adapts a catalog `CatalogCard`
 * into the editor's `DemoCard` view-model:
 *
 *  1. If the catalog has loaded and knows the id, adapt its `CatalogCard` to a `DemoCard`.
 *  2. Otherwise (catalog still loading, or the id is unknown) return `undefined` — callers
 *     already render an image/`?` fallback.
 *
 * Catalog cards carry no `dominantColor` (the TCGScan catalog lacks it), so downstream tint
 * helpers must keep their neutral fallback for that field.
 */
import type { DemoCard } from '@/data/binderTypes';
import { catalogCardToDemoCard, getLoadedCatalog } from '@/lib/catalog';

/** Resolve a slot's card id to a `DemoCard`, or `undefined` if the catalog can't resolve it. */
export function resolveCard(cardId: string | null | undefined): DemoCard | undefined {
  if (!cardId) return undefined;
  const fromCatalog = getLoadedCatalog()?.getCard(cardId);
  return fromCatalog ? catalogCardToDemoCard(fromCatalog) : undefined;
}
