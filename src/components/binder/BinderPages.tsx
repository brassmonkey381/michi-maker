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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { PageStrip, STRIP_THUMB_W, type StripExtra } from '@/components/binder/PageStrip';
import { COVER_ABBR, CoverStickerLayer, CoverTools, withSurface } from '@/components/binder/CoverEditor';
import { useBinders } from '@/store/binders';
import { ThemedText } from '@/components/themed-text';

import { pillChip } from '@/constants/ui';
import { hasTextCaption, type CaptionFieldKey } from '@/data/cardCaption';
import { PEEK_MIN_WIDTH, SPREAD_GAP, bookLayout, pageHeightAt, spreadLayout } from '@/data/binderLayout';
import { useCardLabelPrefs } from '@/hooks/use-card-label-prefs';
import { useViewPrefs } from '@/hooks/use-view-prefs';
import { CoverSurface } from '@/components/binder/BinderCover';
import { binderColourway, binderModel, coverAspect, type CoverSurfaceId } from '@/data/binderModels';
import { cardThumbUrl } from '@/lib/catalogConfig';
import type { BinderCover, DemoBinder, DemoPage, DemoSlot } from '@/data/binderTypes';
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
  // HOW YOU LAST LOOKED AT THIS BINDER, remembered per account — Owned, Scans and Double-sided
  // were all session-only, and none of them is a per-visit decision. See use-view-prefs.ts.
  const view = useViewPrefs();
  const ownedCards = useOwnedCards();
  const showOwned = view.owned;
  const setShowOwned = (on: boolean) => view.setPref('owned', on);
  const ownedIds = showOwned ? ownedCards : undefined;
  // Real scans: card pockets show the owner's own photo of each card instead of catalog art.
  // Session-only like the other pills; the map is undefined for guests, for accounts with no
  // scanned lots, and for anyone who does not own this binder (see viewerIsOwner), which hides
  // the pill entirely rather than offering a toggle that would show the wrong person's photos.
  const ownScans = useScanImages();
  const scanImages = viewerIsOwner ? ownScans : undefined;
  const showScans = view.scans;
  const setShowScans = (on: boolean) => view.setPref('scans', on);
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
  const doubleSidedWanted = view.doubleSided;
  const toggleDoubleSided = () => view.setPref('doubleSided', !doubleSidedWanted);

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
    /** The spread the turn STARTED on. The overlay is built around this, not around the arrival. */
    fromLeftIdx: number;
    fromRightIdx: number;
    forward: boolean;
  } | null>(null);
  const turnT = useSharedValue(0);

  /**
   * THE BOOK HAS TWO STATES THAT ARE NOT SPREADS: shut at the front and shut at the back.
   *
   * They live here rather than in the page index, because the index belongs to the caller and
   * means "which page is active". A shut binder has no active page; it has a cover facing you. So
   * paging past either end sets this instead, every real page keeps the number it always had, and
   * a caller that knows nothing about covers is unaffected.
   *
   * Only a DRESSED binder can shut. An undressed one has no cover to show, so both ends behave
   * exactly as they did before.
   */
  //
  // 'tail' is the spread AFTER the last page of a binder with an odd page count: the back of its
  // final sheet (blank, since that page does not exist) facing the inside back cover. A binder with
  // an even count reaches its inside back on an ordinary spread and never needs this.
  const [shut, setShut] = useState<null | 'front' | 'back' | 'tail'>(null);

  /**
   * THE COVER SURFACE BEING DECORATED, in edit mode. Chosen from the filmstrip (FC, IFC, IBC, BC)
   * or by tapping a cover on the spread. The inside covers live on a spread, so focusing one also
   * pages there; `focusPending` carries the focus across that page change, which would otherwise
   * clear it as any page change does.
   */
  const [coverFocus, setCoverFocus] = useState<CoverSurfaceId | null>(null);
  /**
   * A cover asked for a page change and wants to be found on the other side of it: with this
   * focus, and with the binder in this shut state. Any other page change clears both.
   */
  const [pending, setPending] = useState<{
    focus: CoverSurfaceId;
    shut: null | 'front' | 'back' | 'tail';
  } | null>(null);
  /** The sticker selected on the focused surface, for the toolbar to act on. */
  const [coverSelected, setCoverSelected] = useState<string | null>(null);
  /**
   * A sticker mid-drag and where it has got to. Held here rather than in the layer, because the
   * PICTURE is drawn by the surface underneath the layer, and a drag that only moved the hit box
   * left the picture standing still until release.
   */
  const [coverDrag, setCoverDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  // The one cover write path. Gated on editable so the public viewer, which mounts this same
  // component for anyone's binder, can never write.
  const store = useBinders();
  const writeCover = (cover: BinderCover) => {
    if (editable) store.updateBinder(binder.id, { cover });
  };
  /** The cover swinging open or closed. Separate from pageTurn: no page is changing. */
  const [coverTurn, setCoverTurn] = useState<null | { end: 'front' | 'back'; closing: boolean }>(null);
  const coverT = useSharedValue(0);
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
    // Choosing a page from the filmstrip while the binder is shut opens it at that page. No cover
    // animation: the reader asked for a page, not for the cover.
    if (pending) {
      // A cover asked for this page: arrive with that cover in focus and the binder in the state
      // it wanted, and with no page turn, since they asked for the cover and not the animation.
      setShut(pending.shut);
      setCoverTurn(null);
      setCoverFocus(pending.focus);
      setPending(null);
    } else {
      if (shut) {
        setShut(null);
        setCoverTurn(null);
      }
      if (coverFocus) setCoverFocus(null);
    }
    setCoverSelected(null);
    setCoverDrag(null);
    // NO TURN WHEN THE PAGE IS ALREADY IN FRONT OF YOU. Tapping the facing half of an open spread
    // moves the active page but turns nothing over — both pages stay exactly where they are — so
    // animating a sheet there was pure invention. A spread is identified by its left-hand index.
    const spreadOf = (i: number) => (i === 0 ? 0 : i % 2 === 1 ? i : i - 1);
    const sameSpread = doubleSided && spreadOf(from) === spreadOf(idx);
    if (count > 1 && !turnReduced() && !sameSpread && !pending) {
      const fromLeftIdx = from === 0 ? -1 : from % 2 === 1 ? from : from - 1;
      const fromRightIdx = from === 0 ? 0 : fromLeftIdx + 1 < count ? fromLeftIdx + 1 : -1;
      setPageTurn({
        fromLeft: fromLeftIdx >= 0 ? binder.pages[fromLeftIdx] : null,
        fromRight: fromRightIdx >= 0 ? binder.pages[fromRightIdx] : null,
        fromPage: binder.pages[from] ?? null,
        fromLeftIdx,
        fromRightIdx,
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

  // The cover's hinge. Same shape as the page's, and reset before the paint for the same reason:
  // a value left at the end of its last arc would otherwise be drawn for one frame at the start of
  // this one.
  useLayoutEffect(() => {
    if (!coverTurn) return;
    coverT.value = 0;
    coverT.value = withTiming(1, { duration: TURN_MS, easing: TURN_EASING }, (done) => {
      if (done) runOnJS(setCoverTurn)(null);
    });
  }, [coverTurn, coverT]);

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
  /**
   * A HALF OF THE SPREAD IS NOT ALWAYS A PAGE.
   *
   * Two of them never were: the first spread has nothing facing page one, and the last has nothing
   * facing the final page. In a real binder those two gaps are not gaps at all, they are the INSIDE
   * of the front cover and the INSIDE of the back cover, and a dressed binder should show them.
   *
   * So a half is addressed by index as before, and an index of -1 resolves to whichever inside
   * cover belongs on that side: the front's on the left, because the only left-hand gap is at the
   * very start, and the back's on the right, because the only right-hand gap is at the very end.
   * Nothing about the page numbering moves, which is the point: covers are drawn into the space
   * the book already left for them.
   */
  const coverOf = (i: number, side: 'left' | 'right'): CoverSurfaceId | null => {
    if (i >= 0 || !binder.cover) return null;
    return side === 'left' ? 'frontInside' : 'backInside';
  };
  const coverModel = binderModel(binder.cover?.modelId);
  const coverColour = binderColourway(coverModel, binder.cover?.colourway);
  /**
   * Which surface the toolbar and the sticker layer are for. An explicit focus wins; otherwise a
   * shut binder is implicitly focused on the cover it is showing, so closing it in edit mode puts
   * you straight onto that cover.
   */
  const focused: CoverSurfaceId | null =
    coverFocus ?? (shut === 'front' ? 'front' : shut === 'back' ? 'back' : shut === 'tail' ? 'backInside' : null);

  /**
   * One cover surface, drawn to the page's width so the two halves of the spread line up.
   *
   * LIVE means this is the surface on the spread itself rather than a copy in the turn overlay:
   * the wheel flips over it, a tap in edit mode focuses it, and when focused it carries the
   * sticker layer. Overlay copies and sheet faces stay inert for the same reason renderGrid has
   * `decorative`: a second live copy would steal the gesture.
   */
  const drawCover = (id: CoverSurfaceId | null, live = false) => {
    if (!id) return null;
    const stickers = binder.cover?.surfaces?.[id] ?? [];
    const editing = live && editable && focused === id;
    // While a sticker is being dragged the SURFACE draws it where the finger is, and the layer
    // keeps working from the committed position so the drag does not compound on itself.
    const shown =
      editing && coverDrag
        ? stickers.map((st) => (st.id === coverDrag.id ? { ...st, x: coverDrag.x, y: coverDrag.y } : st))
        : stickers;
    const surface = (
      <CoverSurface
        model={coverModel}
        colourwayId={coverColour.id}
        surface={id}
        width={bookW}
        stickers={shown}
        wheelTarget={live}>
        {editing && binder.cover ? (
          <CoverStickerLayer
            width={bookW}
            height={bookW / coverAspect(coverModel)}
            stickers={stickers}
            drag={coverDrag}
            selected={coverSelected}
            onSelect={setCoverSelected}
            onDrag={(sid, x, y) => setCoverDrag({ id: sid, x, y })}
            onMove={(sid, x, y) => {
              setCoverDrag(null);
              writeCover(
                withSurface(
                  binder.cover!,
                  id,
                  stickers.map((st) => (st.id === sid ? { ...st, x, y } : st)),
                ),
              );
            }}
          />
        ) : null}
      </CoverSurface>
    );
    // In edit mode an unfocused cover is one tap from being the one you are decorating.
    if (live && editable && !editing) {
      return (
        <Pressable onPress={() => focusCover(id)} accessibilityLabel={`Decorate ${COVER_ABBR[id]}`}>
          {surface}
        </Pressable>
      );
    }
    return surface;
  };

  /**
   * PUT A COVER IN FRONT OF THE READER. The outside covers are seen with the binder shut, so
   * choosing one shuts it, without the animation: they asked for the cover, not for the turn. The
   * inside covers live on a spread, so choosing one pages to that spread, and for a binder with an
   * odd page count the inside back has no spread of its own and gets the tail instead.
   */
  const lastSpreadLeft = count % 2 === 0 ? count - 1 : count - 2;
  /**
   * A page chosen from the strip. When it is already the active page no page change fires, so
   * nothing would take the binder out of a shut or cover-focused state; this does it by hand.
   */
  const selectPage = (i: number) => {
    if (i !== idx) {
      onPageChange(i);
      return;
    }
    setShut(null);
    setCoverTurn(null);
    setCoverFocus(null);
    setCoverSelected(null);
    setCoverDrag(null);
    setPending(null);
  };
  const focusCover = (id: CoverSurfaceId) => {
    setCoverSelected(null);
    setCoverTurn(null);
    setCoverDrag(null);
    // The outside covers are seen shut; the inside back of an odd count is seen on the tail.
    const wantShut: null | 'front' | 'back' | 'tail' =
      id === 'front' ? 'front' : id === 'back' ? 'back' : id === 'backInside' && count % 2 === 1 ? 'tail' : null;
    // And every cover belongs to one end of the book, so the page index goes there too: opening
    // a cover that was focused from the middle of the binder must land on the spread it is
    // actually attached to, not on wherever the reader happened to be.
    const target = id === 'front' || id === 'frontInside' ? 0 : Math.max(0, lastSpreadLeft);
    if (target !== idx) {
      setPending({ focus: id, shut: wantShut });
      onPageChange(target);
      return;
    }
    setShut(wantShut);
    setCoverFocus(id);
  };
  /**
   * THE COVER STAGE: the binder shut, or a cover on its way to or from shut.
   *
   * Which face is where follows from how a real binder lies. Shut at the front, the front cover is
   * on the RIGHT with the spine to its left, and opening swings it leftward off page one. Shut at
   * the back, the back cover is on the LEFT, and opening swings it rightward off the last page.
   *
   * The sheet is the cover itself, so it carries the outside on one face and the inside on the
   * other, which is the whole reason a cover has two sides worth decorating.
   */
  const coverEnd = coverTurn?.end ?? shut;
  const coverStage = coverEnd
    ? {
        end: coverEnd,
        // Under the sheet: the page it lifts off, or lands on. The other half is the table. At the
        // back of an odd-count binder the sheet lands on the blank back of the final page, not on
        // the page itself, which is what the tail spread shows.
        basePage:
          coverEnd === 'front'
            ? (binder.pages[0] ?? null)
            : count % 2 === 0
              ? (binder.pages[count - 1] ?? null)
              : null,
        // Front runs 0 to -180 (right to left); back runs the reverse. Opening at the front and
        // closing at the back both travel leftward; the other two travel back.
        forward: coverTurn ? (coverTurn.closing ? coverEnd === 'back' : coverEnd === 'front') : true,
        outside: (coverEnd === 'front' ? 'front' : 'back') as CoverSurfaceId,
        inside: (coverEnd === 'front' ? 'frontInside' : 'backInside') as CoverSurfaceId,
      }
    : null;

  const spreadLeftIdx = idx === 0 ? -1 : idx % 2 === 1 ? idx : idx - 1;
  const spreadRightIdx = idx === 0 ? 0 : spreadLeftIdx + 1 < count ? spreadLeftIdx + 1 : -1;

  /**
   * THE COVERS IN THE FILMSTRIP. Pages keep their numbers; a cover gets the abbreviation a printer
   * would use. Only in the book view of a dressed binder, since that is the only view that draws
   * them. Each thumb is the real renderer at 58px, so the strip shows what is actually on it.
   */
  const coverStripExtras: { leading?: StripExtra[]; trailing?: StripExtra[] } | undefined =
    doubleSided && binder.cover
      ? (() => {
          const extra = (id: CoverSurfaceId, current: boolean): StripExtra => ({
            key: `cover:${id}`,
            label: COVER_ABBR[id],
            current,
            onSelect: () => focusCover(id),
            thumb: (
              <CoverSurface
                model={coverModel}
                colourwayId={coverColour.id}
                surface={id}
                width={STRIP_THUMB_W}
                stickers={binder.cover?.surfaces?.[id]}
              />
            ),
          });
          return {
            leading: [
              extra('front', shut === 'front'),
              extra('frontInside', !shut && focused === 'frontInside'),
            ],
            trailing: [
              extra('backInside', shut === 'tail' || (!shut && focused === 'backInside')),
              extra('back', shut === 'back'),
            ],
          };
        })()
      : undefined;
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
   * EVERY WAY OF TURNING A PAGE GOES THROUGH HERE, so the two ends behave the same however you
   * reached them: a swipe, the wheel, or anything added later.
   *
   * Past the last spread the binder shuts; past the first, the same in reverse. From shut, a move
   * back the way you came opens it again, and a move further in the direction it is already shut
   * does nothing, because there is nothing past a closed cover.
   */
  const canShut = doubleSided && Boolean(binder.cover) && count > 0;
  const step = useCallback(
    (dir: 1 | -1) => {
      // Every change of shut drops an explicit focus. The surface in focus is then whichever one
      // the binder is showing, which is the only one it makes sense to be decorating.
      const changeShut = (next: null | 'front' | 'back' | 'tail') => {
        setShut(next);
        setCoverFocus(null);
        setCoverSelected(null);
        setCoverDrag(null);
        setPending(null);
      };
      if (shut === 'tail') {
        // Back into the book, or on to shut. Closing from the tail lands the cover on a blank.
        if (dir === -1) changeShut(null);
        else {
          changeShut('back');
          setCoverTurn({ end: 'back', closing: true });
        }
        return;
      }
      if (shut === 'front') {
        if (dir === 1) {
          changeShut(null);
          setCoverTurn({ end: 'front', closing: false });
        }
        return;
      }
      if (shut === 'back') {
        if (dir === -1) {
          // Symmetric with closing: an odd count closed from the tail, so it opens onto the tail,
          // which is also what the sheet is drawn landing on.
          changeShut(count % 2 === 1 ? 'tail' : null);
          setCoverTurn({ end: 'back', closing: false });
        }
        return;
      }
      const target = dir === 1 ? forward : backward;
      if (target < 0) {
        if (canShut) {
          changeShut('front');
          setCoverTurn({ end: 'front', closing: true });
        }
        return;
      }
      if (target >= count) {
        if (canShut) {
          // An odd count turns its last sheet first, revealing the tail; an even one is already
          // looking at the inside back and shuts straight away.
          if (count % 2 === 1) changeShut('tail');
          else {
            changeShut('back');
            setCoverTurn({ end: 'back', closing: true });
          }
        }
        return;
      }
      onPageChange(target);
    },
    [shut, forward, backward, count, canShut, onPageChange],
  );
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
    // A single-page binder has nothing to swipe between, unless it has covers to shut into.
    const on = !editable && (count > 1 || canShut);
    return Gesture.Race(
      Gesture.Fling().enabled(on).direction(Directions.LEFT).onEnd(() => runOnJS(step)(1)),
      Gesture.Fling().enabled(on).direction(Directions.RIGHT).onEnd(() => runOnJS(step)(-1)),
    );
  }, [editable, count, canShut, step]);

  useEffect(() => {
    if (Platform.OS !== 'web' || count === 0 || (count === 1 && !canShut) || typeof window === 'undefined') return;
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
      const dir: 1 | -1 = delta > 0 ? 1 : -1;
      // At an edge with nothing to shut into, the wheel falls through to normal editor scrolling
      // exactly as it always did. With a cover there, it closes the binder instead.
      const next = dir === 1 ? forward : backward;
      const atEdge = next < 0 || next >= count;
      // Shut, the only wheel that means anything is the one that opens the binder; the other way
      // is left for the page to scroll, rather than swallowed for nothing.
      const acts =
        shut === 'front' ? dir === 1 : shut === 'back' ? dir === -1 : shut === 'tail' ? true : !atEdge || canShut;
      if (!acts) return;
      e.preventDefault();
      if (e.timeStamp - cooldown < 300) return; // one page per gesture, not per event
      cooldown = e.timeStamp;
      step(dir);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [count, forward, backward, step, canShut, shut]);

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
              onPress={() => setShowOwned(!showOwned)}
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
              onPress={() => setShowScans(!showScans)}
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
        {/* DECORATING, IN THE BINDER. The tools for whichever cover is in focus, next to the
            page it belongs with rather than in a dialog. Inside the measured block, so the page
            makes room for them instead of pushing the filmstrip down. */}
        {editable && binder.cover && focused ? (
          <CoverTools
            cover={binder.cover}
            surface={focused}
            selected={coverSelected}
            onSelect={setCoverSelected}
            onChange={writeCover}
          />
        ) : null}
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
        ) : coverStage ? (
          // SHUT, OR ON THE WAY. Two columns the size of the spread it came from, so the binder
          // does not jump as it closes; the cover lands in one of them and the other is the table.
          (() => {
            const pageH = pageHeightAt(bookW, page.rows, page.cols, captionsOn);
            const coverH = bookW / coverAspect(coverModel);
            const boxH = Math.max(pageH, coverH);
            const settled = !coverTurn;
            const onRight = coverStage.end === 'front';
            // The tail: nothing where the next page would be, and the inside back facing it.
            const tail = coverStage.end === 'tail';
            const baseGrid = coverStage.basePage
              ? renderGrid({
                  page: coverStage.basePage,
                  width: bookW,
                  role: 'partner',
                  captionFields,
                  ownedIds,
                  scanUrlOf,
                  decorative: true,
                })
              : null;
            return (
              <View style={[styles.spreadRow, { gap: bookGap }]}>
                <View style={{ width: bookW, height: boxH }}>
                  {/* Settled and shut at the back, the back cover lies here. Mid-turn, the left is
                      the last page (at the back) or bare table (at the front). */}
                  {settled
                    ? onRight || tail
                      ? null
                      : drawCover(coverStage.outside, true)
                    : onRight
                      ? null
                      : baseGrid}
                </View>
                <View style={{ width: bookW, height: boxH }}>
                  {settled
                    ? tail
                      ? drawCover('backInside', true)
                      : onRight
                        ? drawCover(coverStage.outside, true)
                        : null
                    : onRight
                      ? baseGrid
                      : null}
                  {coverTurn ? (
                    <TurnLeaf
                      t={coverT}
                      forward={coverStage.forward}
                      width={bookW}
                      hingeLeft={0}
                      spine={bookGap}
                      // The cover's two faces: outside where the world sees it, inside facing the
                      // pages. Which one is "front" depends on which way the sheet is travelling.
                      front={drawCover(onRight ? coverStage.outside : coverStage.inside)}
                      back={drawCover(onRight ? coverStage.inside : coverStage.outside)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })()
        ) : doubleSided ? (
          // The open book: left/right facing pages (the cover face sits alone on the right).
          // The non-active side is a full 'partner' surface; its label focuses it.
          <View style={[styles.spreadRow, { gap: bookGap }]}>
            <SpreadColumn
              // The column has to exist for an inside cover too, and a column with no page renders
              // nothing at all, so it is handed the active page purely as a presence check.
              page={leftPage ?? (coverOf(spreadLeftIdx, 'left') ? page : null)}
              width={bookW}
              label={leftPage ? `Page ${spreadLeftIdx + 1}` : coverOf(spreadLeftIdx, 'left') ? 'Inside front' : ''}
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
                : drawCover(coverOf(spreadLeftIdx, 'left'), true)}
            </SpreadColumn>
            <SpreadColumn
              page={rightPage ?? (coverOf(spreadRightIdx, 'right') ? page : null)}
              width={bookW}
              label={rightPage ? `Page ${spreadRightIdx + 1}` : coverOf(spreadRightIdx, 'right') ? 'Inside back' : ''}
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
                : drawCover(coverOf(spreadRightIdx, 'right'), true)}
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
      {/* THE OVERLAY IS KEPT, NOT BUILT.

          It used to be mounted at the moment a turn began, which meant three fresh page grids and
          some fifty fresh images all arriving in the frame the animation started in. That is the
          flash: not the skeletons over them, not the cache behind them, not the handover at the
          end, but the plain fact of new image elements appearing in the frame you were asked to
          watch. Two probes proved it between them — with the overlay gone the flash went, and with
          the pictures replaced by flat colour it went too.

          So it is mounted all the time now and simply kept invisible between turns, and its
          content is addressed from the spread the reader is ON rather than the one they are
          heading to. Every slot a turn needs is therefore already holding the right page before
          the turn is asked for:

            forward   the outgoing left page and the sheet's front are the spread you are looking
                      at; the sheet's back is the page after it, which is what a forward turn
                      reveals.
            backward  the outgoing right page and the sheet's back are that same spread; the
                      sheet's front is the page before it.

          Once a turn is in flight the addresses come from ITS origin instead (fromLeftIdx), which
          is the same spread the resting overlay was already showing, so not one grid is rebuilt as
          the turn starts. The rebuild happens afterwards, when the overlay is invisible again and
          nobody is watching. Both sheets are kept for the same reason: a reader who turns back has
          to find that leaf already built.

          In EDIT MODE it stays as it was, mounted per turn. The pre-built copies are inert but
          they are not free, and an editor re-renders on every drag frame. */}
      {(pageTurn || !editable) && doubleSided && count > 1
        ? (() => {
            // Addressed from the turn's ORIGIN while turning, from the settled spread while at
            // rest. Those are the same spread across the moment a turn begins, which is the whole
            // trick: the slots do not change, so React has nothing to rebuild.
            const warmLeftIdx = pageTurn ? pageTurn.fromLeftIdx : spreadLeftIdx;
            const warmRightIdx = pageTurn ? pageTurn.fromRightIdx : spreadRightIdx;
            const at = (i: number) => (i >= 0 && i < count ? (binder.pages[i] ?? null) : null);
            const baseLeft = at(warmLeftIdx);
            const baseRight = at(warmRightIdx);
            // The two sheets. Forward hangs on the right page and turns to the page after it;
            // backward hangs on the page before the left one and turns onto the left page.
            const fwdFront = baseRight;
            const fwdBack = warmRightIdx >= 0 ? at(warmRightIdx + 1) : null;
            const bwdFront = warmLeftIdx > 0 ? at(warmLeftIdx - 1) : null;
            const bwdBack = baseLeft;
            const turningFwd = Boolean(pageTurn?.forward);
            const turningBwd = Boolean(pageTurn && !pageTurn.forward);
            // Mounted always in the viewer; only for the direction in play in the editor.
            const keep = !editable;
            const leftRole = spreadLeftIdx === idx ? 'current' : 'prev';
            const rightRole = spreadRightIdx === idx ? 'current' : 'next';
            const gridRole = (r: string) => (r === 'current' ? 'current' : 'partner');
            // A copy is a page OR an inside cover, decided the same way the settled spread decides
            // it, so the overlay cannot disagree with what is underneath it.
            const copy = (pg: DemoPage | null, role: string, side?: 'left' | 'right', i?: number) => {
              if (pg)
                return renderGrid({ page: pg, width: bookW, role: gridRole(role) as GridRole, captionFields, ownedIds, scanUrlOf, decorative: true });
              const cover = side !== undefined && i !== undefined ? drawCover(coverOf(i, side)) : null;
              if (cover) return cover;
              // NO PAGE AND NO COVER, which is the blank half at either end of an undressed binder.
              // It still has to be OPAQUE. The overlay's job is to hide the settled spread while a
              // turn is in the air, and a hole in it let the arriving page show through from the
              // first frame - the long-standing glitch when turning off page one, or onto a final
              // spread with nothing facing it.
              return <View style={[styles.endGap, { backgroundColor: theme.background }]} />;
            };
            const boxH = (pg: DemoPage | null) =>
              pageHeightAt(bookW, (pg ?? page).rows, (pg ?? page).cols, captionsOn);
            return (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, !pageTurn && styles.kept]}>
                <View style={styles.turnLayer}>
                  <View style={[styles.spreadRow, { gap: bookGap }]}>
                    <SpreadColumn
                      // Present even when this half of the spread is not, since it is what holds
                      // the left-hand box: same reason the right column is.
                      page={baseLeft ?? page}
                      width={bookW}
                      label={leftPage ? `Page ${spreadLeftIdx + 1}` : ''}
                      editable={editable}
                      columnIndex={0}
                      role={leftRole}
                      flat>
                      {/* The box is stated outright in both columns, because one holding nothing
                          but absolutely positioned children measures zero wide, and a column is as
                          wide as its widest child — which would collapse this half of the overlay
                          to the width of its "Page N" label and take the row's centring with it. */}
                      <View style={{ width: bookW, height: boxH(baseLeft) }}>
                        {/* The outgoing left page, covered as a forward sheet lands on it. Going
                            BACKWARD this position holds the page the settled spread underneath is
                            already drawing, so the copy is kept but not shown. */}
                        {keep || turningFwd ? (
                          <View style={[StyleSheet.absoluteFill, !turningFwd && styles.kept]}>
                            {copy(baseLeft, leftRole, 'left', warmLeftIdx)}
                          </View>
                        ) : null}
                      </View>
                    </SpreadColumn>
                    <SpreadColumn
                      // The column HOSTS the sheets, so it has to exist even on a spread whose
                      // right half does not: a binder with an odd last page turned to it with no
                      // animation at all, because a column with no page renders no children.
                      page={baseRight ?? page}
                      width={bookW}
                      label={rightPage ? `Page ${spreadRightIdx + 1}` : ''}
                      editable={editable}
                      columnIndex={2}
                      role={rightRole}
                      flat>
                      <View style={{ width: bookW, height: boxH(baseRight) }}>
                        {/* The outgoing right page, covered as a backward sheet lands on it. */}
                        {keep || turningBwd ? (
                          <View style={[StyleSheet.absoluteFill, !turningBwd && styles.kept]}>
                            {copy(baseRight, rightRole, 'right', warmRightIdx)}
                          </View>
                        ) : null}
                        {/* Each sheet fills the box rather than sitting in the flow of it: the leaf
                            inside is absolutely positioned against its parent, so a wrapper of no
                            height would leave it with none either. */}
                        {keep || turningFwd ? (
                          <View style={[StyleSheet.absoluteFill, !turningFwd && styles.kept]}>
                            <TurnLeaf
                              t={turnT}
                              forward
                              width={bookW}
                              hingeLeft={0}
                              // The gap between the facing pages IS this book's spine, and the
                              // sheet has to cross all of it to lie down on the other one.
                              spine={bookGap}
                              // The sheet's own two faces. Its back at the very front of the book
                              // is the inside front cover, which is what a forward turn off the
                              // cover spread lands on.
                              front={copy(fwdFront, 'current', 'right', warmRightIdx)}
                              back={copy(fwdBack, 'current', 'left', warmRightIdx >= 0 ? warmRightIdx + 1 : -1)}
                            />
                          </View>
                        ) : null}
                        {keep || turningBwd ? (
                          <View style={[StyleSheet.absoluteFill, !turningBwd && styles.kept]}>
                            <TurnLeaf
                              t={turnT}
                              forward={false}
                              width={bookW}
                              hingeLeft={0}
                              spine={bookGap}
                              front={copy(bwdFront, 'current', 'right', warmLeftIdx > 0 ? warmLeftIdx - 1 : -1)}
                              back={copy(bwdBack, 'current', 'left', warmLeftIdx)}
                            />
                          </View>
                        ) : null}
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
      {count > 1 || coverStripExtras ? (
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
          // A shut binder, or one focused on a cover, has no page to highlight.
          currentIndex={shut || coverFocus ? -1 : idx}
          onSelect={selectPage}
          onReorder={onReorderPages}
          {...coverStripExtras}
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
  // The blank facing half at either end of an undressed binder, filling its column so the
  // overlay has no hole in it.
  endGap: { flex: 1, alignSelf: 'stretch' },
  // KEPT, NOT SHOWN. Opacity rather than display:none or an unmount, because the entire point is
  // that these pages stay laid out and their images stay decoded; a hidden subtree that has to be
  // rebuilt when it is shown is the thing this replaced.
  kept: { opacity: 0 },
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
