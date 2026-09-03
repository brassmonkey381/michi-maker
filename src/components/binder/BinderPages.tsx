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
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { CoverDecorationLayer, type LiveDrag } from '@/components/binder/CoverDecorationLayer';
import { COVER_ABBR, withSurface } from '@/components/binder/CoverEditor';
import { patchDecoration, removeDecoration } from '@/data/coverDecorations';
import { boxContains, decorationBox } from '@/data/coverGeometry';
import { useBinders } from '@/store/binders';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';

import { pillChip, sheet } from '@/constants/ui';
import { AboutHoverCard, PAGE_DESCRIPTION_PLACEHOLDER, useHoverReveal } from '@/components/binder/AboutPopup';
import { hasTextCaption, type CaptionFieldKey } from '@/data/cardCaption';
import { PEEK_MIN_WIDTH, SPREAD_GAP, bookLayout, pageHeightAt, spreadLayout } from '@/data/binderLayout';
import { useCardLabelPrefs } from '@/hooks/use-card-label-prefs';
import { useViewPrefs, type ViewPrefsState } from '@/hooks/use-view-prefs';
import { CoverSurface } from '@/components/binder/BinderCover';
import { COVER_SURFACE_LABELS, binderColourway, binderModel, type CoverSurfaceId } from '@/data/binderModels';
import { cardThumbUrl } from '@/lib/catalogConfig';
import type { BinderCover, CoverDecoration, DemoBinder, DemoPage, DemoSlot } from '@/data/binderTypes';
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

/**
 * A few pixels between the bottom of the page and the strip beneath it.
 *
 * 18, not 10, and the difference is tolerance rather than taste. The page strip is sticky AND
 * OPAQUE, so it does not merely sit below the page — it covers whatever reaches it. At 10 the page
 * cleared it by exactly 1px at both of the heights where the page was above its floor, which is not
 * clearance, it is a coincidence: one taller strip or one rounding change and a full-size page
 * starts hiding behind it while a bounds-only fit check still reports green. That is the failure
 * this number now buys distance from.
 */
const PAGE_BREATHING_ROOM = 18;

/**
 * The page-navigation rail, when it is docked to the left rather than along the bottom.
 *
 * It costs WIDTH instead of HEIGHT, and height is what the page is short of: the strip along the
 * bottom takes about 115px of a budget that is only ~530px on a 900px window, while the same rail
 * on the left costs nothing the page was using — a height-fitted page leaves hundreds of pixels
 * spare either side.
 */
const NAV_RAIL_WIDTH = 78;

/**
 * The "Page 3 ›" label above each column, and the page wrap's own bottom margin.
 *
 * Neither is modelled by `pageHeightAt`, which describes the GRID — but both sit inside the space
 * the page has to fit into, so a budget that ignores them hands the layout more room than exists.
 * That was worth 26px of label and 18px of margin, and it is why the page overflowed by ~34px the
 * moment the rail freed enough height for the difference to show.
 *
 * Measured from the styles rather than guessed: neighborLabel is a `small` line (about 20px) with
 * marginBottom 6, and pageWrap carries a vertical margin whose lower half nothing else counts.
 * KEEP THIS IN STEP WITH styles.pageWrap — they are the same number said twice, and the layout
 * silently over-reaches by the difference if they drift.
 */
const COLUMN_LABEL_H = 26;
const PAGE_WRAP_BOTTOM_MARGIN = 8;
/**
 * ...and the same margin above it. Both are real height and both were spent by the same style;
 * only one of them was ever subtracted, so the fitted page was 8px too tall by construction.
 */
const PAGE_WRAP_TOP_MARGIN = 8;

/**
 * What a caller needs to draw the cover's tools somewhere of its own choosing: which surface, what
 * is selected on it, and the two writers. Handed over after commit, never during render.
 */
/**
 * WHAT THE BINDER IS SHOWING INSTEAD OF AN OPEN SPREAD. 'front' and 'back' are the binder shut;
 * 'tail' is the back of the last sheet of an odd count, facing the inside back. The two inside
 * covers are here for the SINGLE-PAGE view only: a book shows them as the empty half of the first
 * or last spread, but a single page has no halves, so it shows an inside cover on its own, the
 * way it shows a page on its own.
 */
type ShutState = null | 'front' | 'back' | 'tail' | 'frontInside' | 'backInside';

export interface CoverToolsContext {
  surface: CoverSurfaceId;
  selected: string | null;
  onSelect: (id: string | null) => void;
  cover: BinderCover;
  onChange: (cover: BinderCover) => void;
  /** Move to another of the four surfaces — the panel's FC/IFC/IBC/BC chips. */
  onFocusSurface: (surface: CoverSurfaceId) => void;
  /** Let the cover go: back to the page, nothing focused, nothing selected. */
  onClearFocus: () => void;
  /** Surface width ÷ height as drawn on the spread, for the panel's Y and H units. */
  surfaceAspect: number;
  /**
   * Where the focused surface is ON THE WINDOW right now, or null before it has laid out. A drop
   * from the tray lands at window coordinates; this is what turns them into a place on the cover.
   */
  measureSurface: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  /** Natural width ÷ height per decoration id, learned from image loads, for rows that do not store one. */
  naturalAspects: Record<string, number>;
  /**
   * A preview that writes nothing: the same live proxy a drag uses, so a colour picker mid-drag
   * repaints the cover without a store write per tick. Null clears it; the commit follows through
   * onChange as usual.
   */
  onLivePatch: (id: string, patch: Partial<CoverDecoration> | null) => void;
}

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
  /**
   * Where the scroll viewport starts in the window — measured by the caller, because only the
   * caller knows what it puts outside its own scroller (its header, a safe-area inset). Everything
   * INSIDE the scroller is measured here instead, so this is the only number that has to arrive
   * from outside, and it is a measurement rather than the estimate it replaced.
   */
  viewportTop?: number;
  /**
   * Height reserved BELOW the binder, for chrome the caller pins to the bottom of the window.
   * Symmetric with `viewportTop` and needed for the same reason: the budget is measured from the
   * window, so anything floating over the bottom of it is invisible to this component and the
   * page would size itself straight underneath.
   */
  viewportBottom?: number;
  /**
   * The width the page settled on, reported back so the caller can size whatever it puts BESIDE
   * the page from what the page actually took rather than from a constant.
   *
   * WHAT IS REPORTED IS THE WIDTH THE PAGE WANTS, not the width it got. That distinction is the
   * whole reason this is not a cycle, and it used to be left to an invariant that does not hold:
   * "the page is sized by HEIGHT, so its width does not respond to available width". True only
   * while the height budget is the binding constraint. Open both docks and the page becomes
   * WIDTH-constrained — `pageWidth` is `min(byHeight, whatIsLeft)` — so it starts moving with the
   * space beside it, the edge closes, and the layout oscillates: the panel takes a little, the page
   * reports needing a little less, the panel takes a little more.
   *
   * `preferredWidth` is computed from the height budget alone, so it cannot move with the panels.
   * The loop is broken by construction rather than by a rule someone has to keep remembering.
   */
  onPageWidth?: (width: number) => void;
  /**
   * The caller's own chips, rendered in the SAME row as the view pills.
   *
   * The editor used to stack its chip row above this component's chip row: two lines of pills, one
   * after the other, about 36px of the page's height budget spent on the gap between two things
   * that are the same kind of thing. They wrap together now, so a wide window puts them on one line
   * and a narrow one wraps them as one group rather than as two fixed rows.
   */
  toolPills?: ReactNode;
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
  /**
   * Tapping the page's title line opens the editor's details dialog. A page's name is edited where
   * the name IS, rather than in a panel that used to open above the binder and push it down.
   */
  onEditPage?: () => void;
  /** The view-settings dialog, opened by a gear the CALLER puts in chrome it already has. */
  settingsOpen?: boolean;
  onCloseSettings?: () => void;
  /**
   * More settings, supplied by the caller, shown under the view chips in the same dialog. The
   * editor puts the binder-wide look here — page size and background — because they belong with
   * the other "how this binder shows itself" choices rather than in a page-by-page tools card.
   */
  settingsExtras?: ReactNode;
  /**
   * EVERYTHING NEEDED TO DRAW THE COVER'S TOOLS SOMEWHERE ELSE — or null when no cover surface is
   * being decorated. Reported after each commit, never during render, because this component
   * clears its own cover state mid-render to keep the page turn frame-accurate and a child may
   * not update a parent while rendering.
   */
  onCoverContext?: (ctx: CoverToolsContext | null) => void;
  /**
   * THE VIEW PREFERENCES, WHEN THE CALLER ALSO NEEDS THEM.
   *
   * `useViewPrefs` resolves edited-over-account-over-device per instance and `setPref` writes the
   * WHOLE bag, so a second copy of the hook is not a second reader — it is a second writer with a
   * stale idea of every field it is not touching. Toggle the nav dock here, drag a dock edge there,
   * and the second write puts the rail back. One instance, passed down.
   *
   * Omit it and this component keeps its own, which is what the public viewer does.
   */
  view?: ViewPrefsState;
  /** Shared "which spread column is mid-drag" value, so that column lifts above its neighbours
   *  (edit only). Omit on read-only surfaces. */
  dragCol?: SharedValue<number>;
}

export function BinderPages({
  binder,
  pageIndex,
  onPageChange,
  availableWidth,
  viewportTop = 0,
  viewportBottom = 0,
  onPageWidth,
  toolPills,
  maxWidth,
  editable,
  viewerIsOwner = false,
  renderGrid,
  onReorderPages,
  pageHeader,
  onEditPage,
  settingsOpen = false,
  onCloseSettings,
  settingsExtras,
  onCoverContext,
  view: viewProp,
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
  // Called unconditionally so hook order never varies; the prop wins when the caller has its own.
  const ownView = useViewPrefs();
  const view = viewProp ?? ownView;
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
  // WHAT SITS ABOVE THE PAGE, MEASURED — not guessed, and not measured in two halves.
  //
  // This used to be `chromeAllowance` (a literal the caller passed: 88 in view mode, 130 or 330 in
  // the editor) plus `chromeAbove` (the height of this component's own chrome). The literal was
  // wrong by about a hundred pixels — the page actually starts around y=184 in view mode — and it
  // was wrong in a way nothing could report, because it was a caller's estimate of things this
  // component cannot see. Add a pill to the editor's header and the page silently mis-sizes.
  //
  // `contentAbove` is the page area's own offset inside the scroll content, so it covers this
  // component's chrome AND everything the caller stacks above it, in one number that cannot drift
  // from the truth. Deliberately the offset within the CONTENT rather than the window: a
  // window-space measurement changes as you scroll, and a budget that changes as you scroll is a
  // feedback loop.
  // Whether the "which fields" chips are showing. Closed by default: it is a setup control, and
  // every line above the page is height the page does not get.
  const [fieldsOpen, setFieldsOpen] = useState(false);
  /**
   * MEASURED AS A HEIGHT, NOT A POSITION — and that distinction is the whole bug it fixes.
   *
   * This was the page area's `y` inside the scroll content, which is the more complete number: it
   * covers this component's chrome AND everything the caller stacks above it, in one reading. It is
   * also a number react-native-web will not reliably tell you about. `onLayout` there is backed by
   * a ResizeObserver on the element itself, so it fires when the element's SIZE changes and NOT
   * when something above it grows and pushes it down. The first reading was therefore taken before
   * the chrome had settled and then never corrected: the page was drawn ~11px too tall on arrival,
   * and the first thing that forced a re-layout — any panel toggle — snapped it to the right size
   * as a visible jump the user could not explain.
   *
   * Heights do fire. So the space above the page is now the sum of two heights, each measured on
   * the element that owns it: this component's chrome block, and (via `viewportTop`) everything the
   * caller puts above it.
   */
  const [contentAbove, setContentAboveRaw] = useState(0);
  const [stripHeight, setStripHeightRaw] = useState(0);
  const setContentAbove = (y: number) =>
    setContentAboveRaw((cur) => (Math.abs(cur - y) > 2 ? Math.round(y) : cur));
  const setStripHeight = (h: number) =>
    setStripHeightRaw((cur) => (Math.abs(cur - h) > 2 ? Math.round(h) : cur));
  // Rounded and only accepted on a real change, so a sub-pixel wobble cannot start a measure/render
  // loop — safe because neither number depends on the page's own height: one is the space above it
  // and the other the strip below it.
  /**
   * WHERE THE PAGE STRIP LIVES, and what it costs.
   *
   * Along the bottom it costs HEIGHT — about 115px of a budget that is only ~530px on a 900px
   * window, i.e. a fifth of the page. As a left rail it costs WIDTH, which a height-fitted page has
   * in abundance: on a 1920 desktop the page is around 500px wide and the rest is empty.
   *
   * `stripHeight` is forced to zero rather than trusted when the rail is on the left: the bottom
   * dock is unmounted then, so its onLayout never fires again and the state would keep whatever it
   * last measured — the page would pay for a strip that is not there.
   */
  /**
   * WHAT A COLUMN CALLS ITSELF. A page's own title if it has one, its number if it does not.
   *
   * The title used to have a row of its own above the binder, saying something this label was
   * already half-saying two lines below it. Putting it here costs nothing — the label was always
   * drawn — and puts a page's name on the page rather than on the chrome.
   */
  const columnLabel = (pg: DemoPage | null | undefined, fallback: string) =>
    (pg?.title || '').trim() || fallback;
  const railLeft = view.navDock === 'left';
  const heightBudget = Math.max(
    0,
    windowHeight -
      viewportTop -
      viewportBottom -
      contentAbove -
      (railLeft ? 0 : stripHeight) -
      COLUMN_LABEL_H -
      PAGE_WRAP_BOTTOM_MARGIN -
      PAGE_WRAP_TOP_MARGIN -
      PAGE_BREATHING_ROOM,
  );
  /**
   * THE RAIL IS SIZED BY THE WINDOW, NOT BY THE PAGE.
   *
   * It used to carry `maxHeight: 620` — the height a page happened to render at on a 900px window,
   * pasted onto navigation chrome — so on a 1290px monitor the filmstrip stopped at y~660 while the
   * binder ran to 850 and the window to 1290, sliced through a thumbnail. `alignSelf: 'stretch'`
   * was no better: it sizes the rail to the ROW, and the row's height is the page beside it. Either
   * way the rail was measuring the wrong thing.
   *
   * `heightBudget` is what the page GRID may occupy. The rail is a sibling of the whole page wrap,
   * so it gets that budget back plus the three terms the grid had to surrender and the rail does
   * not owe: the column label and the wrap's two margins. Clamped to the window because on the
   * first frame `viewportTop` and `contentAbove` are both still 0.
   */
  const railHeight = Math.min(
    windowHeight,
    heightBudget + COLUMN_LABEL_H + PAGE_WRAP_TOP_MARGIN + PAGE_WRAP_BOTTOM_MARGIN,
  );
  // The rail is drawn inside this component, so the width it takes is invisible to the callers that
  // compute availableWidth. It comes off here instead, before anything is laid out against it.
  const pageAvailable = Math.max(0, availableWidth - (railLeft ? NAV_RAIL_WIDTH : 0));
  const captionsOn = hasTextCaption(captionFields);
  const spreadGap = SPREAD_GAP;
  // THE BOOK NEEDS A FLOOR OF ITS OWN. Halving the width is only a good trade while both halves
  // stay readable: on a 390px phone it yields two 171px pages, whose cards come out around 51px —
  // thumbnails, not artwork. Nothing stopped that, because the book path had no width gate at all.
  // Below the threshold the pages are shown one at a time and the toggle is not offered, which is
  // the honest answer on a screen that cannot hold a spread.
  const canDoubleSide = pageAvailable >= PEEK_MIN_WIDTH;
  const doubleSided = doubleSidedWanted && canDoubleSide;
  // Peeks need room for a page AND two strips; below that the page goes it alone, as on a phone.
  // Judged on what the page actually gets. Reading the pre-rail width here would promise a spread
  // the reduced budget cannot draw.
  const showSpread = !doubleSided && count > 1 && pageAvailable >= PEEK_MIN_WIDTH;
  const layout = spreadLayout({
    availableWidth: pageAvailable,
    availableHeight: heightBudget,
    rows: page.rows,
    cols: page.cols,
    captionsOn,
    hasNeighbours: showSpread,
    maxWidth,
  });
  const pageWidth = layout.pageWidth;
  const spreadWidth = pageWidth;
  // What the page NEEDS, told to whoever is putting panels beside it — not what it settled on.
  // In an effect rather than during render because it is a message to another component's state;
  // see onPageWidth for why the difference between the two is what stops this closing a loop.
  useEffect(() => {
    onPageWidth?.(layout.preferredWidth);
  }, [layout.preferredWidth, onPageWidth]);
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
  const [shut, setShut] = useState<ShutState>(null);

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
    shut: ShutState;
  } | null>(null);
  /** The sticker selected on the focused surface, for the toolbar to act on. */
  const [coverSelected, setCoverSelected] = useState<string | null>(null);
  /**
   * A sticker mid-drag and where it has got to. Held here rather than in the layer, because the
   * PICTURE is drawn by the surface underneath the layer, and a drag that only moved the hit box
   * left the picture standing still until release.
   */
  const [coverDrag, setCoverDrag] = useState<LiveDrag | null>(null);
  // The one cover write path. Gated on editable so the public viewer, which mounts this same
  // component for anyone's binder, can never write.
  const store = useBinders();
  const writeCover = (cover: BinderCover) => {
    if (editable) store.updateBinder(binder.id, { cover });
  };
  /** The cover swinging open or closed. Separate from pageTurn: no page is changing. */
  // 'tail' here is the LAST SHEET turning over, not a cover: page on its front, blank on its
  // back. It rides the cover hinge because the tail is not a page index, so the index-driven page
  // turn can never fire for it.
  const [coverTurn, setCoverTurn] = useState<null | { end: 'front' | 'back' | 'tail'; closing: boolean }>(null);
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
      if (shut) setShut(null);
      // A page change means the book is open, so no cover can still be in flight. This used to
      // hang off `shut`, which is already null while a cover is opening, so a page turned during
      // that swing kept the cover stage on screen until the sheet landed and then snapped.
      if (coverTurn) setCoverTurn(null);
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

  // THE TWO VIEWS SHOW COVERS DIFFERENTLY, and a switch between them must not strand anyone.
  // The book has a tail (the back of the last sheet) and a hinge animation; the single page has
  // neither, and instead can show an inside cover on its own. Crossing over translates the
  // states one view lacks rather than wiping every cover state, which is what used to happen —
  // and used to mean that turning double-sided off dropped whatever you were decorating. Same
  // adjust-during-render pattern as the page change above.
  if (!doubleSided && (shut === 'tail' || coverTurn)) {
    if (shut === 'tail') setShut('backInside');
    if (coverTurn) setCoverTurn(null);
  }
  if (doubleSided && (shut === 'frontInside' || shut === 'backInside')) {
    // The book shows an inside cover as a half of a spread; a "shut onto it" state has no meaning
    // there. Keep the focus, open the book: the page index is already at that end.
    setCoverFocus(shut);
    setShut(null);
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
    availableWidth: pageAvailable,
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
    coverFocus ??
    (shut === 'front' || shut === 'back' || shut === 'frontInside' || shut === 'backInside'
      ? shut
      : shut === 'tail'
        ? 'backInside'
        : null);


  /**
   * One cover surface, drawn to the page's width so the two halves of the spread line up.
   *
   * LIVE means this is the surface on the spread itself rather than a copy in the turn overlay:
   * the wheel flips over it, a tap in edit mode focuses it, and when focused it carries the
   * sticker layer. Overlay copies and sheet faces stay inert for the same reason renderGrid has
   * `decorative`: a second live copy would steal the gesture.
   */
  /** Every cover on the spread is drawn to the active page's box. See CoverSurface.height. */
  const coverBoxH = pageHeightAt(bookW, page.rows, page.cols, captionsOn);
  /**
   * THE SIZE A COVER IS DRAWN AT. In the book it is one half of the spread, so the two halves line
   * up; in the single-page view it is the page's own width, so a cover stands where a page stands.
   * Everything that draws or hit-tests a surface reads these two rather than bookW / coverBoxH.
   */
  const coverW = doubleSided ? bookW : pageWidth;
  const coverH = doubleSided ? coverBoxH : pageHeightAt(pageWidth, page.rows, page.cols, captionsOn);
  const drawCover = (id: CoverSurfaceId | null, live = false) => {
    if (!id) return null;
    const stickers = binder.cover?.surfaces?.[id] ?? [];
    const editing = live && editable && focused === id;
    // While a sticker is being dragged the SURFACE draws it where the finger is, and the layer
    // keeps working from the committed position so the drag does not compound on itself.
    const shown =
      editing && coverDrag
        ? stickers.map((st) => (st.id === coverDrag.id ? ({ ...st, ...coverDrag.patch } as typeof st) : st))
        : stickers;
    const surface = (
      <CoverSurface
        model={coverModel}
        colourwayId={coverColour.id}
        surface={id}
        width={coverW}
        height={coverH}
        stickers={shown}
        aspects={editing ? naturalAspects : undefined}
        onNaturalSize={editing ? onNaturalSize : undefined}
        wheelTarget={live}>
        {/* The measuring host for drops: exactly the surface's box, drawn under the hit layer. */}
        {editing ? <View ref={surfaceHostRef} pointerEvents="none" style={StyleSheet.absoluteFill} /> : null}
        {editing && binder.cover ? (
          <CoverDecorationLayer
            width={coverW}
            height={coverH}
            items={stickers}
            drag={coverDrag}
            selected={coverSelected}
            onSelect={setCoverSelected}
            onDrag={setCoverDrag}
            onCommit={(sid, patch) => {
              setCoverDrag(null);
              const next = patchDecoration(stickers, sid, patch);
              if (next !== stickers) writeCover(withSurface(binder.cover!, id, next));
            }}
            onRemove={(sid) => {
              setCoverSelected(null);
              const next = removeDecoration(stickers, sid);
              if (next !== stickers) writeCover(withSurface(binder.cover!, id, next));
            }}
            snap={view.coverSnap}
            grid={view.coverGrid}
          />
        ) : null}
      </CoverSurface>
    );
    // In edit mode an unfocused cover is one tap from being the one you are decorating — and if
    // the tap landed ON a picture, that picture is selected in the same tap, so the layers tray and
    // the properties open on the thing you pointed at rather than on nothing.
    if (live && editable && !editing) {
      return (
        <Pressable
          onPress={(e) => {
            focusCover(id);
            const ne = e.nativeEvent as { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
            const px = ne.locationX ?? ne.offsetX;
            const py = ne.locationY ?? ne.offsetY;
            if (px == null || py == null) return;
            // Front-most first, so the top picture wins where two overlap.
            const hit = [...stickers].reverse().find((d) => !d.hidden && boxContains(decorationBox(d, coverW, coverH), px, py));
            if (hit) setCoverSelected(hit.id);
          }}
          accessibilityLabel={`Decorate ${COVER_ABBR[id]}`}>
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
    // In the book the outside covers are seen shut and the inside back of an odd count is seen
    // on the tail; the inside covers are otherwise halves of a spread. The single-page view has
    // no halves, so every surface is shown on its own, "shut" onto it.
    const wantShut: ShutState = !doubleSided
      ? id
      : id === 'front'
        ? 'front'
        : id === 'back'
          ? 'back'
          : id === 'backInside' && count % 2 === 1
            ? 'tail'
            : null;
    // And every cover belongs to one end of the binder, so the page index goes there too: opening
    // a cover that was focused from the middle of the binder must land on the page it is
    // actually attached to, not on wherever the reader happened to be.
    const target = id === 'front' || id === 'frontInside' ? 0 : doubleSided ? Math.max(0, lastSpreadLeft) : Math.max(0, count - 1);
    if (target !== idx) {
      setPending({ focus: id, shut: wantShut });
      onPageChange(target);
      return;
    }
    setShut(wantShut);
    setCoverFocus(id);
  };

  /**
   * TELL THE CALLER WHICH COVER IS BEING DECORATED, so it can put the tools in its Artwork panel
   * rather than under the binder — three lines of chrome that used to appear the moment any of the
   * four surfaces was touched, and took that height off the pages.
   *
   * Deps are primitives only: the context object is rebuilt every render, so depending on it would
   * publish forever.
   */
  const coverForTools = binder.cover;
  /**
   * NATURAL SIZES, learned rather than stored: the renderer reports each image's size as it
   * loads, and a crop letterboxes against it. Written to the row only when the row is next
   * changed by hand (a crop, "original aspect"), never on load — a load is not an edit.
   */
  const [naturalAspects, setNaturalAspects] = useState<Record<string, number>>({});
  const onNaturalSize = useCallback((id: string, w: number, h: number) => {
    if (!(w > 0) || !(h > 0)) return;
    setNaturalAspects((cur) => (cur[id] ? cur : { ...cur, [id]: w / h }));
  }, []);
  const onLivePatch = useCallback(
    (id: string, patch: Partial<CoverDecoration> | null) =>
      setCoverDrag(patch ? { id, patch, guideX: null, guideY: null } : null),
    [],
  );
  // The live surface's host, for measuring where it is on the window at drop time.
  const surfaceHostRef = useRef<View>(null);
  const measureSurface = () =>
    new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
      const host = surfaceHostRef.current;
      if (!host) return resolve(null);
      host.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
    });
  // The spread draws a cover to the page's box, so that is the aspect the panel's units use.
  const surfaceAspectForTools = coverW / Math.max(1, coverH);
  useEffect(() => {
    if (!onCoverContext) return;
    onCoverContext(
      editable && coverForTools && focused
        ? {
            surface: focused,
            selected: coverSelected,
            onSelect: setCoverSelected,
            cover: coverForTools,
            onChange: writeCover,
            onFocusSurface: focusCover,
            // selectPage on the current page is exactly "put the binder back the way a page reads".
            onClearFocus: () => selectPage(idx),
            surfaceAspect: surfaceAspectForTools,
            measureSurface,
            naturalAspects,
            onLivePatch,
          }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, coverForTools, focused, coverSelected, onCoverContext, surfaceAspectForTools, naturalAspects, onLivePatch]);
  /**
   * THE BACK OF THE LAST SHEET. A binder with an odd page count has one more page than it has
   * been given: the reverse of its final sheet, which is a real pocket page with nothing in it. It
   * is what faces the inside back cover, and what the back cover closes onto. Drawn, not stored:
   * the moment the owner adds a page, that page IS this one, and the binder is even again.
   */
  const lastPage = binder.pages[count - 1];
  const tailPage: DemoPage | null =
    count % 2 === 1 && lastPage
      ? { id: 'tail:back-of-last-sheet', rows: lastPage.rows, cols: lastPage.cols, slots: [] }
      : null;

  const spreadLeftIdx = idx === 0 ? -1 : idx % 2 === 1 ? idx : idx - 1;
  const spreadRightIdx = idx === 0 ? 0 : spreadLeftIdx + 1 < count ? spreadLeftIdx + 1 : -1;

  /**
   * THE COVERS IN THE FILMSTRIP. Pages keep their numbers; a cover gets the abbreviation a printer
   * would use. In both views of a dressed binder: the book draws them as spread halves and shut
   * ends, the single page draws each one on its own. Each thumb is the real renderer at 58px, so
   * the strip shows what is actually on it.
   */
  const coverStripExtras: { leading?: StripExtra[]; trailing?: StripExtra[] } | undefined =
    binder.cover
      ? (() => {
          const extra = (id: CoverSurfaceId, current: boolean): StripExtra => ({
            key: `cover:${id}`,
            // How many layers the surface carries, so the strip says which covers are dressed.
            label: (() => {
              const n = (binder.cover?.surfaces?.[id] ?? []).filter((d) => !d.hidden).length;
              return n ? `${COVER_ABBR[id]} · ${n}` : COVER_ABBR[id];
            })(),
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
              extra('frontInside', shut === 'frontInside' || (!shut && focused === 'frontInside')),
            ],
            trailing: [
              extra('backInside', shut === 'tail' || shut === 'backInside' || (!shut && focused === 'backInside')),
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
  const canShut = Boolean(binder.cover) && count > 0;
  const step = useCallback(
    (dir: 1 | -1) => {
      // Every change of shut drops an explicit focus. The surface in focus is then whichever one
      // the binder is showing, which is the only one it makes sense to be decorating.
      const changeShut = (next: ShutState) => {
        setShut(next);
        setCoverFocus(null);
        setCoverSelected(null);
        setCoverDrag(null);
        setPending(null);
      };
      if (!doubleSided && canShut) {
        // THE SINGLE-PAGE VIEW WALKS THE COVERS LIKE PAGES: front, inside front, the pages, inside
        // back, back — one step each, no hinge, and the same wheel and keys that turn a page.
        if (shut === 'front') {
          if (dir === 1) changeShut('frontInside');
          return;
        }
        if (shut === 'frontInside') {
          if (dir === 1) changeShut(null);
          else changeShut('front');
          return;
        }
        if (shut === 'backInside') {
          if (dir === 1) changeShut('back');
          else changeShut(null);
          return;
        }
        if (shut === 'back') {
          if (dir === -1) changeShut('backInside');
          return;
        }
        if (shut) {
          changeShut(null);
          return;
        }
        const target = dir === 1 ? forward : backward;
        if (target < 0) {
          changeShut('frontInside');
          return;
        }
        if (target >= count) {
          changeShut('backInside');
          return;
        }
        onPageChange(target);
        return;
      }
      if (shut === 'tail') {
        // Back into the book (the last sheet turns back), or on to shut (the cover lands on the
        // blank back of that sheet).
        if (dir === -1) {
          changeShut(null);
          setCoverTurn({ end: 'tail', closing: false });
        } else {
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
          if (count % 2 === 1) {
            changeShut('tail');
            setCoverTurn({ end: 'tail', closing: true });
          } else {
            changeShut('back');
            setCoverTurn({ end: 'back', closing: true });
          }
        }
        return;
      }
      onPageChange(target);
    },
    [shut, forward, backward, count, canShut, onPageChange, doubleSided],
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
        shut === 'front'
          ? dir === 1
          : shut === 'back'
            ? dir === -1
            : shut === 'tail' || shut === 'frontInside' || shut === 'backInside'
              ? true
              : !atEdge || canShut;
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
      <View onLayout={(e) => setContentAbove(e.nativeEvent.layout.height)}>
      {/* VIEW SETTINGS LIVE BEHIND A GEAR, not on a row above the binder.

          Double-sided, Card labels, which labels, where the page strip sits, Owned and Scans
          are settled preferences — chosen once, then you look at your binder. As a row they
          cost the page a permanent line of height in BOTH modes to hold controls nobody
          touches twice in a session. The caller puts the gear in chrome it already has (its
          header), so these now cost the page nothing at all.

          The page title went the same way, upward: it is the column label now (see the
          `label` passed to SpreadColumn), which already said "Page 1" in the same place. One
          line instead of two, and the name sits on the page it names. */}
      {settingsOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={onCloseSettings}>
          <View style={sheet.dialogBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onCloseSettings} />
            <ThemedView type="backgroundElement" style={styles.settingsCard}>
              <View style={styles.settingsHead}>
                <ThemedText type="subtitle">View</ThemedText>
                <Pressable onPress={onCloseSettings} hitSlop={10}>
                  <Text style={styles.fieldsDone}>Done</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.settingsBody} keyboardShouldPersistTaps="handled">
        <View style={styles.viewToggles}>
          {toolPills}
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
          {/* IN THE PILL ROW, not on a line of its own. The first attempt at this put the
              disclosure on its own line, which removed a 36px row of chips and added a 36px chip:
              the page's height budget did not move by a single pixel, and only measuring it said
              so. A control that costs a line to save a line saves nothing. */}
          {labelsOn ? (
            <Pressable
              onPress={() => setFieldsOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: fieldsOpen }}
              style={[pillChip.base, fieldsOpen && pillChip.active]}>
              <Text style={[pillChip.text, fieldsOpen && pillChip.textActive]}>
                {fieldsOpen ? '▾ Which' : '▸ Which'}
              </Text>
            </Pressable>
          ) : null}
          {/* WHERE THE PAGE STRIP SITS. Along the bottom it costs the page about 115px of height;
              as a left rail it costs width, which a height-fitted page has to spare. Offered only
              when there is a strip to move. */}
          {count > 1 ? (
            <Pressable
              onPress={() => view.setPref('navDock', railLeft ? 'bottom' : 'left')}
              accessibilityRole="button"
              accessibilityLabel={railLeft ? 'Move page navigation to the bottom' : 'Move page navigation to the left'}
              style={[pillChip.base, railLeft && pillChip.active]}>
              <Text style={[pillChip.text, railLeft && pillChip.textActive]}>
                {railLeft ? '⬒ Pages left' : '⬓ Pages below'}
              </Text>
            </Pressable>
          ) : null}
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
        {/* WHICH fields, folded away until you are choosing them.
            
            This is nine chips on their own line, and it was on screen the whole time labels were —
            about 36px of the page's height budget spent on a control you touch when you set your
            labels up and then never again. On a 900px window the page only gets ~530px to begin
            with, so a permanent configuration row is one of the more expensive things on screen.
            
            It gets its own line rather than going inline for the reason it always did: inline it
            widened the Card labels pill and shoved Double-sided, Owned and Scans sideways every
            time labels were switched on. */}
        {/* IN A DIALOG, not a row that opens here. Opening it used to add a line above the binder,
            which moved the pages down and shrank them; a dialog costs the layout nothing. */}
        {fieldsOpen ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setFieldsOpen(false)}>
            <View style={sheet.dialogBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setFieldsOpen(false)} />
              <ThemedView type="backgroundElement" style={styles.fieldsCard}>
                <View style={styles.fieldsHead}>
                  <ThemedText type="subtitle">Which labels</ThemedText>
                  <Pressable onPress={() => setFieldsOpen(false)} hitSlop={10}>
                    <Text style={styles.fieldsDone}>Done</Text>
                  </Pressable>
                </View>
                <CaptionFieldRow enabled={labelsOn} fields={labelFields} onToggleField={toggleLabelField} />
              </ThemedView>
            </View>
          </Modal>
        ) : null}
                {settingsExtras}
              </ScrollView>
            </ThemedView>
          </View>
        </Modal>
      ) : null}
        {/* THE COVER'S TOOLS ARE NOT HERE ANY MORE.

            They were a name, a hint and a row of nine buttons directly under the binder — three
            lines, inside the measured block, so every one of the four surfaces cost the pages the
            same chunk of height the moment you touched it. They are in the Artwork panel now,
            which opens on its Cover tab when a surface is picked: the same tools, beside the
            binder rather than under it, where they take nothing from the page. */}
      </View>


      {/* The page — a prev · current · next spread on wide screens, else the single page. */}
      {/* testID rides through to data-testid on web. It exists so a screenshot harness can MEASURE
          the rendered page rather than infer it from arithmetic — the gap that made the on-card
          label work take six rounds of guessing. Costs nothing at runtime. */}
      {/* THE PAGE, AND OPTIONALLY A RAIL BESIDE IT.

          The wrapper is always a row, so there is one layout rather than two — with the rail on the
          bottom it simply has a single child. The page-turn overlay is absolutely positioned INSIDE
          pageWrap, so it stays inside pageWrap: the rail is its sibling and a turn never sweeps
          across the navigation.

          The content measurement moved up here with it. It is this wrapper's offset in the scroll
          content that says how much sits above the page now, and measuring the inner view would
          report 0 the moment a rail put it inside a row. */}
      <View style={[styles.pageRow, railLeft && styles.pageRowRailed]}>
      {railLeft && (count > 1 || coverStripExtras) ? (
        <View style={[styles.navRail, { backgroundColor: theme.background, height: railHeight }]}>
          <PageStrip
            axis="vertical"
            pages={binder.pages}
            currentIndex={shut || coverFocus ? -1 : idx}
            onSelect={selectPage}
            onReorder={onReorderPages}
            {...coverStripExtras}
          />
        </View>
      ) : null}
      <GestureDetector gesture={swipe}>
      <View
        ref={pageWrapRef}
        style={[styles.pageWrap, railLeft && styles.pageWrapRailed]}
        testID="binder-page-wrap">
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
        ) : shut && !doubleSided ? (
          // A COVER ON ITS OWN, in the single-page view: one column at the page's width, where the
          // page would be, named like a page is. Any of the four surfaces.
          <View style={[styles.spreadRow, { gap: bookGap }]}>
            <CoverColumn width={coverW} height={coverH} label={COVER_SURFACE_LABELS[focused ?? 'front']}>
              {drawCover(focused ?? 'front', true)}
            </CoverColumn>
          </View>
        ) : shut ? (
          // SHUT, OR THE TAIL. The settled picture of a binder past one of its ends, and the
          // DESTINATION of a cover turn from the first frame of that turn, exactly as a page
          // change is: the overlay carries the stale half and the sheet, and this is what the
          // sheet lands on, already painted. Two page-sized columns, so the binder does not jump.
          (() => {
            const blank = tailPage
              ? renderGrid({ page: tailPage, width: bookW, role: 'partner', captionFields, ownedIds, scanUrlOf, decorative: true })
              : null;
            return (
              <View style={[styles.spreadRow, { gap: bookGap }]}>
                {/* THE OUTSIDE COVERS ARE NAMED TOO, and named in the same place a page is.

                    Every open spread draws a label above each column, so a shut binder that drew
                    none was a line shorter than the binder either side of it — the covers sat
                    higher than the pages and the whole book bobbed as you turned onto them. They
                    also deserve the name on its own merits: "Front cover" is what you are looking
                    at, and until now nothing said so. */}
                <CoverColumn width={bookW} height={coverBoxH} label={shut === 'back' ? 'Back cover' : ''}>
                  {shut === 'back' ? drawCover('back', true) : shut === 'tail' ? blank : null}
                </CoverColumn>
                <CoverColumn
                  width={bookW}
                  height={coverBoxH}
                  label={shut === 'front' ? 'Front cover' : shut === 'tail' ? 'Inside back' : ''}>
                  {shut === 'front'
                    ? drawCover('front', true)
                    : shut === 'tail'
                      ? drawCover('backInside', true)
                      : null}
                </CoverColumn>
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
              label={leftPage ? columnLabel(leftPage, `Page ${spreadLeftIdx + 1}`) : coverOf(spreadLeftIdx, 'left') ? 'Inside front' : ''}
              onFocus={
                leftPage && spreadLeftIdx !== idx ? () => onPageChange(spreadLeftIdx) : undefined
              }
              // The half you are ON has nowhere to navigate to, so its title edits the page
              // instead — the same deal the single-page column gets.
              onPressLabel={leftPage && spreadLeftIdx === idx ? onEditPage : undefined}
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
              label={rightPage ? columnLabel(rightPage, `Page ${spreadRightIdx + 1}`) : coverOf(spreadRightIdx, 'right') ? 'Inside back' : ''}
              onFocus={
                rightPage && spreadRightIdx !== idx ? () => onPageChange(spreadRightIdx) : undefined
              }
              onPressLabel={rightPage && spreadRightIdx === idx ? onEditPage : undefined}
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
              label={prevPage ? `‹ ${columnLabel(prevPage, `Page ${idx}`)}` : ''}
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
              label={columnLabel(page, `Page ${idx + 1}`)}
              onPressLabel={onEditPage}
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
              label={nextPage ? `${columnLabel(nextPage, `Page ${idx + 2}`)} ›` : ''}
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
      {(pageTurn || coverTurn || !editable) && doubleSided && (count > 1 || canShut)
        ? (() => {
            // Addressed from the turn's ORIGIN while turning, from the settled spread while at
            // rest. Those are the same spread across the moment a turn begins, which is the whole
            // trick: the slots do not change, so React has nothing to rebuild.
            const warmLeftIdx = pageTurn ? pageTurn.fromLeftIdx : spreadLeftIdx;
            const warmRightIdx = pageTurn ? pageTurn.fromRightIdx : spreadRightIdx;
            const at = (i: number) => (i >= 0 && i < count ? (binder.pages[i] ?? null) : null);
            const baseLeft = at(warmLeftIdx);
            const baseRight = at(warmRightIdx);
            // The two page sheets. Forward hangs on the right page and turns to the page after it;
            // backward hangs on the page before the left one and turns onto the left page.
            const fwdFront = baseRight;
            const fwdBack = warmRightIdx >= 0 ? at(warmRightIdx + 1) : null;
            const bwdFront = warmLeftIdx > 0 ? at(warmLeftIdx - 1) : null;
            const bwdBack = baseLeft;
            const turningFwd = Boolean(pageTurn?.forward);
            const turningBwd = Boolean(pageTurn && !pageTurn.forward);
            // THE COVER SHEETS. Same rules as the page sheets: kept in the viewer, addressed from
            // where the binder is at rest, shown only for the turn in play. A cover turn never
            // changes the page index, so "at rest" and "the origin" are always the same spread.
            const ctEnd = coverTurn?.end ?? null;
            const closing = Boolean(coverTurn?.closing);
            const frontOpening = ctEnd === 'front' && !closing;
            const frontClosing = ctEnd === 'front' && closing;
            const backOpening = ctEnd === 'back' && !closing;
            const backClosing = ctEnd === 'back' && closing;
            const tailIn = ctEnd === 'tail' && closing;
            const tailOut = ctEnd === 'tail' && !closing;
            const odd = count % 2 === 1;
            const atFirst = spreadLeftIdx === -1;
            const atLast = spreadLeftIdx === Math.max(-1, lastSpreadLeft);
            const dressed = Boolean(binder.cover);
            // Mounted always in the viewer; only for the direction in play in the editor.
            const keep = !editable;
            const keepFront = dressed && atFirst && (keep || frontOpening || frontClosing);
            const keepBack = dressed && atLast && (keep || backOpening || backClosing);
            const keepTail = dressed && atLast && odd && (keep || tailIn || tailOut);
            // WHICH STALE HALF EACH TURN NEEDS DRAWN OVER THE DESTINATION UNTIL THE SHEET LANDS.
            //   left copy   a forward page turn; the back cover closing onto the last page; the
            //               last sheet turning over onto the page before it.
            //   left blank  the back cover closing onto the blank back of the last sheet.
            //   left table  the front cover opening: the inside front underneath must stay hidden
            //               until the sheet lands on it, and what was there before was table.
            //   right copy  a backward page turn; the front cover closing onto page one.
            //   right IBC   the last sheet turning back: the inside back stays until covered.
            //   right table the back cover opening: the inside back underneath stays hidden.
            const showLeftCopy = turningFwd || (backClosing && !odd) || tailIn;
            const showLeftBlank = backClosing && odd;
            const showLeftTable = frontOpening;
            const showRightCopy = turningBwd || frontClosing;
            const showRightIbc = tailOut;
            const showRightTable = backOpening;
            const leftRole = spreadLeftIdx === idx ? 'current' : 'prev';
            const rightRole = spreadRightIdx === idx ? 'current' : 'next';
            const gridRole = (r: string) => (r === 'current' ? 'current' : 'partner');
            const table = () => <View style={[styles.endGap, { backgroundColor: theme.background }]} />;
            // A copy is a page OR an inside cover, decided the same way the settled spread decides
            // it, so the overlay cannot disagree with what is underneath it.
            const copy = (pg: DemoPage | null, role: string, side?: 'left' | 'right', i?: number) => {
              if (pg)
                return renderGrid({ page: pg, width: bookW, role: gridRole(role) as GridRole, captionFields, ownedIds, scanUrlOf, decorative: true });
              const c = side !== undefined && i !== undefined ? drawCover(coverOf(i, side)) : null;
              if (c) return c;
              // NO PAGE AND NO COVER, which is the blank half at either end of an undressed binder.
              // It still has to be OPAQUE. The overlay's job is to hide the settled spread while a
              // turn is in the air, and a hole in it let the arriving page show through from the
              // first frame - the long-standing glitch when turning off page one, or onto a final
              // spread with nothing facing it.
              return table();
            };
            const blank = tailPage ? copy(tailPage, 'partner') : null;
            // POINTER-TRANSPARENT, ALWAYS. These are throwaway copies of pages, drawn only so a
            // turn has something to animate; the reader's pointer belongs to the real binder
            // underneath. Kept ones are `opacity: 0` and were still HIT-TESTABLE, so in
            // double-sided view mode an invisible full-page sheet sat over the binder and ate
            // every hover the pockets should have seen.
            const slot = (on: boolean, node: ReactNode) => (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, !on && styles.kept]}>
                {node}
              </View>
            );
            return (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, !pageTurn && !coverTurn && styles.kept]}>
                <View style={styles.turnLayer}>
                  <View style={[styles.spreadRow, { gap: bookGap }]}>
                    <SpreadColumn
                      // Present even when this half of the spread is not, since it is what holds
                      // the left-hand box: same reason the right column is.
                      page={baseLeft ?? page}
                      width={bookW}
                      // NO WORDS ON THE COPIES. This overlay sits ON TOP of the settled spread,
                      // which is already showing each page's title, so a label here painted a
                      // second one over the first — the "Page 1 / Page 2" ghosting seen mid-turn.
                      // Empty, not absent: the line still holds its 20px so the copy lands exactly
                      // where the real page is.
                      label=""

                      editable={editable}
                      columnIndex={0}
                      role={leftRole}
                      flat>
                      {/* The box is stated outright in both columns, because one holding nothing
                          but absolutely positioned children measures zero wide, and a column is as
                          wide as its widest child — which would collapse this half of the overlay
                          to the width of its "Page N" label and take the row's centring with it. */}
                      <View style={{ width: bookW, height: coverBoxH }}>
                        {keep || showLeftCopy ? slot(showLeftCopy, copy(baseLeft, leftRole, 'left', warmLeftIdx)) : null}
                        {keepTail || showLeftBlank ? slot(showLeftBlank, blank) : null}
                        {showLeftTable ? slot(true, table()) : null}
                      </View>
                    </SpreadColumn>
                    <SpreadColumn
                      // The column HOSTS the sheets, so it has to exist even on a spread whose
                      // right half does not: a binder with an odd last page turned to it with no
                      // animation at all, because a column with no page renders no children.
                      page={baseRight ?? page}
                      width={bookW}
                      label=""

                      editable={editable}
                      columnIndex={2}
                      role={rightRole}
                      flat>
                      <View style={{ width: bookW, height: coverBoxH }}>
                        {keep || showRightCopy ? slot(showRightCopy, copy(baseRight, rightRole, 'right', warmRightIdx)) : null}
                        {keepTail || showRightIbc ? slot(showRightIbc, drawCover('backInside')) : null}
                        {showRightTable ? slot(true, table()) : null}
                        {/* Each sheet fills the box rather than sitting in the flow of it: the leaf
                            inside is absolutely positioned against its parent, so a wrapper of no
                            height would leave it with none either. */}
                        {keep || turningFwd
                          ? slot(
                              turningFwd,
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
                              />,
                            )
                          : null}
                        {keep || turningBwd
                          ? slot(
                              turningBwd,
                              <TurnLeaf
                                t={turnT}
                                forward={false}
                                width={bookW}
                                hingeLeft={0}
                                spine={bookGap}
                                front={copy(bwdFront, 'current', 'right', warmLeftIdx > 0 ? warmLeftIdx - 1 : -1)}
                                back={copy(bwdBack, 'current', 'left', warmLeftIdx)}
                              />,
                            )
                          : null}
                        {/* The front cover: outside on its front, inside front on its back. It lies
                            on the right when shut, so opening travels leftward. */}
                        {keepFront
                          ? slot(
                              frontOpening || frontClosing,
                              <TurnLeaf
                                t={coverT}
                                forward={frontOpening}
                                width={bookW}
                                hingeLeft={0}
                                spine={bookGap}
                                front={drawCover('front')}
                                back={drawCover('frontInside')}
                              />,
                            )
                          : null}
                        {/* The back cover: inside back on its front, outside on its back. It lies
                            on the left when shut, so closing travels leftward. */}
                        {keepBack
                          ? slot(
                              backOpening || backClosing,
                              <TurnLeaf
                                t={coverT}
                                forward={backClosing}
                                width={bookW}
                                hingeLeft={0}
                                spine={bookGap}
                                front={drawCover('backInside')}
                                back={drawCover('back')}
                              />,
                            )
                          : null}
                        {/* The last sheet of an odd count: its page on the front, its blank back
                            on the back. Turning it over reveals the inside back. */}
                        {keepTail
                          ? slot(
                              tailIn || tailOut,
                              <TurnLeaf
                                t={coverT}
                                forward={tailIn}
                                width={bookW}
                                hingeLeft={0}
                                spine={bookGap}
                                front={copy(lastPage ?? null, 'current')}
                                back={blank}
                              />,
                            )
                          : null}
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
      </View>

      {/* Page filmstrip — tap a thumbnail to flip to it; long-press-drag reorders (edit only). */}
      {/* The bottom dock. Rendered only when the rail is NOT on the left — the same strip lives in
          one place or the other, never both. */}
      {(count > 1 || coverStripExtras) && !railLeft ? (
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
 * A cover, in a column shaped exactly like a page's. The label is always rendered — with an empty
 * string for the half that holds nothing — because it is what keeps a shut binder the same height
 * as an open one, and a binder that changes height as it closes reads as jumping.
 */
function CoverColumn({
  width,
  height,
  label,
  children,
}: {
  width: number;
  height: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.neighbor}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.neighborLabel} numberOfLines={1}>
        {label}
      </ThemedText>
      <View style={{ width, height }}>{children}</View>
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
  onPressLabel,
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
  /**
   * What tapping the LABEL does, when that differs from tapping the page. The current column has
   * nowhere to navigate to, so its label opens the page's own details instead — which is where the
   * page title is set, so a page is renamed exactly where its name is shown.
   */
  onPressLabel?: () => void;
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
  // Same deal as the binder's title: hovering a page's name shows what the page is, in BOTH
  // modes, at once, whether or not anything has been written — an empty note is an invitation,
  // not a reason to stay silent. Both halves of an open book hover, selected or not, the way the
  // art placeholders on both halves do: a book is one open thing. In the single-page scroller only
  // the page you are on hovers — its neighbours are peeks, and their labels navigate.
  //
  // Above the empty-column return below, with the other hooks, or the order changes the moment a
  // spread runs out of pages on one side.
  const hover = useHoverReveal(!!page && (flat || role === 'current'));
  const hovering = hover.shown;
  // ONE WRITER FOR THE Z-INDEX. While its card is up this column sits above the facing page (the
  // card is wider than a column, and on an open book the LEFT page's reached under the right one,
  // a later sibling that painted over it). That used to be a separate static style listed after
  // this one — and on web that is not enough: the first time a reorder drag moves `col`,
  // reanimated writes the z-index INLINE on the DOM node, and an inline value beats a class no
  // matter how the array was ordered. From then on the left card was invisible again. Folding the
  // hover into the worklet means whichever path last set the z-index, it set the right one.
  const columnStyle = useAnimatedStyle(
    () => ({ zIndex: col.value === columnIndex ? 30 : hovering ? 40 : 1 }),
    [hovering, columnIndex],
  );
  const hoverText = page?.description?.trim() || PAGE_DESCRIPTION_PLACEHOLDER;
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
      // WHILE ITS CARD IS UP, THIS COLUMN IS ON TOP. The card is absolutely positioned inside the
      // column and is wider than one, so on an open book the LEFT page's card reached under the
      // right page — a later sibling at the same z-index, which therefore painted over it. The
      // left title looked like it had no description at all. Last in the array so it beats the
      // animated z-index rather than racing it.
      style={[styles.neighbor, columnStyle]}
      testID={role === 'current' ? 'binder-page-current' : `binder-page-${role}`}>
      {onPressLabel || onFocus || role === 'current' || flat ? (
        // A hoverable label is a Pressable even when tapping it does nothing (view mode, the
        // current page), which is why it can have no onPress rather than being plain text.
        <Pressable
          onPress={onPressLabel ?? onFocus}
          onHoverIn={hover.onHoverIn}
          onHoverOut={hover.onHoverOut}
          // THE ROW, NOT THE WORDS. react-native-web ignores `hitSlop`, so without this the
          // target was the glyph box of the title alone — a short name was a sliver a few dozen
          // pixels wide in the middle of a page-wide row, and hovering the row beside the words
          // did nothing. Stretching the pressable across the column makes the whole label line
          // answer; the text stays centred inside it. It is a sibling above the page, so it
          // overlaps nothing: the page's own pressable begins where this row's margin ends.
          style={styles.labelPress}
          testID={onPressLabel ? 'binder-page-title' : role === 'current' || flat ? 'binder-page-title-view' : undefined}
          accessibilityRole={onPressLabel || onFocus ? 'button' : 'text'}
          accessibilityLabel={
            onPressLabel ? (editable ? `${label} — edit this page` : `About ${label}`) : label
          }>
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
      {/* LAST, so it paints over the page it overlaps. Its z-index does the same job, but only
          against siblings, and tree order is the half that does not depend on the page's own. */}
      {hover.shown ? <AboutHoverCard kicker={label} text={hoverText} style={styles.labelHover} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  labelsRow: { alignItems: 'center', marginTop: 10 },
  // Wraps: it now carries the editor's chips as well as the view pills, and on a narrow window
  // that is more than one line's worth. Wrapping as one group beats two rows that each half-fill.
  viewToggles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8 },
  pageDetailsRead: { alignItems: 'center', marginTop: 8 },
  /**
   * The height of one `smallBold` line, held whether or not there is a title in it.
   *
   * A description makes the block taller, which is fine: a page carrying two lines of prose is a
   * deliberate thing and the binder settling lower under it reads as the page having more to say.
   * What this stops is the binder JUMPING between a bare page and a titled one, which is the common
   * case and says nothing at all.
   */
  pageDetailsReserved: { minHeight: 20, justifyContent: 'center' },
  fieldsCard: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderRadius: Radius.panel,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  fieldsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  settingsCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '86%',
    alignSelf: 'center',
    borderRadius: Radius.panel,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  settingsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  settingsBody: { alignItems: 'center', gap: 10, paddingBottom: 4 },
  fieldsDone: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.accent },
  // 8, not 18. That margin was free when the page was sized by width and simply overflowed; now
  // that the page is fitted to the height it has, every pixel of margin comes straight off the card
  // art. 36px of it was the difference between a 700px window fitting and not.
  pageWrap: { alignItems: 'center', marginVertical: 8 },
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
  // ONE LINE, ALWAYS, WORDS OR NOT. `type="small"` is lineHeight 20, and stating it as a height
  // means an empty label occupies exactly what a full one does. Every place that needs the space
  // without the text — the turn overlay's copies, the blank half of a shut binder — depends on it,
  // and so does the rule that the binder never changes height as you turn through it.
  neighborLabel: { marginBottom: 6, height: 20 },
  /** The page title's hover/press target: the full width of its column, text centred. */
  labelPress: { alignSelf: 'stretch', alignItems: 'center' },
  // Under the label, overlapping the top of the page it describes — which is the page you are
  // looking at, so the card lands on the thing it is talking about.
  labelHover: { top: 30 },
  // The filmstrip is NAVIGATION, so it may never be the thing you have to scroll to reach. And
  // scrolling to it is worse than it sounds here: the wheel over the binder flips pages instead of
  // scrolling, so hunting for the strip flips you off the page you were on.
  //
  // It cannot simply be made to fit. A 3x3 page at 560px with card labels is 870px tall, and with
  // the header, the pills and the strip itself that is 1101px — more than a 1080p window has, even
  // with every removable thing above the art already gone. Shrinking the page to fit would cost
  // the artwork, which is the one thing this whole exercise is protecting. So the strip docks to
  // the bottom of the viewport and the page scrolls under it.
  /** Always a row; with the rail on the bottom it has one child and behaves exactly as before. */
  pageRow: { width: '100%' },
  pageRowRailed: { flexDirection: 'row', alignItems: 'flex-start' },
  /**
   * The left rail. A fixed WIDTH, because the page's budget is computed from that same number; its
   * HEIGHT arrives inline from `railHeight`, because it belongs to the viewport and not to the
   * page. Neither a constant nor `alignSelf: 'stretch'` belongs in this style — see railHeight.
   */
  navRail: { width: NAV_RAIL_WIDTH },
  /** In a row the page has to be told to take the rest; on its own it already does. */
  pageWrapRailed: { flex: 1, minWidth: 0 },
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
