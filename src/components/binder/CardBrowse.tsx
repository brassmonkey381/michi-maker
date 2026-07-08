/**
 * The shared in-app card browse. Both entry points — the home "Browse all cards" section and the
 * "Edit pocket" card picker — render this so they stay visually and behaviourally identical; the
 * common `CatalogBrowser` configuration (footer, card + art tile sizing) lives here only.
 *
 * Tune the size of every browse in one place via the two constants below.
 *
 * Context-specific bits are props: `catalog` (required), `onPickCard` (omit on home, where there's
 * no pocket to place into — defaults to a no-op), and `selectedCardId` (the pocket's current card,
 * for the selected highlight). To reset browse state (e.g. per pocket) pass a React `key` on the
 * element — it remounts this wrapper and the browser inside it.
 */
import { CatalogBrowser, type CardActionsFactory } from 'tcgscan-browse';

import type { Catalog } from '@/lib/catalog';

/** Target card-thumbnail width (px) — larger ⇒ fewer, bigger cards (≈ binder size). */
export const CARD_BROWSE_TILE_WIDTH = 140;
/** Series/set art tile height (px). */
export const CARD_BROWSE_TAX_TILE_HEIGHT = 180;

export function CardBrowse({
  catalog,
  onPickCard,
  selectedCardId,
  cardActions,
}: {
  catalog: Catalog;
  onPickCard?: (cardId: string) => void;
  selectedCardId?: string;
  /** Per-card tap actions. When set, replaces the default "Place in pocket" sheet — home uses
   *  this to offer "Add to a binder…" instead of a functionless place. */
  cardActions?: CardActionsFactory;
}) {
  return (
    <CatalogBrowser
      catalog={catalog}
      selectedCardId={selectedCardId}
      onPickCard={onPickCard ?? (() => {})}
      cardActions={cardActions}
      footer={null}
      cardTileWidth={CARD_BROWSE_TILE_WIDTH}
      taxTileHeight={CARD_BROWSE_TAX_TILE_HEIGHT}
    />
  );
}
