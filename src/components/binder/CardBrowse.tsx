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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { browseState, CatalogBrowser, sendBrowseCommand, setColorUrl, type BrowseFeature, type CardAction, type CardActionsFactory, type CardLanguage } from 'tcgscan-browse';

import { ColorSearchSheet } from '@/components/ColorSearchSheet';
import { nextDemoTheme } from '@/data/demoThemes';
import { runThemeDemo } from '@/data/themeDemo';
import { EnergyColorSheet } from '@/components/EnergyColorSheet';
import { searchesArtworkUnmetered } from '@/data/tiers';
import { useTier } from '@/hooks/use-tier';
import type { Catalog, CatalogCard } from '@/lib/catalog';
import { useBrowseTheme } from '@/lib/browseTheme';
import { gameLabel, PICKER_GAMES, type GameId } from '@/lib/games';
import { browseUrl } from '@/lib/catalogConfig';
import { armEyedropper, cancelEyedropper, eyedropperArmed, eyedropperVersion, pickWithEyedropper, subscribeEyedropper } from '@/lib/eyedropper';
import { loadOtherGameCatalog, otherGameCatalog, otherGameVersion, subscribeOtherGame } from '@/lib/otherGame';
import { SECONDARY_GAMES } from '@/lib/otherGameKeys';

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
  const { tier, isPaid, hasAdvancedSearch, hasFindSimilar, hasTcgscanPro, loading: tierUnknown } = useTier();
  // Whether this account already searches artwork unmetered: PRO and VIP (an active trial
  // included, since a trial resolves to the tier it grants) AND a paid TCGScan membership, which
  // the theme-search function honours from the shared ledger but which grants no michi tier at
  // all. The offer below is the only thing it gates.
  const unmetered = searchesArtworkUnmetered(tier, hasTcgscanPro);
  const [colorOpen, setColorOpen] = useState(false);
  /** True while a tile tap should take the card's colours instead of placing it. */
  const armed = eyedropperArmed();
  /**
   * THE MODE ENDS WITH THE SURFACE THAT OWNS IT. The colour sheet lives here, so if this browser
   * goes away (the picker closed) there is nothing left to reopen with the colour — a later pocket
   * tap would be swallowed and produce no visible result, which is worse than not being armed.
   * On a wide screen the dock stays mounted beside the binder, which is what makes tapping a
   * pocket work at all.
   */
  useEffect(() => () => cancelEyedropper(), []);
  /** The card the eyedropper last took, handed to the colour sheet as it reopens. */
  const [droppedCard, setDroppedCard] = useState<string | undefined>(undefined);
  // Repaint the "tap a card" banner as the dropper is armed and released.
  useSyncExternalStore(subscribeEyedropper, eyedropperVersion, eyedropperVersion);
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
  /**
   * WHICH GAME THIS BROWSER IS SHOWING (lib/games — `?multi-tcg` only; otherwise Pokémon alone).
   *
   * One browser at a time, never two: `browseState` in the kit is a module singleton, so a second
   * mounted CatalogBrowser corrupts the first one's query and sort. Switching the chip swaps which
   * catalog this ONE browser holds, and its `key` remounts it so the previous game's query, filters
   * and scroll position do not carry over into a catalog that has never heard of them.
   */
  const [game, setGame] = useState<GameId>('pokemon');
  const [attempt, setAttempt] = useState(0);
  // Repaint when a secondary catalog finishes building (it is not the kit's catalog store).
  useSyncExternalStore(subscribeOtherGame, otherGameVersion, otherGameVersion);
  useEffect(() => {
    if (game !== 'pokemon') void loadOtherGameCatalog(game);
  }, [game, attempt]);
  /**
   * POINT COLOUR SEARCH AT THE GAME ON SCREEN. michi configures the kit ONCE, with Pokémon's
   * browseUrl, because the binder is Pokémon's — but the picker can browse another game entirely.
   * The kit derives its palette URL from browseUrl, so One Piece colour searches were reading
   * POKÉMON's blob, getting Pokémon ids, and having every one filtered away against the One Piece
   * catalog: "No color matches", from a game with 6,907 published palettes.
   *
   * Set before paint (useLayoutEffect-ish ordering is not needed: the sheet that reads it opens on
   * a tap, long after this runs) and reset to '' for Pokémon so its own default comes back. The
   * kit keys its colour index by URL, so flipping between games keeps both loaded.
   */
  useEffect(() => {
    const secondaryGame = SECONDARY_GAMES.find((g) => g.key === game);
    setColorUrl(secondaryGame ? `${browseUrl}/${secondaryGame.prefix}/color` : '');
  }, [game]);
  // Every game but Pokémon is a secondary source, browsed from its own published catalog.
  const secondary = game !== 'pokemon';
  const activeCatalog = secondary ? otherGameCatalog(game) : FORCE_COLD ? null : catalog;
  /**
   * THE KIT'S BROWSE STATE IS A MODULE SINGLETON (`browseState`), not component state, so a
   * remount re-reads the query, drill-down and facets the OTHER game left behind — a `key` change
   * cannot clear it. Cleared here, before the swap, so One Piece never opens on "charizard" inside
   * a set id it has never heard of.
   */
  const switchGame = (next: GameId) => {
    if (next === game) return;
    Object.assign(browseState, {
      cardQuery: '',
      seriesId: null,
      setId: null,
      selection: {},
      sortSel: null,
      similarTo: null,
      similarCards: [],
      similarSteps: [],
    });
    setGame(next);
  };

  const lockedFeatures = useMemo<BrowseFeature[] | undefined>(() => {
    if (tierUnknown && !secondary) return undefined;
    const locked: BrowseFeature[] = [];
    if (secondary) {
      /**
       * WHAT A SECONDARY GAME HAS NO DATA FOR, locked rather than left to fail quietly. Similarity,
       * colour search and artwork themes are Pokémon-only server features, and the kit's value
       * sort / price filters read ITS price summary, which is Pokémon's alone (michi merges the
       * two only for its own display, lib/prices).
       *
       * Locking `themeSearch` also closes the one real leak: the kit falls back to the server's
       * `search_cards` RPC when a query is themed or the catalog is missing, and that RPC only
       * knows Pokémon — so another game's search could silently return Pokémon cards. With a warm
       * secondary catalog AND themeSearch locked, the cold path is unreachable by construction.
       */
      /**
       * COLOUR SEARCH IS NOT LOCKED ANY MORE for a game that publishes palettes: One Piece's blob
       * lives at browse/onepiece/color/*, and the kit derives its colour URL from the active
       * browse URL, so the picker searches the right game's art. (The kit's colour index is keyed
       * by that URL as of 0.9.18 — before that it answered One Piece queries out of Pokémon's
       * palettes.) `findSimilar` stays locked: that one is an RPC this game has no server for.
       */
      locked.push('themeSearch', 'findSimilar', 'similarRefine', 'sortByValue', 'priceFilter');
      return locked;
    }
    if (!hasFindSimilar) locked.push('findSimilar');
    if (!hasAdvancedSearch) locked.push('sortByValue', 'priceFilter', 'similarRefine', 'colorSearch');
    // THEME SEARCH IS NEVER LOCKED HERE (owner decision 2026-09-07). A locked theme: is stripped
    // by the kit before the query leaves the device, which is exactly what the server's meter
    // must not be bypassed by. Every tier runs any theme query; the data project hands a free or
    // guest caller the top few rows and the true total, and the kit draws the "+N more matches"
    // row under them. That row's tap comes back through onLockedFeature('themeSearch') below.
    return locked.length ? locked : undefined;
  }, [hasAdvancedSearch, hasFindSimilar, tierUnknown, secondary]);
  return (
    <>
      {PICKER_GAMES.length > 1 ? (
        <View style={styles.gameRow}>
          {PICKER_GAMES.map((g) => {
            const on = g === game;
            return (
              <Pressable
                key={g}
                onPress={() => switchGame(g)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  styles.gameChip,
                  { borderColor: browseTheme.border ?? '#e4e4e8' },
                  on && { backgroundColor: browseTheme.accent ?? '#3B82F6' },
                ]}>
                <Text
                  style={[
                    styles.gameChipText,
                    { color: on ? browseTheme.accentText ?? '#fff' : browseTheme.subtext ?? '#888' },
                  ]}>
                  {gameLabel(g)}
                </Text>
              </Pressable>
            );
          })}
          {secondary && !activeCatalog ? (
            <Pressable onPress={() => setAttempt((n) => n + 1)} accessibilityRole="button">
              <Text style={[styles.gameNote, { color: browseTheme.subtext ?? '#888' }]}>
                {`loading ${gameLabel(game)}… (tap to retry)`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {/*
        NOT MOUNTED COLD FOR A SECONDARY GAME. The kit treats a null catalog as "search the
        server", and that server (`search_cards`) only knows Pokémon — so mounting while another
        game's catalog is still building would answer its query with Pokémon cards and sets.
        `lockedFeatures` cannot close that door: the kit's cold path is `!warm || themedQuery`, and
        locking themeSearch only removes the second half. Withholding the mount removes the first.
      */}
      {secondary && !activeCatalog ? null : (
      <CatalogBrowser
        key={game}
        theme={browseTheme}
        catalog={activeCatalog}
        selectedCardId={selectedCardId}
        onPickCard={onPickCard ?? (() => {})}
        onPickVUnion={onPickVUnion}
        onPickCards={onPickCards}
        /**
         * WHILE THE DROPPER IS ARMED, A TILE IS A COLOUR, NOT A CARD.
         *
         * A plain tap is claimed above by `onCardTap`, so the sheet should not appear at all.
         * These two remain as the belt and braces: the quick pill is still a one-tap pick, and if
         * the sheet is reached some other way it offers only the colour. Placement is withheld
         * rather than listed beside it, because a sheet offering "place" during a colour pick is
         * offering to do the thing the person left this screen to avoid.
         */
        /**
         * A PLAIN TAP IS THE PICK (kit >= 0.9.21). Without this the tile opens the card sheet and
         * the colour is two taps behind a modal that covers the very grid you are picking from —
         * which is not an eyedropper, it is a menu.
         */
        onCardTap={armed ? (c: CatalogCard) => pickWithEyedropper(c.id) : undefined}
        cardActions={
          armed
            ? () => [{ key: 'eyedropper', label: '⌇ Take these colours', kind: 'primary' as const, onPress: (c: CatalogCard) => pickWithEyedropper(c.id) }]
            : cardActions
        }
        quickAction={
          armed
            ? () => ({ key: 'eyedropper', label: '⌇', onPress: (c: CatalogCard) => pickWithEyedropper(c.id) })
            : quickAction
        }
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
          // for it, which is the moment to say what searching one of their own costs. NEVER to
          // somebody who already has it - a trial, or a TCGScan membership that unlocks this from
          // the shared ledger without granting a michi tier. Selling PRO to someone who is already
          // getting every match is the app not knowing who it is talking to.
          if (!unmetered && demoPresses.current % DEMO_PRESSES_BEFORE_OFFER === 0) {
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
      )}
      {colorOpen ? (
        <ColorSearchSheet
          paletteCardId={droppedCard}
          /**
           * ARM AND GET OUT OF THE WAY. The cards worth taking a colour from are underneath this
           * sheet — in the binder, in the dock, in the results behind it — so arming closes it and
           * the next card tap anywhere reopens it with that card's palette on the bar.
           */
          onEyedropper={() => {
            setColorOpen(false);
            armEyedropper((cardId) => {
              setDroppedCard(cardId);
              setColorOpen(true);
            });
          }}
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

const styles = StyleSheet.create({
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 6 },
  gameChip: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  gameChipText: { fontSize: 12, fontWeight: '600' },
  gameNote: { fontSize: 11 },
});
