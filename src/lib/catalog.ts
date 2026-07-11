/**
 * Catalog data-access — re-exported from the shared `tcgscan-browse` package
 * (which michi and tcgscan-app both consume), plus the michi-specific
 * `catalogCardToDemoCard` adapter into the binder editor's view-model.
 *
 * Importing the config shim FIRST guarantees the package is configured (env →
 * configureBrowse) before any re-exported loader can fetch.
 */
import '@/lib/catalogConfig';

import { cardThumbUrl, type CatalogCard } from 'tcgscan-browse';

import type { DemoCard } from '@/data/binderTypes';

export {
  formatSetDate,
  getCatalog,
  getCatalogStatus,
  getLoadedCatalog,
  loadCatalog,
  prefetchCatalog,
  seriesDateRange,
  subscribeCatalog,
  subscribeCatalogStatus,
  useCatalogStatus,
  type Catalog,
  type CatalogStatus,
  type CatalogCard,
  type CatalogSeries,
  type CatalogSet,
  type RawCard,
  type RawCatalog,
  type RawSeries,
  type RawSet,
  type RawVUnionGroup,
  type VUnionGroup,
} from 'tcgscan-browse';

/**
 * Adapt a CatalogCard into the binder editor's `DemoCard` view-model. The image
 * resolves by id via the shared image manifest (`cardThumbUrl`, 640px binder
 * tier) — the catalog no longer carries per-card image URLs; the derived
 * footprint (`kind`) carries through so jumbo/V-UNION pieces render at the right
 * size in the editor.
 */
export function catalogCardToDemoCard(c: CatalogCard): DemoCard {
  return {
    id: c.id,
    name: c.name,
    setName: c.setName,
    imageUrl: cardThumbUrl(c.id, 640),
    orientation: 'portrait',
    kind: c.kind,
    // pokemon / illustrator / dominantColor: not carried into the editor view-model.
  };
}
