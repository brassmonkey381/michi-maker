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
import { catalogCardToDemoCard, getLoadedCatalog, type Catalog } from '@/lib/catalog';

/**
 * Resolve a slot's card id to a `DemoCard`, or `undefined` if the catalog can't resolve it.
 *
 * This reads a module-level snapshot (`getLoadedCatalog()`), which is invisible to React's
 * dependency tracking — so use it ONLY in event handlers / imperative code, never in render.
 * In render use {@link resolveCardWith}, passing the catalog from `useCatalog()`, so the
 * component (and the React Compiler) re-computes when the catalog finishes loading.
 */
export function resolveCard(cardId: string | null | undefined): DemoCard | undefined {
  return resolveCardWith(getLoadedCatalog(), cardId);
}

/**
 * Reactive resolver: resolve against an explicitly-provided catalog (from `useCatalog()`),
 * so render-path code tracks the catalog as a real dependency and re-renders card slots the
 * moment the catalog loads. Returns `undefined` while the catalog is still null or the id is unknown.
 */
export function resolveCardWith(
  catalog: Catalog | null,
  cardId: string | null | undefined,
): DemoCard | undefined {
  if (!catalog || !cardId) return undefined;
  const card = catalog.getCard(cardId);
  return card ? catalogCardToDemoCard(card) : undefined;
}
