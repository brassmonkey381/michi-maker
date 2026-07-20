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
import { useState } from 'react';
import { Platform } from 'react-native';

import { CatalogBrowser, sendBrowseCommand, type CardActionsFactory, type CardLanguage } from 'tcgscan-browse';

import { ColorSearchSheet } from '@/components/ColorSearchSheet';
import type { Catalog, CatalogCard } from '@/lib/catalog';
import { useBrowseTheme } from '@/lib/browseTheme';

/**
 * Dev/QA override: append `?coldsearch` to the URL (web) to force the COLD path — the kit
 * searches via the server's search_cards RPC as if the catalog weren't loaded yet, so you can
 * test server search without racing the (fast, cached) catalog load. Off unless the param is set.
 */
const FORCE_COLD =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('coldsearch');

/** Target card-thumbnail width (px) — larger ⇒ fewer, bigger cards (≈ binder size). */
export const CARD_BROWSE_TILE_WIDTH = 140;
/** Series/set art tile height (px) — tall so the cover art (which fills the tile) reads big. */
export const CARD_BROWSE_TAX_TILE_HEIGHT = 250;

export function CardBrowse({
  catalog,
  onPickCard,
  onPickVUnion,
  onPickCards,
  selectedCardId,
  cardActions,
  initialSimilar,
  languages,
}: {
  /** Null while the catalog is still loading — CatalogBrowser then runs cold (server search). */
  catalog: Catalog | null;
  onPickCard?: (cardId: string, card?: CatalogCard) => void;
  /** Place an assembled V-UNION (Size=V-UNION group tiles). */
  onPickVUnion?: (pieces: readonly string[]) => void;
  /** Batch-place the multi-selected ids ("Add all to a binder"). */
  onPickCards?: (cardIds: string[], cards?: CatalogCard[]) => void;
  selectedCardId?: string;
  /** Per-card tap actions. When set, replaces the default "Place in pocket" sheet — home uses
   *  this to offer "Add to a binder…" instead of a functionless place. */
  cardActions?: CardActionsFactory;
  /** One-shot "find similar to all" seed run on mount (binder multi-select). Passed straight to
   *  CatalogBrowser as an explicit prop so it survives the per-pocket remount and isn't stolen by
   *  another mounted browser via the command bus. */
  initialSimilar?: string[];
  /** Constrain the browser (cards + series/set drill-down) to these printing languages; undefined
   *  = all. Passed straight to CatalogBrowser, which also auto-hides its language facet when one. */
  languages?: CardLanguage[];
}) {
  // App tokens → the kit's color contract, so the browser follows light/dark + variant
  // instead of falling back to the kit's built-in light look.
  const browseTheme = useBrowseTheme();
  // Color search lives IN the browser (a "Color" toolbar button) so it's available on every surface
  // that uses this wrapper — the /browse page AND the binder card picker. Results are pushed back
  // into the browser as a result set (showCards), so filters / multi-select / actions all apply.
  const [colorOpen, setColorOpen] = useState(false);
  return (
    <>
      <CatalogBrowser
        theme={browseTheme}
        catalog={FORCE_COLD ? null : catalog}
        selectedCardId={selectedCardId}
        onPickCard={onPickCard ?? (() => {})}
        onPickVUnion={onPickVUnion}
        onPickCards={onPickCards}
        cardActions={cardActions}
        initialSimilar={initialSimilar}
        languages={languages}
        onColorSearch={() => setColorOpen(true)}
        footer={null}
        cardTileWidth={CARD_BROWSE_TILE_WIDTH}
        taxTileHeight={CARD_BROWSE_TAX_TILE_HEIGHT}
      />
      {colorOpen ? (
        <ColorSearchSheet
          onResults={(ids, label) => {
            sendBrowseCommand({ type: 'showCards', ids, label });
            setColorOpen(false);
          }}
          onClose={() => setColorOpen(false)}
        />
      ) : null}
    </>
  );
}
