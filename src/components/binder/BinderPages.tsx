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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { CaptionControls, CaptionFieldRow } from '@/components/binder/CaptionControls';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { PageStrip } from '@/components/binder/PageStrip';
import { ThemedText } from '@/components/themed-text';

import { pillChip } from '@/constants/ui';
import { hasTextCaption, type CaptionFieldKey } from '@/data/cardCaption';
import { PEEK_MIN_WIDTH, SPREAD_GAP, bookLayout, spreadLayout } from '@/data/binderLayout';
import { useCardLabelPrefs } from '@/hooks/use-card-label-prefs';
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
              role={spreadLeftIdx === idx ? 'current' : 'prev'}>
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
              role={spreadRightIdx === idx ? 'current' : 'next'}>
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
            {renderGrid({ page, width: pageWidth, role: 'single', captionFields, ownedIds, scanUrlOf })}
          </View>
        )}
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
        <Pressable style={styles.neighborGrid} onPress={onFocus} accessibilityLabel={label}>
          <PeekClip peeking={peeking} peekWidth={peekWidth ?? width} width={width} role={role}>
            {children}
          </PeekClip>
        </Pressable>
      ) : (
        <View style={role === 'current' ? styles.currentGrid : styles.neighborGrid}>
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
