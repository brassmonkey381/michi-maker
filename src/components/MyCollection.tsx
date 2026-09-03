/**
 * "My collection" — the signed-in user's card inventory (`user_cards`), fed live by
 * tcgscan-app scans. Lives on the /my-binders page (below Your binders). Renders nothing until
 * the inventory has rows, and updates in real time while the page is open (scan a card in
 * tcgscan, watch it show up here).
 *
 * Each tile shows `(free/owned)` — how many copies are still unplaced vs owned, where "placed"
 * counts that card's pockets across ALL of the user's binders. A card with nothing left to
 * place (0/N) greys out. Tapping selects (multi-select); the action bar places the selection
 * into a chosen binder's next free pockets.
 *
 * Catalog-free: tiles resolve images straight from the card id (cardThumbUrl), so this paints
 * without the big catalog. The header shows count + total value once the price summary resolves.
 */
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BuildBinderSheet } from '@/components/BuildBinderSheet';
import type { FreeCard } from '@/data/binderWizard';
import { ConfirmDialog } from '@/components/binder/ConfirmDialog';
import { CardPlaceholder } from '@/components/CardPlaceholder';
import { HomeSection } from '@/components/HomeSection';
import { AuthSheet } from '@/components/auth/AuthSheet';
import { CURATE_IMPORT, CURATE_TITLE, CURATE_TRY, type CurateMode } from '@/components/CurateCallout';
import { ImportCsvSheet } from '@/components/ImportCsvSheet';
import { TcgscanLink } from '@/components/monetization/BundleOffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import {
  deletePortfolio,
  fetchPortfolioGroups,
  fetchTcgscanBinders,
  fetchUserCards,
  subscribeUserCards,
  type PortfolioGroup,
  type UserCard,
} from '@/data/collectionRepo';
import {
  rebuildTcgscanBinder,
  unplacedCount,
  type RebuildResult,
  type TcgscanBinder,
} from '@/data/tcgscanBinderImport';
import type { CapHit } from '@/hooks/use-cap-gate';
import { CopyPickerSheet } from '@/components/binder/CopyPickerSheet';
import { ImageSourceToggle } from '@/components/ImageSourceToggle';
import type { OwnedEntry } from '@/data/ownedCopies';
import { catalogArtNote, claimedByEntry } from '@/data/ownedCopies';
import { useAvailableCopies, useCopyAssigner } from '@/hooks/use-owned-copies';
import { useImageSource } from '@/hooks/use-image-source';
import { useScanImages } from '@/hooks/use-scan-images';
import { EXAMPLE_COLLECTION_CSV, EXAMPLE_COLLECTION_NAME } from '@/data/exampleCollection';
import { binderLimitMessage, binderTrialMessage, pageLimitMessage, pageTrialMessage } from '@/data/limitMessages';
import { track } from '@/lib/analytics';
import { isSupabaseConfigured } from '@/lib/env';
import { cardThumbUrl } from '@/lib/catalogConfig';
import { useCatalog } from '@/hooks/use-catalog';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const TILE_W = 96;
const CARD_ASPECT = 88 / 63;

/**
 * Report a toast, optionally naming a binder inside the message for the screen to turn into a link.
 * The collection knows which binder a card landed in; only the screen can navigate to it.
 */
export type ToastReport = (message: string, link?: { text: string; binderId: string }) => void;

/** How the collection is browsed: one carousel, a series→set drill, or by tcgscan portfolio. */
type ViewMode = 'all' | 'sets' | 'portfolios';
// Session-remembered preference, like the binder double-sided toggle. Collections first: the
// cards arrive grouped that way from tcgscan, so it is the shelf the owner already pictures.
let viewModePref: ViewMode = 'portfolios';

/**
 * "109 cards" but "109 cards, 47 distinct" when a collection holds duplicates — `copies` is the
 * total owned count (sum of quantities), `distinct` the number of different cards. The distinct
 * clause is dropped when it equals the total (every card a singleton), where it would just be noise.
 */
function cardCountLabel(copies: number, distinct: number): string {
  const base = `${copies} card${copies === 1 ? '' : 's'}`;
  return distinct !== copies ? `${base}, ${distinct} distinct` : base;
}

/**
 * What a rebuild is about to do, in the confirm dialog. Everything it would leave out is named
 * here rather than discovered afterwards in the binder — a page cap, an assumed page shape, a
 * pocket two cards both claim. The reassurance at the end is load-bearing: the word "rebuild"
 * next to a scanned collection invites the fear that this MOVES something.
 */
function rebuildMessage(r: RebuildResult, maxPages: number): string {
  const s = (n: number) => (n === 1 ? '' : 's');
  const parts = [
    `${r.pages.length} page${s(r.pages.length)} of ${r.rows} × ${r.cols} pockets` +
      `${r.mixedShapes ? ' (and the odd page scanned at another shape, kept as it was)' : ''}, ` +
      `with ${r.placed} card${s(r.placed)} in the pocket it sits in on the shelf. Empty pockets ` +
      'and empty pages come across too.',
  ];
  if (r.assumedShape) {
    parts.push(
      `tcgscan never recorded this binder’s page shape, so ${r.rows} × ${r.cols} is assumed. ` +
        'You can change it in the binder if that’s wrong.',
    );
  }
  if (r.droppedPages > 0) {
    parts.push(
      `Your plan allows ${maxPages} pages per binder, so the last ${r.droppedPages} ` +
        `page${s(r.droppedPages)} (${r.droppedCards} card${s(r.droppedCards)}) stay behind.`,
    );
  }
  if (r.normalizedPages > 0) {
    parts.push(
      `${r.normalizedPages} page${s(r.normalizedPages)} ${r.normalizedPages === 1 ? 'was' : 'were'} ` +
        'scanned at a shape michi has no page for — michi draws real pages: 2×2, 3×3, 3×4 and 4×4 — ' +
        `so ${r.normalizedPages === 1 ? 'it is' : 'they are'} drawn on the nearest one that fits. ` +
        'Every card keeps the row and column it was scanned in.',
    );
  }
  if (r.rotatedPages > 0) {
    parts.push(
      `${r.rotatedPages} page${s(r.rotatedPages)} ${r.rotatedPages === 1 ? 'was' : 'were'} ` +
        'scanned sideways, so they are turned back upright here. Which way round is a guess — the ' +
        'camera angle is not recorded — so check one page and rotate it in the editor if it reads ' +
        'the wrong way.',
    );
  }
  const stray = r.collided + r.offGrid + r.loose;
  if (stray > 0) {
    parts.push(
      `${stray} card${s(stray)} ${stray === 1 ? 'has' : 'have'} no pocket to land in — two cards ` +
        'claiming one pocket, or a pocket outside the page — and stay out of the binder.',
    );
  }
  parts.push('Nothing in tcgscan changes; this only builds a michi binder from what it scanned.');
  return parts.join('\n\n');
}

export function MyCollection({
  onToast,
  onCapHit,
  onOpenBinder,
  onFindSimilar,
  onViewSet,
  shelf = null,
  autoCurate = null,
  autoCurateFrom,
}: {
  onToast?: ToastReport;
  /**
   * THE BINDER SHELF, handed in so this component can decide where it goes. Someone with no
   * collection yet finds the on-ramp ABOVE their binders — it is the thing to do next, not a
   * footnote under the shelf — and once cards exist the collection strip drops back below.
   * Owning the order here keeps one MyCollection instance alive across the switch, so the
   * example flow's guidance survives the moment its cards arrive.
   */
  shelf?: ReactNode;
  /** Open the import sheet on arrival (`/my-binders?curate=example|import`, from a CurateCallout). */
  autoCurate?: CurateMode | null;
  /** The surface that sent them, for the `demo.csv_import` event. */
  autoCurateFrom?: string;
  /**
   * Report a plan limit. Raised to the screen's useCapGate rather than shown here, so a cap met in
   * the collection gets the same pacing, the same dialog and the same `cap.gate_shown` as every
   * other wall. It was `onLimitToast` — a bare message — and the two walls below were the last
   * uninstrumented ones in the app because a toast is all a message can become.
   */
  onCapHit?: (hit: CapHit) => void;
  onOpenBinder?: (binderId: string) => void;
  /** Drive the home browser: find-similar for one or many cards. */
  onFindSimilar?: (cardIds: string[]) => void;
  /** Drive the home browser: open this card's set. */
  onViewSet?: (cardId: string) => void;
}) {
  const { user } = useAuth();
  const [cards, setCards] = useState<UserCard[] | null>(null);
  // "Try it out!" onboarding: set when the empty state imports the example collection, so the
  // strip that replaces it (once realtime delivers the cards) can guide the user to Build binder.
  const [exampleFlow, setExampleFlow] = useState(false);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    const load = () =>
      fetchUserCards()
        .then((rows) => {
          if (active) setCards(rows);
        })
        .catch(() => {});
    load();
    const unsubscribe = subscribeUserCards(userId, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  if (!cards) return shelf;
  if (cards.length === 0)
    return (
      <>
        <EmptyCollection
          onToast={onToast}
          onStartExample={() => setExampleFlow(true)}
          autoCurate={autoCurate}
          autoCurateFrom={autoCurateFrom}
        />
        {shelf}
      </>
    );
  return (
    <>
    {shelf}
    <CollectionStrip
      cards={cards}
      onToast={onToast}
      onCapHit={onCapHit}
      onOpenBinder={onOpenBinder}
      onFindSimilar={onFindSimilar}
      onViewSet={onViewSet}
      exampleFlow={exampleFlow}
      onExampleDone={() => setExampleFlow(false)}
    />
    </>
  );
}

/**
 * Signed-in but nothing owned yet: a slim on-ramp — try the example collection, scan with
 * tcgscan, or bootstrap from your own CSV. "Try it out!" prefills the import sheet with a bundled
 * ~200-card sample (see src/data/exampleCollection.ts) so a first-timer can go from nothing to a
 * built binder in two taps. (Guests see nothing here; realtime swaps this for the full strip the
 * moment the first card lands.)
 */
function EmptyCollection({
  onToast,
  onStartExample,
  autoCurate = null,
  autoCurateFrom,
}: {
  onToast?: ToastReport;
  onStartExample?: () => void;
  autoCurate?: CurateMode | null;
  autoCurateFrom?: string;
}) {
  const { isSignedIn, isGuest } = useAuth();
  // Arriving from a CurateCallout with `?curate=` opens the right sheet at once — initial state,
  // not an effect, so there is no frame of the closed page first.
  const arrived = !!autoCurate && isSignedIn;
  const [importOpen, setImportOpen] = useState(arrived);
  const [seedExample, setSeedExample] = useState(autoCurate === 'example');
  const [authOpen, setAuthOpen] = useState(false);
  const surface = autoCurateFrom ?? 'collection';
  useEffect(() => {
    if (!arrived || autoCurate !== 'example') return;
    // The funnel signal, at the one place the example is actually loaded, tagged with the page
    // that sent them here.
    track('demo.csv_import', { surface });
    onStartExample?.();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!isSignedIn && !isGuest) return null;
  const openExample = () => {
    track('demo.csv_import', { surface });
    setSeedExample(true);
    onStartExample?.();
    setImportOpen(true);
  };
  const openImport = () => {
    setSeedExample(false);
    setImportOpen(true);
  };
  if (isGuest) {
    // A guest can be shown the offer but not take it up: a collection belongs to an account.
    return (
      <HomeSection title={CURATE_TITLE}>
        <View style={styles.emptyRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyRowText}>
            Import the cards you own and michi-maker curates a binder from them. Sign in first so
            your collection has somewhere to live.
          </ThemedText>
          <Pressable
            onPress={() => setAuthOpen(true)}
            style={({ pressed }) => [styles.buildChip, pressed && styles.pressed]}>
            <Text style={styles.buildChipText}>Sign in to import</Text>
          </Pressable>
        </View>
        <AuthSheet visible={authOpen} onClose={() => setAuthOpen(false)} />
      </HomeSection>
    );
  }
  return (
    <HomeSection title={CURATE_TITLE}>
      <View style={styles.emptyRow}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyRowText}>
          Import the cards you own and michi-maker curates a binder from them. New here? Load the
          example collection to see it work, or scan cards with <TcgscanLink /> and import your
          own CSV.
        </ThemedText>
        <Pressable
          onPress={openExample}
          style={({ pressed }) => [styles.buildChip, pressed && styles.pressed]}>
          <Text style={styles.buildChipText}>{CURATE_TRY}</Text>
        </Pressable>
        <Pressable onPress={openImport} style={({ pressed }) => [pillChip.base, pressed && styles.pressed]}>
          <Text style={pillChip.text}>{CURATE_IMPORT}</Text>
        </Pressable>
      </View>
      <ImportCsvSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        isDemoImport={seedExample}
        initialCsv={seedExample ? EXAMPLE_COLLECTION_CSV : ''}
        initialName={seedExample ? EXAMPLE_COLLECTION_NAME : ''}
        intro={
          seedExample
            ? 'Step 1 of 3 · We filled in a sample of about 200 recent cards below. Tap Import to add them to your collection.'
            : undefined
        }
        onImported={(name, cardCount, copies) =>
          onToast?.(`Imported ${copies} cop${copies === 1 ? 'y' : 'ies'} into “${name}”`)
        }
      />
    </HomeSection>
  );
}

function CollectionStrip({
  cards,
  onToast,
  onCapHit,
  onOpenBinder,
  onFindSimilar,
  onViewSet,
  exampleFlow,
  onExampleDone,
}: {
  cards: UserCard[];
  onToast?: ToastReport;
  /** See MyCollection's prop of the same name: the screen's cap gate, not a toast. */
  onCapHit?: (hit: CapHit) => void;
  onOpenBinder?: (binderId: string) => void;
  onFindSimilar?: (cardIds: string[]) => void;
  onViewSet?: (cardId: string) => void;
  /** True right after the "Try it out!" example import — show the Build-binder next step. */
  exampleFlow?: boolean;
  /** Clear the onboarding flow (called once the example binder is built). */
  onExampleDone?: () => void;
}) {
  const store = useBinders();
  // Which of the user's physical cards each placement claims (see use-owned-copies): every
  // add path resolves it the same way, so what a pocket costs no longer depends on the screen
  // it was added from.
  const assignCopies = useCopyAssigner();
  const availableCopies = useAvailableCopies();
  // Real scans: show each card as the camera saw it (tcgscan's scan crops). Chip hidden until
  // the account has any; session-only toggle, like the binder view's Scans pill.
  const scanImages = useScanImages();
  // Which picture of a card to show. Shared with every other surface that can show either (see
  // use-image-source), so turning photos on here does not have to be done again in a binder.
  const [imageSource, setImageSource] = useImageSource();
  const showScans = imageSource === 'scans';
  // Tiles are per-CARD aggregates (a UserCard row, not a lot), so the card's newest scan is the
  // right face here; per-copy display lives where copies exist — binder pockets and tcgscan's
  // lot rows.
  const scanUrlOf =
    showScans && scanImages ? (cardId: string) => scanImages.byCard.get(cardId) : undefined;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Tap behaviour mirrors the card browser: a tap opens the card's ACTION MODAL; flip on
  // "Select multiple" and taps toggle a selection for the bulk action bar instead.
  const [multiMode, setMultiMode] = useState(false);
  const [actionCard, setActionCard] = useState<UserCard | null>(null);
  // Ending multi-select with a selection opens this bulk-action modal (rather than silently
  // discarding the picks — the old behaviour, which read as "nothing happened").
  const [bulkOpen, setBulkOpen] = useState(false);
  // Browse / search state: one carousel, the series→set drill, or by tcgscan portfolio.
  const [mode, setMode] = useState<ViewMode>(viewModePref);
  const switchMode = (m: ViewMode) =>
    setMode(() => {
      viewModePref = m; // session-sticky, mirrors the double-sided toggle pattern
      return m;
    });
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  // The catalog powers name/set search, the Sets drill, and the action modal's metadata —
  // loaded only when one of those is actually in play.
  const { catalog } = useCatalog(mode === 'sets' || q.length > 0 || actionCard != null);
  // tcgscan portfolios, fetched the first time that view opens.
  const [portfolios, setPortfolios] = useState<PortfolioGroup[] | null>(null);
  // Collection multi-select that runs BEFORE the wizard: pick which tcgscan collection(s) to draft
  // from. Declared here (not with the other build state) so the portfolio fetch below can depend on
  // it — the picker needs portfolios regardless of the current view mode.
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if ((mode !== 'portfolios' && !pickerOpen) || portfolios) return;
    let active = true;
    fetchPortfolioGroups()
      .then((g) => {
        if (active) setPortfolios(g);
      })
      .catch(() => {
        if (active) setPortfolios([]);
      });
    return () => {
      active = false;
    };
  }, [mode, portfolios, pickerOpen]);
  // The user's PHYSICAL tcgscan binders, for "rebuild this one in michi". Fetched alongside the
  // portfolios, since the rows live under them; a failure leaves the section absent rather than
  // breaking the portfolio view around it.
  const [tcgBinders, setTcgBinders] = useState<TcgscanBinder[] | null>(null);
  useEffect(() => {
    if (mode !== 'portfolios' || tcgBinders) return;
    let active = true;
    fetchTcgscanBinders()
      .then((b) => {
        if (active) setTcgBinders(b);
      })
      .catch(() => {
        if (active) setTcgBinders([]);
      });
    return () => {
      active = false;
    };
  }, [mode, tcgBinders]);
  // A REBUILT BINDER STOPS OFFERING ITSELF. Once its cards are in pockets, "Rebuild in michi"
  // would only make a second copy of a binder that already exists — the button's whole promise
  // (here is your shelf, brought across) has already been kept. It comes back when every one of
  // its cards is free again, because then there is genuinely nothing here representing it.
  //
  // Keyed on the CARDS, not on a "rebuilt" flag: pockets are the only honest record of whether the
  // shelf is represented, they survive a deleted-and-rebuilt binder, and pulling the cards back
  // out is exactly how a user says "do that again".
  const claimedEntries = useMemo(
    () => claimedByEntry(store.userBinders.flatMap((b) => b.pages.flatMap((p) => p.slots))),
    [store.userBinders],
  );
  const rebuildableBinders = useMemo(
    () => (tcgBinders ?? []).filter((b) => !b.entries.some((e) => claimedEntries.has(e.entryId))),
    [tcgBinders, claimedEntries],
  );

  // The rebuild is previewed BEFORE it is offered: the same function that builds the pages counts
  // what would be left out, so the chip, the confirm dialog and the result can never disagree.
  const maxPages = store.limits.pagesPerBinder;
  const rebuilds = useMemo(() => {
    const out = new Map<string, RebuildResult>();
    for (const b of rebuildableBinders) out.set(b.id, rebuildTcgscanBinder(b, maxPages));
    return out;
  }, [rebuildableBinders, maxPages]);
  // The binder awaiting the confirm dialog.
  const [rebuildUnit, setRebuildUnit] = useState<TcgscanBinder | null>(null);

  // Which chooser is open: pick a binder to ADD the placeable selection to, or to RECLAIM the
  // single selected card from.
  const [chooser, setChooser] = useState<'add' | 'reclaim' | null>(null);
  // "+ New binder": the freshly created binder isn't in the store snapshot this render closed
  // over, so the add is parked here and fires once the binder shows up in userBinders.
  const [pendingAdd, setPendingAdd] = useState<{ binderId: string; ids: string[] } | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot deferred store write, then cleared */
  useEffect(() => {
    if (!pendingAdd) return;
    if (!store.userBinders.some((b) => b.id === pendingAdd.binderId)) return;
    const { added, unplaced, droppedClaims } = store.addCardsToBinder(pendingAdd.binderId, pendingAdd.ids, {
      entryIds: assignCopies(pendingAdd.ids),
      fromCollection: true,
    });
    setPendingAdd(null);
    // The page cap can leave cards out — say so (with the upgrade route) rather than dropping
    // them silently. Same for a claim the store's guard refused: this is the place-MY-copies
    // surface, so a pocket that lands as catalogue art is named, not smiled over.
    if (unplaced > 0) onToast?.(pageLimitMessage(store.tier, store.limits));
    else if (added > 0) {
      onToast?.(
        `Added ${added} card${added === 1 ? '' : 's'} to your new binder${catalogArtNote(droppedClaims, added)}`,
        { text: 'your new binder', binderId: pendingAdd.binderId },
      );
    }
    // assignCopies is a dep like any other: it changes when ownership or the placed set does, and
    // this effect must resolve the copies as they stand when the new binder actually appears, not
    // as they stood when the tap happened.
  }, [pendingAdd, store, onToast, assignCopies]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // How many owned copies of each card sit in binders — only pockets placed FROM the
  // collection count (slot.fromCollection); cards added through general browsing are
  // aspirational and don't consume owned copies.
  const placedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const binder of store.userBinders) {
      for (const page of binder.pages) {
        for (const slot of page.slots) {
          if (slot.cardId && slot.fromCollection)
            counts.set(slot.cardId, (counts.get(slot.cardId) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [store.userBinders]);

  const freeOf = (c: UserCard) => Math.max(0, c.quantity - (placedCounts.get(c.cardId) ?? 0));
  const copies = cards.reduce((n, c) => n + c.quantity, 0);
  const available = cards.reduce((n, c) => n + freeOf(c), 0);
  const headline = `${cardCountLabel(copies, cards.length)} · ${available} available to place`;
  const [wizardOpen, setWizardOpen] = useState(false);
  // `buildCards` is the scoped free-card list (id + free-copy count) handed to BuildBinderSheet
  // (null = whole collection, the "Try it out!" onboarding path, which skips the picker).
  // Excluded-set semantics mirror the wizard's own page toggles: empty = every collection ticked.
  // (`pickerOpen` is declared above, beside the portfolio fetch it drives.)
  const [excludedCollections, setExcludedCollections] = useState<Set<string>>(new Set());
  const [buildCards, setBuildCards] = useState<FreeCard[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Portfolio pending deletion (confirm dialog) — e.g. the "Try it out!" example cards.
  const [pfDelete, setPfDelete] = useState<{ id: string; name: string } | null>(null);
  const runDeletePortfolio = async () => {
    if (!pfDelete) return;
    const { id } = pfDelete;
    setPfDelete(null);
    try {
      await deletePortfolio(id);
      setPortfolios(null); // refetch the portfolio list; user_cards realtime refreshes the strip
      // The delete also demoted any binder pockets this portfolio was backing (server-side, at
      // commit). Re-pull the binders so placed counts drop with the owned counts; without this
      // the stale fromCollection flags keep subtracting copies that no longer exist.
      void store.refreshUserBinders().catch(() => {});
      onToast?.('Collection deleted');
    } catch (e) {
      onToast?.((e as Error).message);
    }
  };
  /**
   * Rebuild one tcgscan binder as a michi binder: the pages the scanner recorded, each card in the
   * pocket it sits in on the shelf. Created in ONE call with its pages attached — createBinder
   * persists the whole thing atomically, where creating then filling would race the store snapshot.
   */
  const runRebuild = () => {
    const unit = rebuildUnit;
    if (!unit) return;
    setRebuildUnit(null);
    // Rebuilt rather than reused from the preview: the preview's slot ids are minted per render,
    // and the binder that gets saved should own ids nothing else has ever held.
    const r = rebuildTcgscanBinder(unit, maxPages);
    const binder = store.createBinder({ title: unit.name, pages: r.pages });
    if (!binder) {
      onCapHit?.({
        limit: 'binders',
        surface: 'collection_list',
        isGuest: store.tier === 'guest',
        title: 'You are at your binder limit',
        message: binderLimitMessage(store.tier, store.limits),
        trialMessage: binderTrialMessage(store.limits),
        tier: store.tier,
        used: store.binderCount,
        cap: store.limits.binders,
      });
      return;
    }
    track('binder.rebuild_from_tcgscan', {
      pages: r.pages.length,
      placed: r.placed,
      unplaced: unplacedCount(r),
    });
    const left = unplacedCount(r);
    onToast?.(
      `Rebuilt “${unit.name}” — ${r.placed} card${r.placed === 1 ? '' : 's'} in ${r.pages.length} page${
        r.pages.length === 1 ? '' : 's'
      }${left > 0 ? `, ${left} left out` : ''}`,
    );
    onOpenBinder?.(binder.id);
  };

  // Free COPIES per card id (owned across all condition rows, minus what's placed from collection).
  // The build now places every free copy, so it needs counts, not just a distinct id list.
  const freeByCard = useMemo(() => {
    const owned = new Map<string, number>();
    for (const c of cards) owned.set(c.cardId, (owned.get(c.cardId) ?? 0) + c.quantity);
    const free = new Map<string, number>();
    for (const [id, n] of owned) {
      const f = Math.max(0, n - (placedCounts.get(id) ?? 0));
      if (f > 0) free.set(id, f);
    }
    return free;
  }, [cards, placedCounts]);
  const freeIds = [...freeByCard.keys()];
  // Whole-collection free cards for the onboarding ("Try it out!") build, which skips the picker.
  const allFreeCards = useMemo<FreeCard[]>(
    () => [...freeByCard].map(([id, qty]) => ({ id, qty })),
    [freeByCard],
  );

  const toggle = (cardId: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });

  // A tap either opens the card's action modal (browser-style) or toggles the multi-selection.
  const pressTile = (card: UserCard) => {
    if (multiMode) toggle(card.cardId);
    else setActionCard(card);
  };

  // Search filter — name/set/series come from the catalog once it's in (id matching works cold).
  const filtered = useMemo(() => {
    if (!q) return cards;
    return cards.filter((c) => {
      if (c.cardId.includes(q)) return true;
      const cc = catalog?.getCard(c.cardId);
      if (!cc) return false;
      return (
        cc.name.toLowerCase().includes(q) ||
        cc.setName.toLowerCase().includes(q) ||
        cc.seriesId.toLowerCase().includes(q)
      );
    });
  }, [cards, q, catalog]);

  // The series → set drill (needs the catalog for the grouping metadata).
  const setGroups = useMemo(() => {
    if (mode !== 'sets' || !catalog) return null;
    const bySeries = new Map<
      string,
      { latest: string; sets: Map<string, { name: string; latest: string; cards: UserCard[] }> }
    >();
    for (const c of filtered) {
      const cc = catalog.getCard(c.cardId);
      const series = cc?.seriesId || 'Other';
      const setKey = cc?.setId || 'other';
      const rel = cc?.releaseDate || '';
      let s = bySeries.get(series);
      if (!s) {
        s = { latest: '', sets: new Map() };
        bySeries.set(series, s);
      }
      if (rel > s.latest) s.latest = rel;
      let st = s.sets.get(setKey);
      if (!st) {
        st = { name: cc?.setName || 'Unknown set', latest: '', cards: [] };
        s.sets.set(setKey, st);
      }
      if (rel > st.latest) st.latest = rel;
      st.cards.push(c);
    }
    return [...bySeries.entries()]
      .sort((a, b) => b[1].latest.localeCompare(a[1].latest))
      .map(([series, s]) => ({
        series,
        sets: [...s.sets.values()].sort((a, b) => b.latest.localeCompare(a.latest)),
      }));
  }, [mode, catalog, filtered]);

  // The by-portfolio view: each tcgscan collection's owned cards, plus an "unsorted" bucket
  // for inventory that isn't in any portfolio (CSV imports, manual adds).
  const portfolioGroups = useMemo(() => {
    if (mode !== 'portfolios' || !portfolios) return null;
    const byId = new Map(filtered.map((c) => [c.cardId, c]));
    const claimed = new Set<string>();
    const groups = portfolios
      .map((p) => {
        const members = [...p.quantities.keys()]
          .map((id) => byId.get(id))
          .filter((c): c is UserCard => !!c);
        for (const m of members) claimed.add(m.cardId);
        return { id: p.id, name: p.name, cards: members };
      })
      .filter((g) => g.cards.length > 0);
    const unsorted = filtered.filter((c) => !claimed.has(c.cardId));
    if (unsorted.length > 0) groups.push({ id: '__unsorted', name: 'Not in a collection', cards: unsorted });
    return groups;
  }, [mode, portfolios, filtered]);

  // Options for the "build from which collection(s)" picker: each portfolio's PLACEABLE cards paired
  // with their free-copy count (a card in several portfolios counts under each — selection is a
  // union, so no dedupe across groups), plus an "unsorted" bucket of free cards in no portfolio (CSV
  // imports, manual adds). `copies` is the total free copies in the group — the count the row shows,
  // since the build now places every copy. Unlike the portfolio VIEW above this ignores the search
  // query: the picker builds from the whole collection.
  const buildGroups = useMemo(() => {
    if (!portfolios) return null;
    const claimed = new Set<string>();
    const groups = portfolios
      .map((p) => {
        const groupCards: FreeCard[] = [];
        for (const id of p.quantities.keys()) {
          const qty = freeByCard.get(id);
          if (qty) {
            groupCards.push({ id, qty });
            claimed.add(id);
          }
        }
        const copies = groupCards.reduce((n, f) => n + f.qty, 0);
        return { id: p.id, name: p.name, cards: groupCards, copies };
      })
      .filter((g) => g.cards.length > 0);
    const unsorted: FreeCard[] = [];
    for (const [id, qty] of freeByCard) if (!claimed.has(id)) unsorted.push({ id, qty });
    if (unsorted.length > 0)
      groups.push({
        id: '__unsorted',
        name: 'Not in a collection',
        cards: unsorted,
        copies: unsorted.reduce((n, f) => n + f.qty, 0),
      });
    return groups;
  }, [portfolios, freeByCard]);

  // The unplaced cards (id → free copies) spanned by the currently-ticked collections. A Map dedupes
  // a card shared by two selected collections to one entry — its global free-copy count.
  const selectedBuildCards = useMemo(() => {
    const m = new Map<string, number>();
    if (buildGroups)
      for (const g of buildGroups)
        if (!excludedCollections.has(g.id)) for (const f of g.cards) m.set(f.id, f.qty);
    return m;
  }, [buildGroups, excludedCollections]);
  const selectedCopyCount = useMemo(() => {
    let n = 0;
    for (const qty of selectedBuildCards.values()) n += qty;
    return n;
  }, [selectedBuildCards]);
  const allCollectionsSelected =
    !!buildGroups && buildGroups.every((g) => !excludedCollections.has(g.id));

  // Only cards with a free copy can be placed — an exhausted (0/n) selection is reclaim-only.
  const placeableIds = [...selected].filter((id) => {
    const card = cards.find((c) => c.cardId === id);
    return card ? freeOf(card) > 0 : false;
  });
  // Reclaim works on exactly one selected card that has copies sitting in binders.
  const reclaimId =
    selected.size === 1 && (placedCounts.get([...selected][0]) ?? 0) > 0 ? [...selected][0] : null;
  /** Binders holding collection-sourced copies of the reclaim card, with how many each. */
  const reclaimSources = reclaimId
    ? store.userBinders
        .map((b) => ({
          binder: b,
          count: b.pages.reduce(
            (n, p) =>
              n + p.slots.filter((s) => s.cardId === reclaimId && s.fromCollection).length,
            0,
          ),
        }))
        .filter((r) => r.count > 0)
    : [];

  // A collection add with a real choice in it: ONE card, and more than one copy of it free.
  // Coming from the collection already says "one of mine goes in", so the open question is only
  // WHICH - and with a single copy there is no question at all. (Browse asks even at one copy,
  // because there the pocket could equally mean "one I want".)
  const [copyChoice, setCopyChoice] = useState<{
    binderId: string;
    cardId: string;
    copies: OwnedEntry[];
  } | null>(null);

  const addTo = (binderId: string, entryIds?: (string | undefined)[]) => {
    const ids = placeableIds;
    if (!entryIds && ids.length === 1) {
      const copies = availableCopies(ids[0]);
      if (copies.length > 1) {
        setChooser(null);
        setCopyChoice({ binderId, cardId: ids[0], copies });
        return;
      }
    }
    setChooser(null);
    setSelected(new Set());
    const target = store.userBinders.find((b) => b.id === binderId);
    const { added, unplaced, droppedClaims } = store.addCardsToBinder(binderId, ids, {
      fromCollection: true,
      entryIds: entryIds ?? assignCopies(ids),
    });
    const title = target?.title ?? 'binder';
    // Anything the page cap left out is named, not dropped in silence — and reported, which it was
    // not: this went out as a plain confirmation toast, so a binder that filled up mid-add looked
    // in the stream exactly like one that did not.
    if (unplaced > 0) {
      onCapHit?.({
        limit: 'pagesPerBinder',
        surface: 'collection_list',
        isGuest: store.tier === 'guest',
        title: 'That binder is full',
        message: pageLimitMessage(store.tier, store.limits),
        trialMessage: pageTrialMessage(store.limits),
        tier: store.tier,
        used: target?.pages.length ?? 0,
        cap: store.limits.pagesPerBinder,
      });
    } else if (added > 0) {
      // droppedClaims is the load-bearing term here: placeableIds already gates on freeOf > 0,
      // so the assigner running dry is next to unreachable on this surface, but a claim refused
      // by the store's fresher ledger is not.
      onToast?.(
        `Added ${added} card${added === 1 ? '' : 's'} to ${title}${catalogArtNote(droppedClaims, added)}`,
        { text: title, binderId },
      );
    }
  };

  const addToNew = () => {
    const ids = placeableIds;
    setChooser(null);
    setSelected(new Set());
    const binder = store.createBinder({ title: 'My collection picks' });
    // The store refuses past the binder cap — say so instead of silently doing nothing, and say it
    // through the gate so it is paced, offered and recorded like every other binder wall.
    if (!binder) {
      onCapHit?.({
        limit: 'binders',
        surface: 'collection_list',
        isGuest: store.tier === 'guest',
        title: 'You are at your binder limit',
        message: binderLimitMessage(store.tier, store.limits),
        trialMessage: binderTrialMessage(store.limits),
        tier: store.tier,
        used: store.binderCount,
        cap: store.limits.binders,
      });
      return;
    }
    setPendingAdd({ binderId: binder.id, ids });
  };

  /** Take one copy of the selected card back out of `binderId` (its last placed pocket). */
  const reclaimFrom = (binderId: string) => {
    const cardId = reclaimId;
    setChooser(null);
    setSelected(new Set());
    if (!cardId) return;
    const binder = store.userBinders.find((b) => b.id === binderId);
    if (!binder) return;
    for (let pi = binder.pages.length - 1; pi >= 0; pi -= 1) {
      const page = binder.pages[pi];
      const slot = [...page.slots].reverse().find((s) => s.cardId === cardId && s.fromCollection);
      if (slot) {
        store.removeSlot(binder.id, page.id, slot.id);
        onToast?.(`Reclaimed from ${binder.title}. 1 more available to place`);
        return;
      }
    }
  };

  // "Build binder" pressed. The example ("Try it out!") flow is a single curated collection with a
  // guided 3-step arc, so it skips the picker and drafts from everything; the normal path opens the
  // collection multi-select first.
  const startBuild = () => {
    if (exampleFlow) {
      setBuildCards(null);
      setWizardOpen(true);
      return;
    }
    setExcludedCollections(new Set()); // reopen with every collection ticked
    setPickerOpen(true);
  };
  const toggleCollection = (id: string) =>
    setExcludedCollections((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllCollections = () =>
    setExcludedCollections(
      allCollectionsSelected && buildGroups ? new Set(buildGroups.map((g) => g.id)) : new Set(),
    );
  const confirmPicker = () => {
    if (selectedBuildCards.size === 0) return;
    setBuildCards([...selectedBuildCards].map(([id, qty]) => ({ id, qty })));
    setPickerOpen(false);
    setWizardOpen(true);
  };

  return (
    <HomeSection
      title="My collection"
      action={
        <View style={styles.headerAction}>
          <ThemedText type="small" themeColor="textSecondary">
            {headline}
          </ThemedText>
          {freeIds.length > 0 ? (
            <Pressable
              onPress={startBuild}
              style={({ pressed }) => [styles.buildChip, pressed && styles.pressed]}>
              <Text style={styles.buildChipText}>Build binder</Text>
            </Pressable>
          ) : null}
        </View>
      }>
      {exampleFlow && freeIds.length > 0 ? (
        <View style={styles.guideBanner}>
          <Text style={styles.guideText}>
            Step 2 of 3 · Your example cards are in. Build a binder to see them arranged into
            curated pages.
          </Text>
          <Pressable
            onPress={startBuild}
            style={({ pressed }) => [styles.buildChip, pressed && styles.pressed]}>
            <Text style={styles.buildChipText}>Build binder</Text>
          </Pressable>
        </View>
      ) : null}
      {/* TWO ROWS, BY WHAT THEY ANSWER. The first is "which cards am I looking at" - how they are
          grouped, and what I am searching for - and nothing else belongs beside it. The second is
          how they are shown and what I am about to do with them: modes and one-off actions, which
          are used far less often and were crowding the choice that matters most. */}
      <View style={styles.controlsRow}>
        {(
          [
            ['portfolios', 'Collections'],
            ['sets', 'By set'],
            ['all', 'All'],
          ] as const
        ).map(([m, label]) => (
          <Pressable
            key={m}
            onPress={() => switchMode(m)}
            style={[pillChip.base, mode === m && pillChip.active]}>
            <Text style={[pillChip.text, mode === m && pillChip.textActive]}>{label}</Text>
          </Pressable>
        ))}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your cards…"
          placeholderTextColor={Palette.muted3}
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.search}
        />
      </View>
      <View style={styles.controlsRow}>
        <Pressable
          onPress={() => {
            if (multiMode) {
              // Ending multi-select: surface the bulk-action modal when cards are chosen (keeping the
              // selection); otherwise just leave the mode.
              setMultiMode(false);
              if (selected.size > 0) setBulkOpen(true);
            } else {
              setMultiMode(true);
              setSelected(new Set());
            }
          }}
          style={[pillChip.base, multiMode && pillChip.active]}>
          <Text style={[pillChip.text, multiMode && pillChip.textActive]}>
            {multiMode ? '✓ Done selecting' : '⊕ Select multiple'}
          </Text>
        </Pressable>
        {scanImages ? <ImageSourceToggle value={imageSource} onChange={setImageSource} /> : null}
        {/* Import is a once-in-a-while errand, not a browse control - last on the second row, out
            of the way of everything used every visit. */}
        <Pressable onPress={() => setImportOpen(true)} style={[pillChip.base, styles.importChip]}>
          <Text style={pillChip.text}>Import</Text>
        </Pressable>
      </View>
      {q && !catalog ? (
        <ThemedText type="small" themeColor="textSecondary">
          Loading card names for search…
        </ThemedText>
      ) : null}

      {mode === 'all' ? (
        filtered.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
            No cards match “{query.trim()}”.
          </ThemedText>
        ) : (
          <TileStrip
            cards={filtered}
            placedCounts={placedCounts}
            selected={selected}
            onPress={pressTile}
            scanUrlOf={scanUrlOf}
          />
        )
      ) : null}

      {mode === 'sets' ? (
        !setGroups ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
            Loading set data…
          </ThemedText>
        ) : (
          setGroups.map((sg) => (
            <View key={sg.series}>
              <ThemedText type="smallBold" style={styles.groupSeries}>
                {sg.series}
              </ThemedText>
              {sg.sets.map((st) => (
                <View key={`${sg.series}|${st.name}`}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.groupSet}>
                    {st.name} · {st.cards.length}
                  </ThemedText>
                  <TileStrip
                    cards={st.cards}
                    placedCounts={placedCounts}
                    selected={selected}
                    onPress={pressTile}
                    scanUrlOf={scanUrlOf}
                  />
                </View>
              ))}
            </View>
          ))
        )
      ) : null}

      {mode === 'portfolios' ? (
        !portfolioGroups ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
            Loading your collections…
          </ThemedText>
        ) : portfolioGroups.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
            No collections yet. Collections you make in <TcgscanLink /> appear here.
          </ThemedText>
        ) : (
          portfolioGroups.map((g) => (
            <View key={g.id}>
              <View style={styles.portfolioHead}>
                <ThemedText type="smallBold" style={styles.groupSeries}>
                  {g.name}
                  <ThemedText type="small" themeColor="textSecondary">
                    {'  '}·{' '}
                    {cardCountLabel(
                      g.cards.reduce((n, c) => n + c.quantity, 0),
                      g.cards.length,
                    )}
                  </ThemedText>
                </ThemedText>
                <Pressable onPress={() => setPfDelete({ id: g.id, name: g.name })} hitSlop={6}>
                  <Text style={styles.portfolioDelete}>Delete</Text>
                </Pressable>
              </View>
              {/* The physical binders inside this collection. One tap opens the confirm; the
                  counts here are the same preview the dialog reads, so they cannot disagree. */}
              {rebuildableBinders
                .filter((b) => b.collectionId === g.id)
                .map((b) => {
                  const r = rebuilds.get(b.id);
                  if (!r) return null;
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => setRebuildUnit(b)}
                      accessibilityRole="button"
                      accessibilityLabel={`Rebuild ${b.name} in michi`}
                      style={({ pressed }) => [styles.rebuildRow, pressed && styles.pressed]}>
                      <Text style={styles.rebuildName} numberOfLines={1}>
                        📒 {b.name}
                      </Text>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.rebuildMeta}>
                        {r.pages.length} page{r.pages.length === 1 ? '' : 's'} · {r.placed} card
                        {r.placed === 1 ? '' : 's'} · {r.rows} × {r.cols}
                        {r.mixedShapes ? ' and other shapes' : ''}
                      </ThemedText>
                      <Text style={styles.rebuildCta}>Rebuild in michi ▸</Text>
                    </Pressable>
                  );
                })}
              <TileStrip
                cards={g.cards}
                placedCounts={placedCounts}
                selected={selected}
                onPress={pressTile}
                scanUrlOf={scanUrlOf}
              />
            </View>
          ))
        )
      ) : null}

      {selected.size > 0 ? (
        <View style={styles.actionRow}>
          {placeableIds.length > 0 ? (
            <Pressable
              onPress={() => setChooser('add')}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
              <Text style={styles.actionBtnText}>
                Add {placeableIds.length} to binder ▸
              </Text>
            </Pressable>
          ) : null}
          {onFindSimilar ? (
            <Pressable
              onPress={() => {
                const ids = [...selected];
                setSelected(new Set());
                setMultiMode(false);
                onFindSimilar(ids);
              }}
              style={({ pressed }) => [styles.actionBtn, styles.reclaimBtn, pressed && styles.pressed]}>
              <Text style={styles.reclaimBtnText}>≈ Find similar</Text>
            </Pressable>
          ) : null}
          {reclaimId ? (
            <Pressable
              onPress={() => setChooser('reclaim')}
              style={({ pressed }) => [styles.actionBtn, styles.reclaimBtn, pressed && styles.pressed]}>
              <Text style={styles.reclaimBtnText}>Reclaim ▸</Text>
            </Pressable>
          ) : null}
          {placeableIds.length === 0 && !reclaimId && !onFindSimilar ? (
            <ThemedText type="small" themeColor="textSecondary">
              No free copies to place.
            </ThemedText>
          ) : null}
          <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Clear
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {actionCard ? (
        <CollectionCardModal
          card={actionCard}
          free={freeOf(actionCard)}
          placed={placedCounts.get(actionCard.cardId) ?? 0}
          catalogCard={catalog?.getCard(actionCard.cardId)}
          onAddToBinder={() => {
            setSelected(new Set([actionCard.cardId]));
            setActionCard(null);
            setChooser('add');
          }}
          onFindSimilar={
            onFindSimilar
              ? () => {
                  const id = actionCard.cardId;
                  setActionCard(null);
                  onFindSimilar([id]);
                }
              : undefined
          }
          onViewSet={
            onViewSet
              ? () => {
                  const id = actionCard.cardId;
                  setActionCard(null);
                  onViewSet(id);
                }
              : undefined
          }
          onReclaim={
            (placedCounts.get(actionCard.cardId) ?? 0) > 0
              ? () => {
                  setSelected(new Set([actionCard.cardId]));
                  setActionCard(null);
                  setChooser('reclaim');
                }
              : undefined
          }
          onClose={() => setActionCard(null)}
        />
      ) : null}

      {bulkOpen && selected.size > 0 ? (
        <CollectionBulkModal
          cardIds={[...selected]}
          placeable={placeableIds.length}
          onAdd={placeableIds.length > 0 ? () => {
            setBulkOpen(false);
            setChooser('add');
          } : undefined}
          onFindSimilar={
            onFindSimilar
              ? () => {
                  const ids = [...selected];
                  setBulkOpen(false);
                  setSelected(new Set());
                  onFindSimilar(ids);
                }
              : undefined
          }
          onReclaim={reclaimId ? () => {
            setBulkOpen(false);
            setChooser('reclaim');
          } : undefined}
          onClose={() => {
            setBulkOpen(false);
            setSelected(new Set());
          }}
        />
      ) : null}

      {chooser === 'add' ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setChooser(null)}>
          <Pressable style={styles.backdrop} onPress={() => setChooser(null)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.chooserWrap}>
              <ThemedView type="backgroundElement" style={styles.chooser}>
                <ThemedText type="smallBold" style={styles.chooserTitle}>
                  Add {placeableIds.length} card{placeableIds.length === 1 ? '' : 's'} to…
                </ThemedText>
                {store.userBinders.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => addTo(b.id)}
                    style={({ pressed }) => [styles.chooserRow, pressed && styles.pressed]}>
                    <ThemedText type="small" numberOfLines={1}>
                      {b.title}
                    </ThemedText>
                  </Pressable>
                ))}
                <Pressable
                  onPress={addToNew}
                  style={({ pressed }) => [styles.chooserRow, pressed && styles.pressed]}>
                  <Text style={styles.chooserNew}>+ New binder</Text>
                </Pressable>
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <ConfirmDialog
        spec={
          pfDelete
            ? {
                title: `Delete “${pfDelete.name}”?`,
                message:
                  'This removes the collection and its cards from your inventory. Cards already placed in a binder stay in their pockets, but they no longer count as owned unless another collection still has a copy. This can’t be undone.',
                confirmLabel: 'Delete',
                destructive: true,
                // The bundled "Example cards (safe to delete)" portfolio deletes immediately; a
                // real portfolio the user built still requires typing its name to confirm.
                requireText: pfDelete.name === EXAMPLE_COLLECTION_NAME ? undefined : pfDelete.name,
                onConfirm: runDeletePortfolio,
              }
            : null
        }
        onClose={() => setPfDelete(null)}
      />

      {/* Which of your copies goes in - opened from the collection's own add, where the card is
          already yours and only the copy is undecided. */}
      {copyChoice ? (
        <CopyPickerSheet
          visible
          cardId={copyChoice.cardId}
          copies={copyChoice.copies}
          onClose={() => setCopyChoice(null)}
          onPick={(entryId) => {
            const c = copyChoice;
            setCopyChoice(null);
            addTo(c.binderId, [entryId ?? undefined]);
          }}
        />
      ) : null}

      <ConfirmDialog
        spec={
          rebuildUnit && rebuilds.get(rebuildUnit.id)
            ? {
                title: `Rebuild “${rebuildUnit.name}” in michi?`,
                message: rebuildMessage(
                  rebuilds.get(rebuildUnit.id) as RebuildResult,
                  maxPages,
                ),
                confirmLabel: 'Rebuild binder',
                onConfirm: runRebuild,
              }
            : null
        }
        onClose={() => setRebuildUnit(null)}
      />

      {pickerOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.pickerWrap}>
              <ThemedView type="backgroundElement" style={styles.picker}>
                <View style={styles.pickerHead}>
                  <ThemedText type="smallBold">Build from which collections?</ThemedText>
                  <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
                    <ThemedText type="link" themeColor="textSecondary">
                      Close
                    </ThemedText>
                  </Pressable>
                </View>
                {!buildGroups ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
                    Loading your collections…
                  </ThemedText>
                ) : buildGroups.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyNote}>
                    Nothing left to place. Every owned copy is already in a binder.
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.pickerSub}>
                      Pick one or more collections. We’ll draft a binder from their unplaced cards.
                    </ThemedText>
                    <Pressable onPress={toggleAllCollections} hitSlop={6} style={styles.pickerSelectAll}>
                      <Text style={styles.pickerSelectAllText}>
                        {allCollectionsSelected ? 'Clear all' : 'Select all'}
                      </Text>
                    </Pressable>
                    <ScrollView style={styles.pickerList}>
                      {buildGroups.map((g) => {
                        const on = !excludedCollections.has(g.id);
                        return (
                          <Pressable
                            key={g.id}
                            onPress={() => toggleCollection(g.id)}
                            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                            <View style={[styles.check, on && styles.checkOn]}>
                              {on ? <Text style={styles.checkMark}>✓</Text> : null}
                            </View>
                            <View style={styles.rowText}>
                              <ThemedText type="smallBold" numberOfLines={1}>
                                {g.name}
                                <ThemedText type="small" themeColor="textSecondary">
                                  {'  '}· {g.copies} card{g.copies === 1 ? '' : 's'}
                                </ThemedText>
                              </ThemedText>
                            </View>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <Pressable
                      onPress={confirmPicker}
                      disabled={selectedBuildCards.size === 0}
                      style={({ pressed }) => [
                        styles.buildChip,
                        styles.pickerConfirm,
                        (pressed || selectedBuildCards.size === 0) && styles.pressed,
                      ]}>
                      <Text style={styles.buildChipText}>
                        Continue · {selectedCopyCount} card{selectedCopyCount === 1 ? '' : 's'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <BuildBinderSheet
        visible={wizardOpen}
        freeCards={buildCards ?? allFreeCards}
        asDemo={exampleFlow}
        onClose={() => setWizardOpen(false)}
        onBuilt={(binderId, pageCount) => {
          onToast?.(
            exampleFlow
              ? `Step 3 of 3 · Built ${pageCount} page${pageCount === 1 ? '' : 's'}. Here is your first binder, curated from your collection.`
              : `Built ${pageCount} page${pageCount === 1 ? '' : 's'} from your collection`,
          );
          onExampleDone?.();
          onOpenBinder?.(binderId);
        }}
      />

      <ImportCsvSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(name, cardCount, copies) => {
          setPortfolios(null); // the new portfolio appears on the next Portfolios view
          onToast?.(`Imported ${copies} cop${copies === 1 ? 'y' : 'ies'} into “${name}”`);
        }}
      />

      {chooser === 'reclaim' ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setChooser(null)}>
          <Pressable style={styles.backdrop} onPress={() => setChooser(null)}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.chooserWrap}>
              <ThemedView type="backgroundElement" style={styles.chooser}>
                <ThemedText type="smallBold" style={styles.chooserTitle}>
                  Reclaim one copy from…
                </ThemedText>
                {reclaimSources.map(({ binder, count }) => (
                  <Pressable
                    key={binder.id}
                    onPress={() => reclaimFrom(binder.id)}
                    style={({ pressed }) => [styles.chooserRow, pressed && styles.pressed]}>
                    <ThemedText type="small" numberOfLines={1}>
                      {binder.title}
                      <ThemedText type="small" themeColor="textSecondary">
                        {'  '}· {count} placed
                      </ThemedText>
                    </ThemedText>
                  </Pressable>
                ))}
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </HomeSection>
  );
}

/**
 * One strip of tiles — the building block of every view mode. A paging CAROUSEL when the tiles
 * overflow the width (‹ › arrows that wrap, dots, wheel paging on web — the BinderCarousel
 * pattern); a plain row when everything fits.
 */
function TileStrip({
  cards,
  placedCounts,
  selected,
  onPress,
  scanUrlOf,
}: {
  cards: UserCard[];
  placedCounts: Map<string, number>;
  selected: Set<string>;
  onPress: (card: UserCard) => void;
  /** Real-scan lookup while the chip is on; tiles fall back to catalog art per-URL on error. */
  scanUrlOf?: (cardId: string) => string | undefined;
}) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);
  const gap = Spacing.two;

  // Whole tiles per page from the measured width; each page spans exactly the container so
  // paging snaps cleanly.
  const perPage = width > 0 ? Math.max(2, Math.floor((width + gap) / (TILE_W + gap))) : 2;
  const pages: UserCard[][] = [];
  for (let i = 0; i < cards.length; i += perPage) pages.push(cards.slice(i, i + perPage));
  const pageCount = pages.length;
  const safePage = Math.min(page, Math.max(0, pageCount - 1));

  const goTo = (p: number) => {
    if (pageCount === 0) return;
    const next = ((p % pageCount) + pageCount) % pageCount; // wrap both directions
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  // Web: wheel pages the strip; at either end it falls through to normal page scroll.
  useEffect(() => {
    if (Platform.OS !== 'web' || pageCount <= 1 || width === 0) return;
    const el = containerRef.current as unknown as HTMLElement | null;
    if (!el) return;
    let cooldown = -Infinity;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 2) return;
      const next = safePage + (delta > 0 ? 1 : -1);
      if (next < 0 || next >= pageCount) return;
      e.preventDefault();
      if (e.timeStamp - cooldown < 300) return;
      cooldown = e.timeStamp;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setPage(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [safePage, pageCount, width]);

  return (
    <View ref={containerRef} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}>
        {width > 0 &&
          pages.map((pg, pi) => (
            <View key={pi} style={[styles.carouselPage, { width, gap }]}>
              {pg.map((item) => (
                <CardTile
                  key={`${item.cardId}|${item.condition}`}
                  card={item}
                  placed={placedCounts.get(item.cardId) ?? 0}
                  selected={selected.has(item.cardId)}
                  onPress={() => onPress(item)}
                  scanUri={scanUrlOf?.(item.cardId)}
                />
              ))}
            </View>
          ))}
      </ScrollView>

      {pageCount > 1 ? (
        <>
          <Pressable
            onPress={() => goTo(safePage - 1)}
            hitSlop={8}
            accessibilityLabel="Previous cards"
            style={[styles.carouselArrow, styles.carouselArrowLeft]}>
            <Text style={styles.carouselArrowText}>‹</Text>
          </Pressable>
          <Pressable
            onPress={() => goTo(safePage + 1)}
            hitSlop={8}
            accessibilityLabel="More cards"
            style={[styles.carouselArrow, styles.carouselArrowRight]}>
            <Text style={styles.carouselArrowText}>›</Text>
          </Pressable>
          <View style={styles.carouselDots}>
            {pages.map((_, i) => (
              <View key={i} style={[styles.carouselDot, i === safePage && styles.carouselDotActive]} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * The browser-style card sheet for a collection tile: image, metadata (once the catalog is in),
 * inventory line, then Add to a binder… / ≈ Find similar / View set / Reclaim… / Cancel.
 */
function CollectionCardModal({
  card,
  free,
  placed,
  catalogCard,
  onAddToBinder,
  onFindSimilar,
  onViewSet,
  onReclaim,
  onClose,
}: {
  card: UserCard;
  free: number;
  placed: number;
  catalogCard?: { name: string; setName: string; number: string; rarity: string; stage: string } | null;
  onAddToBinder: () => void;
  onFindSimilar?: () => void;
  onViewSet?: () => void;
  onReclaim?: () => void;
  onClose: () => void;
}) {
  const uri = cardThumbUrl(card.cardId, 245);
  const meta = catalogCard
    ? [catalogCard.setName, catalogCard.number].filter(Boolean).join(' · ')
    : 'Loading card details…';
  const sub = catalogCard
    ? [catalogCard.rarity, catalogCard.stage].filter(Boolean).join(' · ')
    : '';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardModalWrap}>
          <ThemedView type="backgroundElement" style={styles.cardModal}>
            <View style={styles.cardModalImageWrap}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.cardModalImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={100}
                  draggable={false}
                />
              ) : null}
            </View>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.cardModalTitle}>
              {catalogCard?.name ?? `Card ${card.cardId}`}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {meta}
            </ThemedText>
            {sub ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {sub}
              </ThemedText>
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              You own {card.quantity} · {free} free to place
              {placed > 0 ? ` · ${placed} in binders` : ''}
            </ThemedText>

            <Pressable
              onPress={onAddToBinder}
              disabled={free === 0}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.cardModalBtn,
                (pressed || free === 0) && styles.pressed,
              ]}>
              <Text style={styles.actionBtnText}>
                {free === 0 ? 'No free copies to place' : 'Add to a binder…'}
              </Text>
            </Pressable>
            {onFindSimilar ? (
              <Pressable
                onPress={onFindSimilar}
                style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
                <Text style={styles.cardModalSecondaryText}>≈ Find similar</Text>
              </Pressable>
            ) : null}
            {onViewSet ? (
              <Pressable
                onPress={onViewSet}
                style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
                <Text style={styles.cardModalSecondaryText}>View set</Text>
              </Pressable>
            ) : null}
            {onReclaim ? (
              <Pressable
                onPress={onReclaim}
                style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
                <Text style={styles.cardModalSecondaryText}>Reclaim from a binder…</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
              <Text style={styles.cardModalCancel}>Cancel</Text>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Bulk-action sheet shown when multi-select ends with cards chosen: a thumbnail strip of the
 * selection + the same verbs as the inline action bar (Add to a binder / Find similar / Reclaim).
 * Each action is omitted when it doesn't apply (no free copies → no Add, etc.).
 */
function CollectionBulkModal({
  cardIds,
  placeable,
  onAdd,
  onFindSimilar,
  onReclaim,
  onClose,
}: {
  cardIds: string[];
  placeable: number;
  onAdd?: () => void;
  onFindSimilar?: () => void;
  onReclaim?: () => void;
  onClose: () => void;
}) {
  const shown = cardIds.slice(0, 6);
  const extra = cardIds.length - shown.length;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardModalWrap}>
          <ThemedView type="backgroundElement" style={styles.cardModal}>
            <ThemedText type="smallBold" style={styles.cardModalTitle}>
              {cardIds.length} card{cardIds.length === 1 ? '' : 's'} selected
            </ThemedText>
            <View style={styles.bulkThumbs}>
              {shown.map((id) => (
                <Image
                  key={id}
                  source={{ uri: cardThumbUrl(id, 245) }}
                  style={styles.bulkThumb}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={80}
                  draggable={false}
                />
              ))}
              {extra > 0 ? (
                <View style={[styles.bulkThumb, styles.bulkMore]}>
                  <Text style={styles.bulkMoreText}>+{extra}</Text>
                </View>
              ) : null}
            </View>

            {onAdd ? (
              <Pressable
                onPress={onAdd}
                style={({ pressed }) => [styles.actionBtn, styles.cardModalBtn, pressed && styles.pressed]}>
                <Text style={styles.actionBtnText}>
                  Add {placeable} to a binder…
                </Text>
              </Pressable>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.bulkNote}>
                None of these have a free copy left to place.
              </ThemedText>
            )}
            {onFindSimilar ? (
              <Pressable
                onPress={onFindSimilar}
                style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
                <Text style={styles.cardModalSecondaryText}>≈ Find similar</Text>
              </Pressable>
            ) : null}
            {onReclaim ? (
              <Pressable
                onPress={onReclaim}
                style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
                <Text style={styles.cardModalSecondaryText}>Reclaim from a binder…</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.cardModalSecondary, pressed && styles.pressed]}>
              <Text style={styles.cardModalCancel}>Cancel</Text>
            </Pressable>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CardTile({
  card,
  placed,
  selected,
  onPress,
  scanUri,
}: {
  card: UserCard;
  placed: number;
  selected: boolean;
  onPress: () => void;
  /** The card's real scan; tried first, falls back to the catalog thumb on error. */
  scanUri?: string;
}) {
  // Per-URL failure memo: a scan whose upload has not landed (or never will) drops this tile
  // back to catalog without a retry loop; a NEW scan URL gets a fresh chance automatically.
  const [brokenScan, setBrokenScan] = useState<string | null>(null);
  const useScan = !!scanUri && scanUri !== brokenScan;
  const uri = useScan ? scanUri! : cardThumbUrl(card.cardId, 245);
  const free = Math.max(0, card.quantity - placed);
  const exhausted = free === 0;
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${free} of ${card.quantity} copies free to place`}>
      <View style={[styles.imageWrap, selected && styles.imageWrapSelected]}>

        {uri ? (
          <Image
            // Keyed by uri so the scan → catalog swap remounts: a stale onError from the aborted
            // request must not march the fresh image (same fix as the binder grid's CardImage).
            key={uri}
            source={{ uri }}
            style={[
              styles.image,
              exhausted && styles.imageExhausted,
              // Web: desaturate exhausted cards ("nothing left to place"). No-op on native.
              exhausted && Platform.OS === 'web' ? ({ filter: 'grayscale(1)' } as object) : null,
            ]}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={useScan ? `${card.cardId}:scan` : card.cardId}
            transition={100}
            draggable={false}
            onError={useScan ? () => setBrokenScan(scanUri!) : undefined}
          />
        ) : (
          <CardPlaceholder radius={Radius.control} />
        )}
        <View style={[styles.countBadge, exhausted && styles.countBadgeExhausted]}>
          <Text style={styles.countText}>
            {free}/{card.quantity}
          </Text>
        </View>
        {selected ? (
          <View style={styles.checkBadge}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carouselPage: { flexDirection: 'row', paddingVertical: Spacing.one },
  carouselArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.scrim40,
  },
  carouselArrowLeft: { left: 2 },
  carouselArrowRight: { right: 2 },
  carouselArrowText: { color: Palette.white, fontSize: FontSize.nav, lineHeight: 28, fontWeight: Weight.semibold },
  carouselDots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, marginTop: 2 },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.hairlineStrong },
  carouselDotActive: { backgroundColor: Palette.accent },
  tile: { width: TILE_W },
  pressed: { opacity: 0.8 },
  imageWrap: {
    width: TILE_W,
    height: TILE_W * CARD_ASPECT,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  imageWrapSelected: { borderColor: Palette.accent },
  image: { width: '100%', height: '100%' },
  imageExhausted: { opacity: 0.45 },
  countBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Palette.scrim62,
  },
  countBadgeExhausted: { backgroundColor: Palette.scrim45 },
  countText: { color: Palette.white, fontSize: FontSize.xs, fontWeight: Weight.bold },
  checkBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: Palette.accentText, fontSize: FontSize.xs, fontWeight: Weight.bold },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  actionBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  actionBtnText: { color: Palette.accentText, fontSize: FontSize.control, fontWeight: Weight.semibold },
  reclaimBtn: { backgroundColor: Palette.panel },
  reclaimBtnText: { color: Palette.ink2, fontSize: FontSize.control, fontWeight: Weight.semibold },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  buildChip: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
  },
  buildChipText: { color: Palette.accentText, fontSize: FontSize.sm, fontWeight: Weight.semibold },
  backdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  chooserWrap: { width: '100%', maxWidth: 360 },
  chooser: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.one },
  chooserTitle: { marginBottom: Spacing.two },
  chooserRow: { paddingVertical: Spacing.two },
  chooserNew: { color: Palette.accent, fontSize: FontSize.control, fontWeight: Weight.semibold },
  pickerWrap: { width: '100%', maxWidth: 420 },
  picker: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.two, maxHeight: '100%' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerSub: { lineHeight: 18 },
  pickerSelectAll: { alignSelf: 'flex-end' },
  pickerSelectAllText: { color: Palette.accent, fontSize: FontSize.sm, fontWeight: Weight.semibold },
  pickerList: { maxHeight: 320 },
  pickerConfirm: { alignItems: 'center', marginTop: Spacing.one, paddingVertical: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  rowText: { flex: 1, gap: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  checkMark: { color: Palette.accentText, fontSize: FontSize.sm, fontWeight: Weight.bold },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  // Pushed to the far end of its row, away from the controls used every visit.
  importChip: { marginLeft: 'auto' },
  search: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: FontSize.control,
    color: Palette.ink,
  },
  emptyNote: { paddingVertical: Spacing.two },
  emptyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three },
  emptyRowText: { flexShrink: 1, minWidth: 220 },
  guideBanner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.control,
    borderLeftWidth: 3,
    borderLeftColor: Palette.accent,
    backgroundColor: Palette.panel,
  },
  guideText: { flex: 1, minWidth: 200, color: Palette.accent, fontSize: FontSize.sm, lineHeight: 18, fontWeight: Weight.semibold },
  portfolioHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  portfolioDelete: { color: Palette.danger, fontSize: FontSize.sm, fontWeight: Weight.semibold },
  rebuildRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  rebuildName: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  rebuildMeta: { flexShrink: 1 },
  rebuildCta: {
    marginLeft: 'auto',
    fontSize: FontSize.sm,
    fontWeight: Weight.semibold,
    color: Palette.accent,
  },
  groupSeries: { marginTop: Spacing.three },
  groupSet: { marginTop: Spacing.one },
  cardModalWrap: { width: '100%', maxWidth: 320 },
  cardModal: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.two },
  cardModalImageWrap: { alignItems: 'center' },
  cardModalImage: { width: 180, height: 180 * CARD_ASPECT },
  cardModalTitle: { marginTop: Spacing.one },
  cardModalBtn: { alignItems: 'center', marginTop: Spacing.two },
  cardModalSecondary: {
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  cardModalSecondaryText: { color: Palette.accent, fontSize: FontSize.control, fontWeight: Weight.semibold },
  cardModalCancel: { color: Palette.muted, fontSize: FontSize.control, fontWeight: Weight.semibold },
  bulkThumbs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two, marginVertical: Spacing.one },
  bulkThumb: { width: 44, height: 44 * CARD_ASPECT, borderRadius: Radius.control, backgroundColor: Palette.panel, overflow: 'hidden' },
  bulkMore: { alignItems: 'center', justifyContent: 'center' },
  bulkMoreText: { color: Palette.ink2, fontSize: FontSize.sm, fontWeight: Weight.bold },
  bulkNote: { textAlign: 'center', marginTop: Spacing.two },
});
