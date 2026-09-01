/**
 * The one binder page-browsing surface, shared by every place a binder is shown — the owner's
 * editor and inspector (`BinderScreen`) and the public shared-link viewer (`app/binder/[id]`).
 *
 * It owns the *browsing mechanics* — the ‹ Page X/N › arrows, the wide-screen prev · current ·
 * next spread, the tappable page filmstrip, and the Card-labels toggle — so all surfaces navigate
 * a binder identically. What differs per mode (edit vs inspect vs read-only) is only what each
 * page's grid *does*, which the caller supplies through `renderGrid(role)`:
 *   - inspect / public → a read-only <BinderGrid>; neighbours become tap-to-flip targets.
 *   - edit            → an editable <BinderGrid> wired for slot editing + cross-page drag, and
 *                       `onReorderPages` enables drag-to-reorder in the filmstrip.
 */
import { Image } from 'expo-image';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { CaptionControls, CaptionFieldRow } from '@/components/binder/CaptionControls';
import {
  SingleTurnLeaf,
  TURN_EASING,
  TURN_MS,
  TurnLeaf,
  turnReduced,
} from '@/components/binder/pageTurn';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { PageStrip } from '@/components/binder/PageStrip';
import { ThemedText } from '@/components/themed-text';

import { pillChip } from '@/constants/ui';
import { hasTextCaption, type CaptionFieldKey } from '@/data/cardCaption';
import { PEEK_MIN_WIDTH, SPREAD_GAP, bookLayout, pageHeightAt, spreadLayout } from '@/data/binderLayout';
import { useCardLabelPrefs } from '@/hooks/use-card-label-prefs';
import { cardThumbUrl } from '@/lib/catalogConfig';
import type { DemoBinder, DemoPage, DemoSlot } from '@/data/binderTypes';
import { allocateScanFaces } from '@/data/scanFaces';
import { useOwnedCards } from '@/hooks/use-owned-cards';
import { useScanImages } from '@/hooks/use-scan-images';
import { useTheme } from '@/hooks/use-theme';

/** Which slot a rendered grid occupies — lets the caller wire the right handlers/refs per grid.
 *  'partner' is the facing page of a double-sided spread: fully interactive in edit mode (the
 *  first touch makes it the active page), read-only otherwise. */
export type GridRole = 'single' | 'prev' | 'current' | 'next' | 'partner';

// Session-wide preference: real binders are double-sided, so remember the reader's choice
// across binder opens (module state, like the browse state — deliberately not persisted).
// RN's style types only admit 'absolute' | 'relative'; sticky is a web-only value that react-native-web
// passes straight through to CSS. Declared once here so the cast has a name and a reason.
const WEB_STICKY = { position: 'sticky', bottom: 0, zIndex: 5 };

let doubleSidedPref = false;

export interface BinderPagesProps {
  binder: DemoBinder;
  /** Caller-owned current page (clamped here for display). */
  pageIndex: number;
  onPageChange: (index: number) => void;
  /** Usable content width (viewport minus horizontal padding) — drives the spread breakpoint. */
  availableWidth: number;
  /**
   * Vertical space the CALLER stacks above this component — its own header, and in the editor the
   * title fields and tools card. What this component itself adds (page details, the pills, the
   * filmstrip) is measured, not guessed, so this covers only what it cannot see.
   */
  chromeAllowance?: number;
  /** A hard ceiling on page width, for surfaces that need one. Unset means fill the space. */
  maxWidth?: number;
  /** Edit vs inspect: read-only neighbours flip on tap; editable ones stay drag surfaces. */
  editable: boolean;
  /** Build the <BinderGrid> for one slot of the layout — the single per-mode difference. */
  renderGrid: (args: {
    page: DemoPage;
    width: number;
    role: GridRole;
    captionFields: CaptionFieldKey[];
    ownedIds?: ReadonlySet<string>;
    /** Real-scan lookup while the Scans pill is on (owner-only; see useScanImages). */
    scanUrlOf?: (slot: DemoSlot) => string | undefined;
    /**
     * A COPY DRAWN FOR THE PAGE TURN, not the page itself. It must be inert and read-only: the
     * editor's grids attach refs (prevRef / nextRef) and register drag surfaces, so a second live
     * copy of the same page silently steals the ref the editor is holding — which is why turning
     * misbehaved only in one's OWN binders and looked fine in everyone else's.
     *
     * It also asks for no image fade-in: the copy is of a page already on screen.
     */
    decorative?: boolean;
  }) => ReactNode;
  /**
   * Does the person looking at this own it? Gates the Real-scans pill, and defaults to FALSE so
   * a call site that forgets it shows catalog art rather than the wrong person's photos.
   *
   * The lookup behind the pill (useScanImages) reads the VIEWER's own portfolio under owner-RLS
   * and knows nothing about whose binder is on screen, so on a stranger's public binder it would
   * happily paint the viewer's photos into the owner's pockets. Nothing leaks today only because
   * the public viewer's renderGrid drops the prop; that is a call site remembering, not a
   * guarantee. This makes it one.
   */
  viewerIsOwner?: boolean;
  /** Enables drag-to-reorder in the filmstrip (edit only). Omit → tap-to-jump only. */
  onReorderPages?: (from: number, to: number) => void;
  /** Optional override for the per-page title/description area (edit passes text inputs here);
   *  omit to show the page's title/description read-only. */
  pageHeader?: ReactNode;
  /** Shared "which spread column is mid-drag" value, so that column lifts above its neighbours
   *  (edit only). Omit on read-only surfaces. */
  dragCol?: SharedValue<number>;
}

export function BinderPages({
  binder,
  pageIndex,
  onPageChange,
  availableWidth,
  chromeAllowance = 96,
  maxWidth,
  editable,
  viewerIsOwner = false,
  renderGrid,
  onReorderPages,
  pageHeader,
  dragCol,
}: BinderPagesProps) {
  // Remembered per account (and per device for guests) rather than reset on every visit — see
  // use-card-label-prefs. Which labels you want on a card is a settled preference, not a decision
  // to re-make each time you open a binder.
  const {
    on: labelsOn,
    fields: labelFields,
    setOn: setLabelsOn,
    toggleField: toggleLabelField,
  } = useCardLabelPrefs();
  const captionFields = labelsOn ? labelFields : [];
  // The viewer's owned cards → an optional green ✓ on card slots they own. Undefined for guests /
  // empty inventory (the "Owned" pill then stays hidden). Off by default; the pill flips it.
  const ownedCards = useOwnedCards();
  const [showOwned, setShowOwned] = useState(false);
  const ownedIds = showOwned ? ownedCards : undefined;
  // Real scans: card pockets show the owner's own photo of each card instead of catalog art.
  // Session-only like the other pills; the map is undefined for guests, for accounts with no
  // scanned lots, and for anyone who does not own this binder (see viewerIsOwner), which hides
  // the pill entirely rather than offering a toggle that would show the wrong person's photos.
  const ownScans = useScanImages();
  const scanImages = viewerIsOwner ? ownScans : undefined;
  const [showScans, setShowScans] = useState(false);
  // ALLOCATED, not looked up: a stamped pocket wears its own copy's photo, an unclaimed pocket
  // draws from the card's photos no other pocket is wearing, and when those run out it shows
  // catalog art. Binder-wide (all pages at once) so two pages cannot both spend the same photo,
  // and so the binder never presents more scans of a card than the user owns — the old
  // newest-per-card fallback put the same photo on every claimless copy, in unlimited number.
  // See scanFaces.ts for the full doctrine.
  const scanFaces = useMemo(() => {
    if (!showScans || !scanImages) return undefined;
    return allocateScanFaces(binder.pages.flatMap((p) => p.slots), scanImages.copiesByCard);
  }, [showScans, scanImages, binder]);
  const scanUrlOf = scanFaces ? (slot: DemoSlot) => scanFaces.get(slot.id) : undefined;
  // Double-sided: pages pair like a physical binder — page 1 alone (the cover face), then
  // 2·3 facing, 4·5, … Both sides of the open spread are shown (and edited) together.
  const [doubleSidedWanted, setDoubleSided] = useState(doubleSidedPref);
  const toggleDoubleSided = () =>
    setDoubleSided((v) => {
      doubleSidedPref = !v;
      return !v;
    });

  const count = binder.pages.length;
  const idx = Math.max(0, Math.min(pageIndex, count - 1));
  const page = binder.pages[idx];

  // THE PAGE TAKES THE SPACE. It used to get one equal third of the width while its two dimmed
  // neighbours took the other two — so the page being edited was the smallest live thing on a 4K
  // screen. Now the neighbours are narrow peeks of the real adjacent page and everything left
  // over belongs to the page you are actually looking at. See data/binderLayout.ts.
  //
  // The height budget is what stops that becoming a different bug: a 3x3 at 900px wide is over
  // 1200px tall, so a width-only fit would push the bottom row under the fold on the very laptops
  // this is meant to help. The page is sized by whichever runs out first.
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  // What the chrome inside this component actually costs, reported by onLayout below. Rounded and
  // only accepted on a real change, so a sub-pixel wobble cannot start a measure/render loop: the
  // page's own height never feeds back into these two, since both sit outside it.
  const [chromeAbove, setChromeAboveRaw] = useState(0);
  const [stripHeight, setStripHeightRaw] = useState(0);
  const setChromeAbove = (h: number) =>
    setChromeAboveRaw((cur) => (Math.abs(cur - h) > 2 ? Math.round(h) : cur));
  const setStripHeight = (h: number) =>
    setStripHeightRaw((cur) => (Math.abs(cur - h) > 2 ? Math.round(h) : cur));
  // chromeAllowance covers what the CALLER stacks above this component (its header, and in the
  // editor the title fields and tools card); the two measurements cover what this one adds.
  const heightBudget = Math.max(0, windowHeight - chromeAllowance - chromeAbove - stripHeight);
  const captionsOn = hasTextCaption(captionFields);
  const spreadGap = SPREAD_GAP;
  // THE BOOK NEEDS A FLOOR OF ITS OWN. Halving the width is only a good trade while both halves
  // stay readable: on a 390px phone it yields two 171px pages, whose cards come out around 51px —
  // thumbnails, not artwork. Nothing stopped that, because the book path had no width gate at all.
  // Below the threshold the pages are shown one at a time and the toggle is not offered, which is
  // the honest answer on a screen that cannot hold a spread.
  const canDoubleSide = availableWidth >= PEEK_MIN_WIDTH;
  const doubleSided = doubleSidedWanted && canDoubleSide;
  // Peeks need room for a page AND two strips; below that the page goes it alone, as on a phone.
  const showSpread = !doubleSided && count > 1 && availableWidth >= PEEK_MIN_WIDTH;
  const layout = spreadLayout({
    availableWidth,
    availableHeight: heightBudget,
    rows: page.rows,
    cols: page.cols,
    captionsOn,
    hasNeighbours: showSpread,
    maxWidth,
  });
  const pageWidth = layout.pageWidth;
  const spreadWidth = pageWidth;
  const peekWidth = layout.peekWidth;
  const showPeeks = layout.showPeeks;

  /**
   * THE PAGE TURNS ON A HINGE, over the top of the settled spread.
   *
   * This used to slide the whole spread in from the side (SlideInRight/SlideInLeft), which read as
   * lifting the binder away and sliding a different one back — the same complaint the landing
   * binder had. The turn is drawn as an OVERLAY rather than by restructuring this render: the page
   * beneath stays exactly the surface it already is, so drag targets, drop zones and the editor's
   * hit-testing are untouched by an animation that is purely something to look at.
   *
   * `pageTurn` holds the pages the leaf is between. They are captured at the moment the index
   * changes, because by the time the animation runs, `binder.pages[oldIdx]` is still correct but
   * WHICH page was on screen is not recoverable from the new index alone.
   */
  const [pageTurn, setPageTurn] = useState<{
    fromLeft: DemoPage | null;
    fromRight: DemoPage | null;
    fromPage: DemoPage | null;
    forward: boolean;
  } | null>(null);
  const turnT = useSharedValue(0);
  /** The page the last turn was built for. State, not a ref: this is read DURING render. */
  const [turnedAt, setTurnedAt] = useState(idx);

  // MOUNTED IN THE SAME COMMIT AS THE PAGE CHANGE, not in an effect afterwards. An effect runs
  // after the browser has painted, so for one frame the reader saw the destination spread bare —
  // the "render flash on page turn start" in the report. Deriving it during render means the
  // overlay is present in the very first commit that shows the new page, so there is no frame in
  // which the new spread is visible uncovered. Same adjust-state-during-render pattern the page
  // direction used before it, and state rather than a ref because the React Compiler (correctly)
  // refuses a ref read at render time.
  if (turnedAt !== idx) {
    const from = turnedAt;
    setTurnedAt(idx);
    // NO TURN WHEN THE PAGE IS ALREADY IN FRONT OF YOU. Tapping the facing half of an open spread
    // moves the active page but turns nothing over — both pages stay exactly where they are — so
    // animating a sheet there was pure invention. A spread is identified by its left-hand index.
    const spreadOf = (i: number) => (i === 0 ? 0 : i % 2 === 1 ? i : i - 1);
    const sameSpread = doubleSided && spreadOf(from) === spreadOf(idx);
    if (count > 1 && !turnReduced() && !sameSpread) {
      const fromLeftIdx = from === 0 ? -1 : from % 2 === 1 ? from : from - 1;
      const fromRightIdx = from === 0 ? 0 : fromLeftIdx + 1 < count ? fromLeftIdx + 1 : -1;
      setPageTurn({
        fromLeft: fromLeftIdx >= 0 ? binder.pages[fromLeftIdx] : null,
        fromRight: fromRightIdx >= 0 ? binder.pages[fromRightIdx] : null,
        fromPage: binder.pages[from] ?? null,
        forward: idx > from,
      });
    } else {
      setPageTurn(null);
    }
  }

  /**
   * RUN THE HINGE, BEFORE THE BROWSER PAINTS, WHICH IS THE WHOLE POINT.
   *
   * turnT is left wherever the last turn stopped, which for a turn that ran to the end is 1. This
   * used to reset it in a plain useEffect, and a plain effect runs AFTER the paint. So the first
   * painted frame of every turn was drawn at t=1: the leaf already flipped over onto the far page,
   * showing the wrong face, with the base halves already swapped under it. One frame of the END of
   * the animation, at the START of it, every single time.
   *
   * That is the flash. It was never the images, which is why silencing skeletons and fades did
   * nothing for it, and it is why turning pages FASTER looked better: an interrupted turn catches
   * turnT mid-arc and still being driven, so its stale frame is a few degrees out rather than a
   * completed flip. It is also the "page rendered in its final spot before the turn finished" from
   * earlier, the same single frame seen from the other side.
   *
   * useLayoutEffect runs synchronously after the commit and before the paint, so the reset lands in
   * the same frame the overlay first appears in, and there is no longer a frame in which the end of
   * the arc can be seen at the start of it.
   *
   * It is left stranded at 1 between turns, deliberately: nothing is bound to it while the leaf is
   * unmounted, and an idle reset is both pointless and rejected by the compiler (a shared value
   * written in an effect that does nothing else reads as modifying an immutable).
   */
  useLayoutEffect(() => {
    if (!pageTurn) return;
    turnT.value = 0;
    turnT.value = withTiming(1, { duration: TURN_MS, easing: TURN_EASING }, (done) => {
      if (done) runOnJS(setPageTurn)(null);
    });
  }, [pageTurn, turnT]);

  /**
   * WARM THE PAGES A TURN WILL REVEAL, so their first mount paints instead of arriving.
   *
   * A turn puts at most two genuinely new pages on screen: the BACK of the sheet being turned, and
   * the page waiting UNDER it. Everything else in the animation is a copy of something already
   * visible, whose bytes are in the memory cache and which now mounts without a fade. These two are
   * the ones that can still flash, because their first mount is also their first decode — so they
   * are fetched during the dwell BEFORE the reader turns, when there is nothing on screen competing
   * for the decoder.
   *
   * A window either side, not just the next spread: readers go backwards too, and a page already in
   * the cache costs nothing to ask for again. Deferred a beat so it never races the images of the
   * page actually being looked at.
   */
  useEffect(() => {
    if (pageTurn) return; // never during a turn: the visible page decodes first
    const t = setTimeout(() => {
      const seen = new Set<string>();
      const urls: string[] = [];
      for (let i = idx - 2; i <= idx + 3; i += 1) {
        const p = binder.pages[i];
        if (!p || i === idx) continue;
        for (const slot of p.slots) {
          // A pocket's picture is either a catalogue card or a piece of the owner's own art.
          const url = slot.cardId ? cardThumbUrl(slot.cardId, 640) : slot.imageUrl;
          if (url && !seen.has(url)) {
            seen.add(url);
            urls.push(url);
          }
        }
      }
      // Best-effort by design: a warm cache is an optimisation, and a failure here must never
      // surface — the image mounts and loads normally, exactly as it did before.
      if (urls.length) Image.prefetch(urls, { cachePolicy: 'memory-disk' }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [idx, binder.pages, pageTurn]);


  const prevPage = idx > 0 ? binder.pages[idx - 1] : null;
  const nextPage = idx < count - 1 ? binder.pages[idx + 1] : null;

  // The open double-sided spread around the active page: [cover] alone, then [odd, odd+1].
  const bookGap = 16;
  // The book never had dimmed neighbours — both halves are live — so its only waste was the
  // ceiling, and fitting the height is the whole of its fix.
  const bookW = bookLayout({
    availableWidth,
    availableHeight: heightBudget,
    rows: page.rows,
    cols: page.cols,
    captionsOn,
    gap: bookGap,
    maxWidth,
  });
  const spreadLeftIdx = idx === 0 ? -1 : idx % 2 === 1 ? idx : idx - 1;
  const spreadRightIdx = idx === 0 ? 0 : spreadLeftIdx + 1 < count ? spreadLeftIdx + 1 : -1;
  const leftPage = spreadLeftIdx >= 0 ? binder.pages[spreadLeftIdx] : null;
  const rightPage = spreadRightIdx >= 0 ? binder.pages[spreadRightIdx] : null;

  // Web: flip pages with the mouse wheel while hovering the page area. Consumes the wheel only
  // when there's a page to move to in that direction — at the first/last page it falls through to
  // the normal vertical scroll, so you can still reach the rest of the editor.
  const pageWrapRef = useRef<View>(null);

  // WHERE A FLIP GOES, shared by every input that can cause one. Double-sided flips by SPREAD:
  // cover → [1·2] → [3·4] → …; single mode flips by page. The wheel, the arrow keys and the swipe
  // must all agree about that, so the rule is written once here rather than per handler.
  const leftOfSpread = idx === 0 ? 0 : idx % 2 === 1 ? idx : idx - 1;
  const forward = doubleSided ? (idx === 0 ? 1 : leftOfSpread + 2) : idx + 1;
  const backward = doubleSided ? (leftOfSpread === 0 ? -1 : Math.max(0, leftOfSpread - 2)) : idx - 1;


  /**
   * SWIPE TO TURN THE PAGE. Until now the only way to change page on a phone was the filmstrip —
   * a row of 58px thumbnails — because the wheel and the arrow keys are both web-only. A binder
   * you cannot turn by hand is the one interaction a binder app has to get right.
   *
   * View mode only. In edit mode a horizontal drag is how a card is moved between pockets, and a
   * gesture cannot be both without one of them feeling stolen; the filmstrip stays the way to flip
   * while editing.
   */
  const swipe = useMemo(() => {
    // Two directional flings raced, rather than one bidirectional fling: the fling event carries
    // no velocity, so the direction has to come from which gesture matched.
    const on = !editable && count > 1;
    const to = (target: number) => {
      'worklet';
      if (target >= 0 && target < count) runOnJS(onPageChange)(target);
    };
    return Gesture.Race(
      Gesture.Fling().enabled(on).direction(Directions.LEFT).onEnd(() => to(forward)),
      Gesture.Fling().enabled(on).direction(Directions.RIGHT).onEnd(() => to(backward)),
    );
  }, [editable, count, forward, backward, onPageChange]);

  useEffect(() => {
    if (Platform.OS !== 'web' || count <= 1 || typeof window === 'undefined') return;
    const el = pageWrapRef.current as unknown as HTMLElement | null;
    if (!el) return;
    let cooldown = -Infinity;
    const onWheel = (e: WheelEvent) => {
      // Flip ONLY when the pointer is directly over a page rectangle (data-binder-page, set on the
      // BinderGrid root). A wheel over the surrounding mat, the gaps between spread columns, or the
      // empty bands beside the centred pages falls straight through to normal editor scrolling.
      let node = e.target as HTMLElement | null;
      let overPage = false;
      while (node && node !== el) {
        if (node.dataset?.binderPage) {
          overPage = true;
          break;
        }
        node = node.parentElement;
      }
      if (!overPage) return;
      const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 2) return;
      const next = delta > 0 ? forward : backward;
      if (next < 0 || next >= count) return; // at an edge → let the editor scroll
      e.preventDefault();
      if (e.timeStamp - cooldown < 300) return; // one page per gesture, not per event
      cooldown = e.timeStamp;
      onPageChange(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [idx, count, doubleSided, onPageChange, forward, backward]);

  return (
    <>
      {/* MEASURED, NOT GUESSED. The height budget was a 320px constant, which is wrong the moment
          a description wraps to three lines or the card-label chips add a row — and being wrong
          pushed the page filmstrip below the fold, so the only way to reach page navigation was to
          scroll, over a surface where the wheel flips pages instead. These two onLayouts report
          what the chrome actually costs. */}
      <View onLayout={(e) => setChromeAbove(e.nativeEvent.layout.height)}>
      {/* Per-page title/description — caller override (edit inputs) or read-only. */}
      {pageHeader ??
        (page && (page.title || page.description) ? (
          <View style={styles.pageDetailsRead}>
            {page.title ? (
              <ThemedText type="smallBold" style={styles.pageTitle}>
                {page.title}
              </ThemedText>
            ) : null}
            {page.description ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.pageDescription}>
                {page.description}
              </ThemedText>
            ) : null}
          </View>
        ) : null)}

      {/* View controls: double-sided (book spreads) + card labels. Page flipping is the
          filmstrip / mouse wheel / neighbour taps / arrow keys — no ‹ m/n › readout. */}
      <View style={styles.labelsRow}>
        <View style={styles.viewToggles}>
          {canDoubleSide ? (
            <Pressable
              onPress={toggleDoubleSided}
              style={[pillChip.base, doubleSided && pillChip.active]}>
              <Text style={[pillChip.text, doubleSided && pillChip.textActive]}>
                {doubleSided ? '✓ Double-sided' : 'Double-sided'}
              </Text>
            </Pressable>
          ) : null}
          <CaptionControls
            enabled={labelsOn}
            onToggle={() => setLabelsOn(!labelsOn)}
            fields={labelFields}
            onToggleField={toggleLabelField}
          />
          {/* Owned overlay, only offered when the viewer has an inventory (own cards). A green ✓
              corner badge lights up on card slots they own. */}
          {ownedCards ? (
            <Pressable
              onPress={() => setShowOwned((v) => !v)}
              style={[pillChip.base, showOwned && pillChip.active]}>
              <Text style={[pillChip.text, showOwned && pillChip.textActive]}>
                {showOwned ? '✓ Owned' : 'Owned'}
              </Text>
            </Pressable>
          ) : null}
          {/* Real scans: pockets show the owner's own photos (cards they scanned into their
              collection). Only offered when they have any. */}
          {scanImages ? (
            <Pressable
              onPress={() => setShowScans((v) => !v)}
              style={[pillChip.base, showScans && pillChip.active]}>
              <Text style={[pillChip.text, showScans && pillChip.textActive]}>
                {showScans ? '✓ Scans' : 'Scans'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {/* The field chips get their own line. Inline they widened the Card labels pill and pushed
            Double-sided, Owned and Scans sideways every time labels were switched on. */}
        <CaptionFieldRow
          enabled={labelsOn}
          fields={labelFields}
          onToggleField={toggleLabelField}
        />
      </View>

      </View>

      {/* The page — a prev · current · next spread on wide screens, else the single page. */}
      {/* testID rides through to data-testid on web. It exists so a screenshot harness can MEASURE
          the rendered page rather than infer it from arithmetic — the gap that made the on-card
          label work take six rounds of guessing. Costs nothing at runtime. */}
      <GestureDetector gesture={swipe}>
      <View ref={pageWrapRef} style={styles.pageWrap} testID="binder-page-wrap">
      {/* THE PAGE TURNS ON A HINGE. This used to slide the whole spread in from the side, which read
          as lifting the binder away and sliding a different one back rather than as turning a page.
          The settled spread below is now drawn plainly — no key, no remount, no entering animation,
          so nothing about the editor's drag targets moves — and the turn plays as an overlay above
          it (see the leaf after this block). */}
      <Animated.View style={styles.turnLayer}>
        {!page ? (
          <ThemedText type="small" themeColor="textSecondary">
            This binder doesn’t have any pages yet.
          </ThemedText>
        ) : doubleSided ? (
          // The open book: left/right facing pages (the cover face sits alone on the right).
          // The non-active side is a full 'partner' surface; its label focuses it.
          <View style={[styles.spreadRow, { gap: bookGap }]}>
            <SpreadColumn
              page={leftPage}
              width={bookW}
              label={leftPage ? `Page ${spreadLeftIdx + 1}` : ''}
              onFocus={
                leftPage && spreadLeftIdx !== idx ? () => onPageChange(spreadLeftIdx) : undefined
              }
              editable={editable}
              dragCol={dragCol}
              columnIndex={0}
              role={spreadLeftIdx === idx ? 'current' : 'prev'}
              flat>
              {leftPage
                ? renderGrid({
                    page: leftPage,
                    width: bookW,
                    role: spreadLeftIdx === idx ? 'current' : 'partner',
                    captionFields,
                    ownedIds,
                    scanUrlOf,
                  })
                : null}
            </SpreadColumn>
            <SpreadColumn
              page={rightPage}
              width={bookW}
              label={rightPage ? `Page ${spreadRightIdx + 1}` : ''}
              onFocus={
                rightPage && spreadRightIdx !== idx ? () => onPageChange(spreadRightIdx) : undefined
              }
              editable={editable}
              dragCol={dragCol}
              columnIndex={2}
              role={spreadRightIdx === idx ? 'current' : 'next'}
              flat>
              {rightPage
                ? renderGrid({
                    page: rightPage,
                    width: bookW,
                    role: spreadRightIdx === idx ? 'current' : 'partner',
                    captionFields,
                    ownedIds,
                    scanUrlOf,
                  })
                : null}
            </SpreadColumn>
          </View>
        ) : showSpread ? (
          <View style={[styles.spreadRow, { gap: spreadGap }]}>
            <SpreadColumn
              page={prevPage}
              width={spreadWidth}
              label={prevPage ? `‹ Page ${idx}` : ''}
              onFocus={() => onPageChange(idx - 1)}
              editable={editable}
              dragCol={dragCol}
              columnIndex={0}
              role="prev"
              peekWidth={showPeeks ? peekWidth : undefined}>
              {prevPage
                ? renderGrid({ page: prevPage, width: spreadWidth, role: 'prev', captionFields, ownedIds, scanUrlOf })
                : null}
            </SpreadColumn>
            <SpreadColumn
              page={page}
              width={spreadWidth}
              label={`Page ${idx + 1}`}
              editable={editable}
              dragCol={dragCol}
              columnIndex={1}
              role="current">
              {/* THE LIVE PAGE. Never decorative — `decorative` renders a grid `editable={false}`
                  with no onSlotPress and no onCellPress, which is right for the turn overlay's
                  throwaway copies and fatal here: it is the page the editor is for. */}
              {renderGrid({ page, width: spreadWidth, role: 'current', captionFields, ownedIds, scanUrlOf })}
            </SpreadColumn>
            <SpreadColumn
              page={nextPage}
              width={spreadWidth}
              label={nextPage ? `Page ${idx + 2} ›` : ''}
              onFocus={() => onPageChange(idx + 1)}
              editable={editable}
              dragCol={dragCol}
              columnIndex={2}
              role="next"
              peekWidth={showPeeks ? peekWidth : undefined}>
              {nextPage
                ? renderGrid({ page: nextPage, width: spreadWidth, role: 'next', captionFields, ownedIds, scanUrlOf })
                : null}
            </SpreadColumn>
          </View>
        ) : (
          <View testID="binder-page-current">
            {/* Live, for the same reason as the spread's middle column above. */}
            {renderGrid({ page, width: pageWidth, role: 'single', captionFields, ownedIds, scanUrlOf })}
          </View>
        )}
      </Animated.View>

      {/* THE LEAF. Purely something to look at: pointer-events off throughout, mounted only while a
          turn is in the air, and it never touches the surface underneath.

          The base the leaf plays over must be the OLD left page beside the NEW right page (going
          forward), so the sheet reveals the new right page as it lifts and covers the old left page
          as it lands. The render below already shows the NEW spread, so the overlay supplies only
          the half that is stale: going forward that is the old LEFT page, going back it is the old
          RIGHT page. Both ends of the arc then agree with the settled spread and the unmount is
          invisible. */}
      {pageTurn && doubleSided
        ? (() => {
            // THE OVERLAY IS BUILT FROM THE SAME PIECES AS THE SPREAD BENEATH IT — the same
            // SpreadColumns, the same labels, the same roles. Drawing bare grids instead was wrong
            // in two ways at once: a column puts a "Page N" label ABOVE its grid, so the copies sat
            // a label's height too high (the offset in the report), and it dims whichever side is
            // not the active one, so an undimmed leaf landing on a dimmed page flashed at the end.
            // Copying the structure means those can never drift again.
            //
            // It draws the WHOLE base spread rather than patching in the stale half, so during a
            // turn the settled render is completely covered. Nothing underneath can show through
            // out of alignment, which is what made this look worst in the editor, where the two
            // modes render different grid chrome.
            const baseLeft = pageTurn.forward ? pageTurn.fromLeft : leftPage;
            const baseRight = pageTurn.forward ? rightPage : pageTurn.fromRight;
            const leftRole = spreadLeftIdx === idx ? 'current' : 'prev';
            const rightRole = spreadRightIdx === idx ? 'current' : 'next';
            const gridRole = (r: string) => (r === 'current' ? 'current' : 'partner');
            // Front is the right page of the EARLIER spread, back the left page of the LATER one —
            // two sides of one sheet. Going back, "earlier" is where the reader is heading.
            const front = pageTurn.forward ? pageTurn.fromRight : rightPage;
            const back = pageTurn.forward ? leftPage : pageTurn.fromLeft;
            return (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={styles.turnLayer}>
                  <View style={[styles.spreadRow, { gap: bookGap }]}>
                    <SpreadColumn
                      page={baseLeft}
                      width={bookW}
                      label={leftPage ? `Page ${spreadLeftIdx + 1}` : ''}
                      editable={editable}
                      columnIndex={0}
                      role={leftRole}
                      flat>
                      {baseLeft
                        ? renderGrid({ page: baseLeft, width: bookW, role: gridRole(leftRole) as GridRole, captionFields, ownedIds, scanUrlOf, decorative: true })
                        : null}
                    </SpreadColumn>
                    <SpreadColumn
                      // The column HOSTS the leaf, so it has to exist even on a spread whose right
                      // half does not: a binder with an odd last page turned to it with no
                      // animation at all, because a column with no page renders no children.
                      page={baseRight ?? page}
                      width={bookW}
                      label={rightPage ? `Page ${spreadRightIdx + 1}` : ''}
                      editable={editable}
                      columnIndex={2}
                      role={rightRole}
                      flat>
                      {/* The leaf hinges on THIS column's inner edge, so it needs no arithmetic
                          about where the spine is — it is already there.

                          AT MOST TWO NEW PAGES PER TURN. The page revealed under the sheet is
                          already rendered by the settled spread directly beneath this overlay and
                          in exactly this position, so drawing a second copy of it here mounted a
                          page that was on screen already. Going FORWARD that copy is dropped and
                          the box is sized by arithmetic instead (pageHeightAt — the same sum
                          BinderGrid lays out), because the leaf is absolutely positioned and would
                          otherwise have no height to fill. Going BACKWARD the right-hand page IS
                          the stale one, so it genuinely has to be drawn. */}
                      <View
                        style={{
                          // WIDTH IS NOT OPTIONAL HERE. The leaf inside is absolutely positioned,
                          // so it adds nothing to this box's size, and a column is as wide as its
                          // widest child — leaving the width to the content collapsed the right
                          // half of the overlay to the width of its "Page N" label, and a centred
                          // row then drew the whole turn off to one side of the spread beneath it.
                          width: bookW,
                          // Sized from whichever page the base spread has on the right, so the box
                          // fits the grid it draws (going back) and the page it covers (going
                          // forward) even where two pages disagree about their row count.
                          height: pageHeightAt(
                            bookW,
                            (baseRight ?? page).rows,
                            (baseRight ?? page).cols,
                            captionsOn,
                          ),
                        }}>
                        {!pageTurn.forward && baseRight
                          ? renderGrid({ page: baseRight, width: bookW, role: gridRole(rightRole) as GridRole, captionFields, ownedIds, scanUrlOf, decorative: true })
                          : null}
                        <TurnLeaf
                          t={turnT}
                          forward={pageTurn.forward}
                          width={bookW}
                          hingeLeft={0}
                          // The gap between the facing pages IS this book's spine, and the sheet
                          // has to cross all of it to lie down on the other one.
                          spine={bookGap}
                          front={front ? renderGrid({ page: front, width: bookW, role: 'current', captionFields, ownedIds, scanUrlOf, decorative: true }) : null}
                          back={back ? renderGrid({ page: back, width: bookW, role: 'current', captionFields, ownedIds, scanUrlOf, decorative: true }) : null}
                        />
                      </View>
                    </SpreadColumn>
                  </View>
                </View>
              </View>
            );
          })()
        : null}
      {/* One page at a time: nothing beside it to sweep over, so the outgoing page lifts on the
          same hinge and the page underneath — already the new one — is revealed. */}
      {pageTurn && !doubleSided && !showSpread && pageTurn.fromPage ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {/* Centred the same way the page beneath is (turnLayer), or the lifting sheet starts from
              the left edge of the wrap rather than from the page. */}
          <View style={styles.turnLayer}>
            <View style={{ width: pageWidth }}>
              <SingleTurnLeaf
                t={turnT}
                width={pageWidth}
                page={renderGrid({ page: pageTurn.fromPage, width: pageWidth, role: 'single', captionFields, ownedIds, scanUrlOf, decorative: true })}
              />
            </View>
          </View>
        </View>
      ) : null}
      </View>
      </GestureDetector>

      {/* Page filmstrip — tap a thumbnail to flip to it; long-press-drag reorders (edit only). */}
      {count > 1 ? (
        <View
          onLayout={(e) => setStripHeight(e.nativeEvent.layout.height)}
          style={[
            styles.stripDock,
            // Opaque, because the page now scrolls UNDER it: a transparent dock would let card art
            // slide through the page numbers.
            { backgroundColor: theme.background },
            Platform.OS === 'web' ? (WEB_STICKY as object) : null,
          ]}>
        <PageStrip
          pages={binder.pages}
          currentIndex={idx}
          onSelect={onPageChange}
          onReorder={onReorderPages}
        />
        </View>
      ) : null}
    </>
  );
}

/**
 * A neighbour page, cropped to a strip of its inner edge — what the next page looks like sitting
 * under your thumb in a real binder.
 *
 * The page inside is rendered at FULL width and slid sideways, not scaled down, so the cards in
 * the strip are the same size as the ones on the page you are reading. A shrunken thumbnail would
 * read as a different object; a cropped page reads as the same binder continuing.
 */
function PeekClip({
  peeking,
  peekWidth,
  width,
  role,
  children,
}: {
  peeking: boolean;
  peekWidth: number;
  width: number;
  role: 'prev' | 'current' | 'next';
  children: ReactNode;
}) {
  const theme = useTheme();
  if (!peeking) return <>{children}</>;
  // Show the edge that faces the current page: the previous page's right, the next page's left.
  const offset = role === 'prev' ? -(width - peekWidth) : 0;
  // FADE INTO THE MAT at the outer edge. Cropping alone left three equally bright pages in a row
  // with nothing saying which one you were reading; a peek has to look like it is receding, not
  // like a page that happens to be cut off. The gradient runs toward the outside — the direction
  // the page is disappearing — so the near edge stays crisp against the page you are on.
  const fade: [string, string] = [`${theme.background}00`, theme.background];
  return (
    <View style={{ width: peekWidth, overflow: 'hidden' }}>
      <View style={{ width, marginLeft: offset }}>{children}</View>
      <LinearGradient
        pointerEvents="none"
        colors={role === 'prev' ? fade : [fade[1], fade[0]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * One column of the spread: a page label above a grid. The current column is static; a neighbour
 * flips to its page — via its label always, and (read-only only) by tapping the whole page. When
 * editable the grid stays a bare drag surface. `dragCol` lifts the mid-drag column above the rest.
 */
function SpreadColumn({
  page,
  width,
  label,
  onFocus,
  editable,
  dragCol,
  columnIndex,
  role,
  peekWidth,
  flat = false,
  children,
}: {
  page: DemoPage | null;
  width: number;
  label: string;
  onFocus?: () => void;
  editable: boolean;
  dragCol?: SharedValue<number>;
  columnIndex: number;
  /** Which of the three this column is — drives the automation testID and which edge peeks. */
  role: 'prev' | 'current' | 'next';
  /** When set, show only this many pixels of the page: a peek at its inner edge. */
  peekWidth?: number;
  /**
   * BOTH HALVES OF AN OPEN BOOK ARE LIVE. The prev/current/next scroller dims its neighbours to
   * say which page you are reading, but a double-sided spread is one open binder: dimming half of
   * it says the left page is somehow less real than the right, and it dimmed the turning leaf with
   * it — which is why a page mid-turn looked transparent, and why the destination showed through
   * it before the turn had finished.
   */
  flat?: boolean;
  children: ReactNode;
}) {
  const fallback = useSharedValue(-1);
  const col = dragCol ?? fallback;
  const columnStyle = useAnimatedStyle(() => ({ zIndex: col.value === columnIndex ? 30 : 1 }));
  // A column with no page reserves only a peek's worth of space, not a whole page's. On page 1
  // the old layout left a full-page-wide empty band where the previous page would have been.
  if (!page) return <View style={{ width: peekWidth ?? width }} />;
  const peeking = peekWidth != null && peekWidth > 0 && peekWidth < width;
  const labelEl = (
    <ThemedText type="small" themeColor="textSecondary" style={styles.neighborLabel} numberOfLines={1}>
      {label}
    </ThemedText>
  );
  return (
    <Animated.View
      style={[styles.neighbor, columnStyle]}
      testID={role === 'current' ? 'binder-page-current' : `binder-page-${role}`}>
      {onFocus ? (
        <Pressable onPress={onFocus} hitSlop={6} accessibilityLabel={label}>
          {labelEl}
        </Pressable>
      ) : (
        labelEl
      )}
      {onFocus && !editable ? (
        <Pressable style={flat ? undefined : styles.neighborGrid} onPress={onFocus} accessibilityLabel={label}>
          <PeekClip peeking={peeking} peekWidth={peekWidth ?? width} width={width} role={role}>
            {children}
          </PeekClip>
        </Pressable>
      ) : (
        <View style={flat ? undefined : role === 'current' ? styles.currentGrid : styles.neighborGrid}>
          <PeekClip peeking={peeking} peekWidth={peekWidth ?? width} width={width} role={role}>
            {children}
          </PeekClip>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  labelsRow: { alignItems: 'center', marginTop: 10 },
  viewToggles: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  pageDetailsRead: { alignItems: 'center', marginTop: 8 },
  pageWrap: { alignItems: 'center', marginVertical: 18 },
  // The turning layer must not clip its own entry animation, and must not change the layout it
  // wraps — it only carries the transition.
  turnLayer: { alignItems: 'center', alignSelf: 'stretch' },
  spreadRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  neighbor: { alignItems: 'center' },
  neighborLabel: { marginBottom: 6 },
  // The filmstrip is NAVIGATION, so it may never be the thing you have to scroll to reach. And
  // scrolling to it is worse than it sounds here: the wheel over the binder flips pages instead of
  // scrolling, so hunting for the strip flips you off the page you were on.
  //
  // It cannot simply be made to fit. A 3x3 page at 560px with card labels is 870px tall, and with
  // the header, the pills and the strip itself that is 1101px — more than a 1080p window has, even
  // with every removable thing above the art already gone. Shrinking the page to fit would cost
  // the artwork, which is the one thing this whole exercise is protecting. So the strip docks to
  // the bottom of the viewport and the page scrolls under it.
  stripDock: { paddingTop: 4 },
  // Neighbours recede. 0.92 was an 8% dim — indistinguishable from the page in focus, which is
  // exactly the complaint: three equally bright pages with no way to tell which one you were on.
  neighborGrid: { opacity: 0.55 },
  // …and the page in focus sits above them, lifted off the mat rather than merely brighter.
  currentGrid: {
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pageTitle: { textAlign: 'center' },
  pageDescription: { marginTop: 4, textAlign: 'center' },
});
