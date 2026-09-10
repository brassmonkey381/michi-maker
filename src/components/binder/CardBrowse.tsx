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
import { useRouter, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { CatalogBrowser, sendBrowseCommand, type BrowseFeature, type CardAction, type CardActionsFactory, type CardLanguage } from 'tcgscan-browse';

import { ColorSearchSheet } from '@/components/ColorSearchSheet';
import { nextDemoTheme } from '@/data/demoThemes';
import { runThemeDemo } from '@/data/themeDemo';
import { EnergyColorSheet } from '@/components/EnergyColorSheet';
import { useTier } from '@/hooks/use-tier';
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

/** How many presses of the theme button before it also puts the offer up (see below). */
const DEMO_PRESSES_BEFORE_OFFER = 5;

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
  quickAction,
  initialSimilar,
  languages,
  ownedIds,
  onSimilarLocked,
  onThemeLocked,
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
  /** A one-tap pill in each tile's top-right corner that fires WITHOUT opening the action sheet.
   *  The picker uses it for quick-place: the sheet is a fine place to *learn* about a card, but
   *  paying its open/read/dismiss toll on every card turns filling a nine-pocket page into
   *  eighteen taps. Return undefined per card to omit the pill. */
  quickAction?: (card: CatalogCard) => CardAction | undefined;
  /** One-shot "find similar to all" seed run on mount (binder multi-select). Passed straight to
   *  CatalogBrowser as an explicit prop so it survives the per-pocket remount and isn't stolen by
   *  another mounted browser via the command bus. */
  initialSimilar?: string[];
  /** Constrain the browser (cards + series/set drill-down) to these printing languages; undefined
   *  = all. Passed straight to CatalogBrowser, which also auto-hides its language facet when one. */
  languages?: CardLanguage[];
  /** The user's owned-card ids (own ≥ 1) — lights up the collection overlays: tile checks, set
   *  completion %, and the Collection (have:) filter chip. Undefined for guests. */
  ownedIds?: ReadonlySet<string>;
  /** What to do when a free/guest user asks for a similarity search. Given by the surfaces that
   *  own a cap gate, so the refusal is the same dialog every other wall shows (named, once a day,
   *  with the trial); without it the fallback is the plans page, which is honest but colder. */
  onSimilarLocked?: () => void;
  /** A free or guest account typed a theme: / art: query the lock stripped. Show the offer. */
  /** The meter row's tap ("+N more matches") on a metered themed search. Default: the plans page. */
  onThemeLocked?: () => void;
}) {
  // App tokens → the kit's color contract, so the browser follows light/dark + variant
  // instead of falling back to the kit's built-in light look.
  const browseTheme = useBrowseTheme();
  // Color search lives IN the browser (a "Color" toolbar button) so it's available on every surface
  // that uses this wrapper — the /browse page AND the binder card picker. Results are pushed back
  // into the browser as a result set (showCards), so filters / multi-select / actions all apply.
  //
  // The palette-based Tri-Color Search is a PAID (PRO/VIP) feature; free/guest users get the simple
  // energy-type search instead (with an upsell to tri-color). The gate is host-side — the kit stays
  // tier-agnostic and just fires onColorSearch; we branch on the tier here. This single site covers
  // both kit entry points (the Tri-Color button + the Color facet chip) on every surface.
  const { isPaid, hasAdvancedSearch, hasFindSimilar, loading: tierUnknown } = useTier();
  const [colorOpen, setColorOpen] = useState(false);
  /** The theme the button is offering right now; a new one is drawn after every press. */
  const [demoTheme, setDemoTheme] = useState(() => nextDemoTheme(null));
  /**
   * PRESSING IT AGAIN AND AGAIN IS A QUESTION, and the answer is not only more pictures.
   *
   * Someone still pressing after five themes has understood that searching by artwork exists and
   * is working their way through a button because they do not know they can type one of their own.
   * So every fifth press ALSO raises the artwork wall - the same dialog the "+N more matches" row
   * raises, so an eligible member starts the free trial there and everyone meets one offer. The
   * search still runs; the offer is added to it, never instead of it.
   *
   * A ref, not state: it changes what a later press does and nothing on screen depends on it, so
   * re-rendering the browser to count would be a repaint for nobody.
   */
  const demoPresses = useRef(0);
  const [energyOpen, setEnergyOpen] = useState(false);
  const router = useRouter();
  // "Advanced Search" (PRO/VIP) as the kit's feature locks. The kit enforces them — including
  // against typed `sort:value` / `>$100`, not just the chips — and calls back here for the upsell.
  // colorSearch is listed for completeness even though the swap below is what actually gates it.
  //
  // FIND SIMILAR is its own lock and its own tier (PRO, see TierLimits.findSimilar) — it happens
  // to line up with Advanced Search today, but they are sold as different things and the kit
  // stopped conflating them in 0.9.0. Locking it HERE is what covers both browser mounts: the
  // /browse page and the binder card picker, which supplies no action factory of its own and
  // would otherwise get the kit's ungated default sheet.
  //
  // NOTHING IS LOCKED WHILE THE TIER IS UNKNOWN. `useTier` answers 'guest' until the entitlement
  // read lands, and locking on that answer denies a paying subscriber their own feature on the
  // evidence of a query that has not come back yet. It bites HERE and almost nowhere else,
  // because the kit runs a handed-in `initialSimilar` search the moment this mounts — no human
  // delay to hide behind. A VIP opening Find similar from the binder with the cards dock closed
  // mounted this component and the search in the same frame and hit the PRO wall.
  //
  // Waiting costs a locked user nothing: the locks arrive a moment later, and the caps that
  // actually protect revenue are enforced server-side regardless of what this array says.
  const lockedFeatures = useMemo<BrowseFeature[] | undefined>(() => {
    if (tierUnknown) return undefined;
    const locked: BrowseFeature[] = [];
    if (!hasFindSimilar) locked.push('findSimilar');
    if (!hasAdvancedSearch) locked.push('sortByValue', 'priceFilter', 'similarRefine', 'colorSearch');
    // THEME SEARCH IS NEVER LOCKED HERE (owner decision 2026-09-07). A locked theme: is stripped
    // by the kit before the query leaves the device, which is exactly what the server's meter
    // must not be bypassed by. Every tier runs any theme query; the data project hands a free or
    // guest caller the top few rows and the true total, and the kit draws the "+N more matches"
    // row under them. That row's tap comes back through onLockedFeature('themeSearch') below.
    return locked.length ? locked : undefined;
  }, [hasAdvancedSearch, hasFindSimilar, tierUnknown]);
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
        quickAction={quickAction}
        initialSimilar={initialSimilar}
        languages={languages}
        ownedIds={ownedIds}
        lockedFeatures={lockedFeatures}
        // Value sort / price filters / similarity refine all route here when locked. Colour has
        // its own richer path (the tri-colour upsell below), so it is deliberately not sent to
        // the plans page — a live demo converts better than a price table.
        onLockedFeature={(f) => {
          if (f === 'colorSearch') setEnergyOpen(true);
          else if (f === 'findSimilar' && onSimilarLocked) onSimilarLocked();
          // The meter row under a free themed search ("+N more matches"): a deliberate tap on an
          // unlock offer, so the plans page is the right answer unless the surface says otherwise
          // (the binder editor toasts rather than navigating away from an open binder).
          else if (f === 'themeSearch') (onThemeLocked ?? (() => router.push('/plans' as Href)))();
          else router.push('/plans' as Href);
        }}
        // A DIFFERENT PICTURE EVERY PRESS (see data/demoThemes). The button carries the theme it
        // will run, so it reads as "this is the kind of thing you can ask for" rather than as one
        // fixed demo; the label is always one press behind what the box will show, which is the
        // right way round, because the label IS the offer.
        onThemeSearch={() => {
          runThemeDemo('browser', demoTheme);
          setDemoTheme(nextDemoTheme(demoTheme));
          demoPresses.current += 1;
          // Every fifth press: they have understood the feature and are still pressing a button
          // for it, which is the moment to say what searching one of their own costs.
          if (demoPresses.current % DEMO_PRESSES_BEFORE_OFFER === 0) {
            (onThemeLocked ?? (() => router.push('/plans' as Href)))();
          }
        }}
        themeSearchLabel={`Theme: ${demoTheme}`}
        colorSearchLabel="Color Search"
        onColorSearch={() => (isPaid ? setColorOpen(true) : setEnergyOpen(true))}
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
      {energyOpen ? <EnergyColorSheet catalog={catalog} onClose={() => setEnergyOpen(false)} /> : null}
    </>
  );
}
