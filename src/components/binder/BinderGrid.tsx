import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { CardPlaceholder } from '@/components/CardPlaceholder';
import { BinderSurface, FontSize, Palette, Radii, Radius, Shadows, SlotBackingFallback, Weight } from '@/constants/theme';
import { UNSET_CHIP, chipFor } from '@/constants/printVariant';
import { attributionLabel, deriveAttribution, type ArtAttribution } from '@/data/artworkLibrary';
import { resolveCardWith, resolveCatalogCardWith } from '@/data/cardResolver';
import { CAPTION_FIELDS, formatCaption, hasTextCaption, type CaptionFieldKey } from '@/data/cardCaption';
import { occupiedCells, type DemoCard, type DemoPage, type DemoSlot } from '@/data/binderTypes';
import { artSlotBrief } from '@/data/artTemplates';
import { useCatalog } from '@/hooks/use-catalog';
import { useTheme } from '@/hooks/use-theme';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import type { Catalog, CatalogCard } from '@/lib/catalog';
import { usePriceSummaryWhen, type PriceSummary } from '@/lib/prices';

/**
 * What one pocket is worth. `cur` in the shared summary is the PRICIEST variant's market price, not
 * the one the owner actually holds — so a Normal card in a set with an expensive holo used to
 * quote the holo's price. When the pocket names an owned copy, quote that copy's finish instead.
 *
 * THE FALLBACK IS NOT OPTIONAL. Nearly half the catalogue has no 'Normal' price key at all (many
 * cards are holo-only), and every CSV-imported lot was stamped 'Normal' regardless — so a bare
 * `variants[owned]` would turn a real number into $0.00 across a large slice of real collections,
 * with no error anywhere. Falling back to `cur` keeps a wrong-but-present stored finish showing a
 * plausible price rather than nothing.
 */
/**
 * THE THREE LABELS PEOPLE ARE ACTUALLY LOOKING FOR — price, owned, finish — are drawn at twice the
 * size of the reference labels beside them, and they SCALE WITH THE POCKET.
 *
 * Owner decision 2026-09-01: the bottom-left reference labels (illustrator, set, code, number) are
 * right as they are and must not grow — they are there to be read when you go looking, and at any
 * larger size they start competing with the art. The other three are different in kind: what a
 * card is worth, whether you already have it, and which printing it is are the reasons someone is
 * looking at the grid at all, and at 9px they were the same whisper as the reference material.
 *
 * SCALED, NOT FIXED, because a pocket is not one size: the same grid draws a 3x4 page on a phone
 * and a two-page spread on a desktop, and a chip pinned to 18px would be a sticker on the small
 * one and a footnote on the large. `REFERENCE_POCKET_W` is a typical pocket (a 3-column page at
 * the width labels first appear), so the multiplier is exactly 2 there and moves with the card
 * either side of it. Clamped at both ends: never so small it defeats the point, never so large it
 * covers the art it sits on.
 */
const REFERENCE_POCKET_W = 120;
const EMPHASIS_MIN = 0.8;
const EMPHASIS_MAX = 1.6;
/** How much bigger than a reference label an emphasised one is, at the reference pocket width. */
const EMPHASIS_FACTOR = 2;
/** The price rides a quarter smaller than the other two: it is the longest string of the three. */
const PRICE_FACTOR = EMPHASIS_FACTOR * 0.75;

/**
 * EVERY CORNER CHIP IS INSET THE SAME, so the four of them describe one rectangle.
 *
 * They did not, and it showed: the owned mark and the label rows are drawn INSIDE the card frame,
 * which costs a 1px border and 2px of padding before their own 2px inset, while the finish chip is
 * positioned in the grid's coordinates and was inset only its own 2px. Three pixels of difference,
 * top-left against top-right, on the two chips a reader's eye pairs up.
 */
const CARD_FRAME_INSET = 3; // cardFrame: borderWidth 1 + padding 2
const CHIP_INSET = 2;
/** What a grid-space overlay must use to line up with anything drawn inside the frame. */
const FRAMED_INSET = CARD_FRAME_INSET + CHIP_INSET;

/** `#rrggbb` at an alpha. The theme ships opaque colours; a label over art needs to let it through. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * THE LABELS FOLLOW THE APPEARANCE. They were a fixed black scrim with white text, which is a
 * decision made once for one theme: in a light appearance a black chip is the darkest thing on the
 * page, and the labels stop belonging to the app around them.
 *
 * Derived from the live theme rather than the module-level Palette, because that one is resolved
 * at import and never changes again — switching appearance would have left these behind. The chip
 * is the theme's own background at 72%: opaque enough to carry text over any card art, sheer
 * enough that the art still reads through it.
 */
function labelColors(theme: { text: string; background: string }) {
  return { bg: withAlpha(theme.background, 0.72), text: theme.text };
}

function emphasisScale(cellW: number): number {
  if (!(cellW > 0)) return 1;
  return Math.min(EMPHASIS_MAX, Math.max(EMPHASIS_MIN, cellW / REFERENCE_POCKET_W));
}

/** Font size + line box for an emphasised label at this pocket size. */
function emphasisType(scale: number, factor: number = EMPHASIS_FACTOR): { fontSize: number; lineHeight: number } {
  const fontSize = Math.round(FontSize.micro * factor * scale);
  return { fontSize, lineHeight: Math.round(fontSize * 1.22) };
}

/**
 * The box an emphasised chip occupies. The owned mark takes its HEIGHT from here rather than
 * carrying its own size, so the two chips at the top of a pocket are the same height as each other
 * — they read as a pair, and a circle taller than the chip opposite it looks like a mistake.
 */
function chipBox(scale: number, factor: number = EMPHASIS_FACTOR) {
  const type = emphasisType(scale, factor);
  const padV = Math.round(1.5 * scale);
  const padH = Math.round(4 * scale);
  // +2 for the hairline border the finish chip carries on both edges.
  return { ...type, padV, padH, height: type.lineHeight + padV * 2 + 2 };
}

function priceFor(
  summary: PriceSummary | null,
  cardId: string,
  variant: string | undefined,
): number | undefined {
  const entry = summary?.[cardId];
  if (!entry) return undefined;
  if (variant) {
    const priced = entry.variants?.[variant];
    if (typeof priced === 'number') return priced;
  }
  return entry.cur;
}

/** Settling into a pocket: firm enough to feel placed, not springy enough to look like jelly. */
const SETTLE = { damping: 26, stiffness: 260, mass: 0.9 } as const;
/** Picking a card up: quicker than the settle, because a lift should feel immediate. */
const LIFT = { damping: 18, stiffness: 340, mass: 0.7 } as const;

const CARD_ASPECT = 88 / 63; // height / width of a standard card

interface BinderGridProps {
  page: DemoPage;
  /** Outer page width in px (padding is added internally). */
  width: number;
  editable?: boolean;
  /** Metadata fields to show as a caption under each card. Empty/undefined ⇒ no captions. */
  captionFields?: CaptionFieldKey[];
  /**
   * Draw card images with no fade-in. For DECORATIVE copies — the page-turn overlay renders
   * pages that are already on screen, and a fade on each one reads as the page refreshing.
   */
  instantImages?: boolean;
  selectedSlotId?: string | null;
  /** Extra slots shown highlighted (Ctrl/Cmd multi-select) — a border only, no per-slot toolbar. */
  multiSelectedIds?: ReadonlySet<string> | null;
  onSlotPress?: (slot: DemoSlot) => void;
  onCellPress?: (row: number, col: number) => void;
  /**
   * THE POCKET BEING FILLED RIGHT NOW.
   *
   * Selection already had a look (a 2px outline on a filled pocket), but the pocket a PANEL is
   * pointed at had none — an empty target pocket was indistinguishable from the eight other empty
   * pockets around it. That was survivable while the picker was a sheet you had just opened from
   * the pocket itself. With a panel on each side, both feeding one pocket and both staying open
   * across placements, "which one am I filling?" is a question the page has to answer at a glance.
   */
  activeCell?: { row: number; col: number } | null;
  /** Drag-and-drop: a slot was dropped with its top-left over (toRow, toCol). */
  onDropSlot?: (slotId: string, toRow: number, toCol: number) => void;
  /** Drag-to-resize: the selected slot's footprint changed to rowSpan×colSpan (top-left fixed). */
  onResizeSlot?: (row: number, col: number, rowSpan: number, colSpan: number) => void;
  /** Selected-pocket actions, shown in a toolbar anchored to the slot (edit mode). */
  onReplaceSlot?: () => void;
  onDuplicateSlot?: () => void;
  onRemoveSlot?: () => void;
  onDeselectSlot?: () => void;
  /** "✨ Fill page" — auto-curate the page around the selected card (card slots only). */
  onAutoFillSlot?: () => void;
  /** Open "which of my copies is this?" for the selected card pocket. */
  onPickCopySlot?: () => void;
  /**
   * The PRINT FINISH to badge each pocket with (constants/printVariant.ts), or undefined for
   * pockets that depict no owned copy. OPT-IN AND DEFAULTED UNDEFINED, and that is the whole
   * safety mechanism: this component draws every pocket in the app — the owner's editor, the
   * public shared-link viewer, the filmstrip, every home/discover tile, the marketing animation —
   * so anything drawn unconditionally appears on all of them at once. Only a call site that passes
   * this gets chips.
   */
  variantOf?: (slot: DemoSlot) => string | undefined;
  /** Tapping a print-finish chip. Without it the chip renders but is inert (read-only surfaces). */
  onVariantPress?: (slot: DemoSlot) => void;
  /**
   * Could this pocket's card have been printed more than one way? Such a pocket with no finish yet
   * shows a hollow `?` — an unanswered question with somewhere to press. Only asked when the chip
   * is interactive: a `?` nobody can answer is noise on a stranger's binder.
   */
  finishAskable?: (slot: DemoSlot) => boolean;
  /** Cross-page drag: report the drop point (the dragged card's centre) in THIS grid's
   *  inner-content coords. The editor maps it to window coords via the source grid's
   *  localToWindow and hit-tests every page in one frame. Replaces onDropSlot's local target. */
  onCrossDrop?: (slotId: string, localX: number, localY: number) => void;
  /** Fired when a slot drag begins — lets the editor re-measure sibling grids for hit-testing. */
  onDragStart?: () => void;
  /** Footprints to highlight as legal drop targets while a slice is armed/dragged from the tray. */
  dropTargets?: readonly { row: number; col: number; rs: number; cs: number }[];
  /** Card ids the viewer owns (own ≥ 1) — card slots for these get a green ✓ corner badge.
   *  Undefined/omitted = the owned overlay is off. */
  ownedIds?: ReadonlySet<string>;
  /**
   * Real-scan lookup for the "Scans" pill: the owner's own photo of a card, by id (public
   * scan-images URL from their portfolio entries). Card pockets prefer it and error-fall back
   * into the normal catalog march; artwork heroes never use it (a phone crop as full-bleed art
   * would read as a glitch). Undefined/omitted = catalog images, the default.
   */
  scanUrlOf?: (slot: DemoSlot) => string | undefined;
}

export interface BinderGridHandle {
  /** Re-read this grid's window position — call at drag start, before any hitTest. */
  remeasure: () => void;
  /** Map window coords to a cell in this grid, or null if the point is outside it. */
  hitTest: (windowX: number, windowY: number) => { row: number; col: number } | null;
  /** Map a point in this grid's inner-content coords to window coords (same frame hitTest
   *  reads), or null if the grid hasn't been measured yet. Lets the editor turn a drop
   *  reported in the *source* grid's coords into a point it can hit-test every page with. */
  localToWindow: (localX: number, localY: number) => { x: number; y: number } | null;
}

type BoxStyle = {
  position: 'absolute';
  left: number;
  top: number;
  width: number;
  height: number;
};

export const BinderGrid = forwardRef<BinderGridHandle, BinderGridProps>(function BinderGrid(
  {
    page,
    width,
    editable = false,
    captionFields = [],
    instantImages = false,
    selectedSlotId,
    multiSelectedIds,
    onSlotPress,
    onCellPress,
    activeCell,
    onDropSlot,
    onResizeSlot,
    onReplaceSlot,
    onDuplicateSlot,
    onRemoveSlot,
    onDeselectSlot,
    onAutoFillSlot,
    onPickCopySlot,
    variantOf,
    onVariantPress,
    finishAskable,
    onCrossDrop,
    onDragStart,
    dropTargets,
    ownedIds,
    scanUrlOf,
  }: BinderGridProps,
  ref,
) {
  // Passive catalog subscription: card *images* come from the id directly (cardThumbUrl), so the
  // grid never forces the ~25 MB catalog load just to render — covers paint immediately. When the
  // catalog is already loaded (editor/picker), we use it only to enrich (the jumbo/V-UNION badge).
  // Captions, though, need real metadata (name/set/rarity/…), so turning them on forces the load.
  // Whether a caption STRIP is needed under each card. Not simply "any field is on": the finish is
  // drawn on the card itself, so turning only that on must not carve height out of every pocket.
  const theme = useTheme();
  const captionOn = hasTextCaption(captionFields);
  // The catalog load is likewise only forced by fields that actually read card metadata.
  const finishOn = captionFields.includes('finish');
  const { catalog } = useCatalog(captionOn);
  // The price caption reads from a separate per-card summary (~2.7MB) — load it only when the
  // Price label is actually turned on, so a plain binder view never pulls it.
  const priceOn = captionFields.includes('price');
  const priceSummary = usePriceSummaryWhen(priceOn);
  const small = width < 220;
  const pad = small ? 6 : 12;
  const gap = small ? 3 : 6;
  const radius = small ? Radii.pageSmall : Radii.page;
  const slotRadius = small ? Radii.slotSmall : Radii.slot;
  // Strip reserved under each card for its labels (0 when off). Fits ~two lines of small text;
  // the card keeps its aspect and the caption sits in this strip directly below it.
  const captionH = captionOn ? (small ? 30 : 34) : 0;

  const innerW = width - pad * 2;
  const cellW = (innerW - gap * (page.cols - 1)) / page.cols;
  const cellH = cellW * CARD_ASPECT;
  // How much the emphasised labels (price / owned / finish) grow at this pocket size.
  const chipScale = emphasisScale(cellW);
  const label = labelColors(theme);
  // Vertical step includes the caption strip so every row reserves room for its labels. A card
  // box keeps the card's own height (cellH); spanning cards absorb the intermediate strips + gaps
  // so a 2×2 still reads as one rectangle, with its single caption below the whole thing.
  const colStep = cellW + gap;
  const rowStep = cellH + gap + captionH;
  const innerH = (cellH + captionH) * page.rows + gap * (page.rows - 1);

  const box = (row: number, col: number, rowSpan: number, colSpan: number): BoxStyle => ({
    position: 'absolute',
    left: col * colStep,
    top: row * rowStep,
    width: colSpan * cellW + (colSpan - 1) * gap,
    height: rowSpan * cellH + (rowSpan - 1) * (gap + captionH),
  });

  // Window-position measurement so the editor can hit-test a cross-page drop against this grid.
  const rootRef = useRef<View>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      remeasure: () =>
        rootRef.current?.measureInWindow((x, y) => {
          originRef.current = { x, y };
        }),
      hitTest: (windowX, windowY) => {
        const origin = originRef.current;
        // Reject unmeasured grids and non-finite coords — otherwise a NaN slips past the
        // bounds check below (NaN comparisons are all false) and returns a bogus hit.
        if (!origin || !Number.isFinite(windowX) || !Number.isFinite(windowY)) return null;
        const localX = windowX - origin.x - pad;
        const localY = windowY - origin.y - pad;
        if (localX < 0 || localY < 0 || localX > innerW || localY > innerH) return null;
        const col = Math.max(0, Math.min(page.cols - 1, Math.floor(localX / colStep)));
        const row = Math.max(0, Math.min(page.rows - 1, Math.floor(localY / rowStep)));
        return { row, col };
      },
      localToWindow: (localX, localY) => {
        const origin = originRef.current;
        if (!origin) return null;
        return { x: origin.x + pad + localX, y: origin.y + pad + localY };
      },
    }),
    [pad, innerW, innerH, colStep, rowStep, page.cols, page.rows],
  );

  // Shared drag state: which slot is lifted, and its live translation. Only one drags at a time.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragged = dragId ? page.slots.find((s) => s.id === dragId) : undefined;

  // The slot currently showing a resize handle (edit mode, selected, and not being dragged).
  const resizeSlot =
    editable && selectedSlotId && !dragId
      ? page.slots.find((s) => s.id === selectedSlotId)
      : undefined;

  // THE LIFT. The ghost used to mount already at scale 1.06 — a card that was simply, instantly,
  // bigger. Grabbing a real card lifts it: it grows, tilts, and throws a longer shadow, and all
  // three have to arrive together for it to read as picked up rather than swapped in. `lift` runs
  // 0 → 1 on grab so scale and tilt share one spring.
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withSpring(dragId ? 1 : 0, LIFT);
  }, [dragId, lift]);
  // The landing box follows the SNAPPED cell, not the finger: it should sit squarely in the pocket
  // the card will occupy, which is the question the user is actually asking mid-drag.
  const landingStyle = useAnimatedStyle(() => {
    if (!dragged) return { opacity: 0 };
    const stepX = cellW + gap;
    const stepY = cellH + gap + captionH;
    const col = Math.round((dragged.col * stepX + dragX.value) / stepX);
    const row = Math.round((dragged.row * stepY + dragY.value) / stepY);
    const inside = col >= 0 && row >= 0 && col + dragged.colSpan <= page.cols && row + dragged.rowSpan <= page.rows;
    return {
      opacity: inside ? 1 : 0,
      transform: [{ translateX: col * stepX }, { translateY: row * stepY }],
    };
  });

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
      { scale: 1 + 0.06 * lift.value },
      { rotate: `${2.5 * lift.value}deg` },
    ],
  }));

  const occupied = occupiedCells(page);
  const emptyCells: { row: number; col: number }[] = [];
  for (let r = 0; r < page.rows; r += 1) {
    for (let c = 0; c < page.cols; c += 1) {
      if (!occupied.has(`${r},${c}`)) emptyCells.push({ row: r, col: c });
    }
  }

  return (
    <View
      ref={rootRef}
      // Marks the page rectangle for the editor's wheel-to-flip hit test (web): only a wheel
      // DIRECTLY over a page flips, not one over the surrounding mat/gaps. react-native-web renders
      // dataSet as data-* attrs; the RN View types omit it, hence the typed spread. No-op on native.
      {...({ dataSet: { binderPage: '1' } } as unknown as ViewProps)}
      style={[
        styles.page,
        { width, padding: pad, borderRadius: radius, backgroundColor: page.backgroundColor ?? BinderSurface.mat },
      ]}>
      <View style={{ width: innerW, height: innerH }}>
        {/* Pocket recesses for every cell — visible, deliberate negative space. */}
        {Array.from({ length: page.rows * page.cols }).map((_, i) => {
          const row = Math.floor(i / page.cols);
          const col = i % page.cols;
          return (
            <View
              key={`pocket-${row}-${col}`}
              style={[box(row, col, 1, 1), styles.pocket, { borderRadius: slotRadius }]}>
              <View style={[styles.pocketInnerShadow, { borderTopLeftRadius: slotRadius, borderTopRightRadius: slotRadius }]} />
            </View>
          );
        })}

        {/* WHERE THIS CARD WILL LAND. Slices have had a drop-target highlight since they existed;
            a dragged CARD had none, so the only way to learn where it would go was to let go and
            find out. Tracks the snapped cell live, under the drag ghost. */}
        {dragged ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.dropTarget,
              landingStyle,
              {
                position: 'absolute',
                width: dragged.colSpan * cellW + (dragged.colSpan - 1) * gap,
                height: dragged.rowSpan * cellH + (dragged.rowSpan - 1) * (gap + captionH),
                borderRadius: slotRadius,
              },
            ]}
          />
        ) : null}

        {/* Legal drop-target highlights while a tray slice is armed/dragged (above pockets). */}
        {dropTargets?.map((t) => (
          <View
            key={`drop-${t.row}-${t.col}-${t.rs}-${t.cs}`}
            pointerEvents="none"
            style={[box(t.row, t.col, t.rs, t.cs), styles.dropTarget, { borderRadius: slotRadius }]}
          />
        ))}

        {/* Empty-cell tap targets (edit mode only; neighbours in the spread omit onCellPress). */}
        {editable && onCellPress &&
          emptyCells.map(({ row, col }) => (
            // An empty pocket is the most-clicked thing on this screen and it answered nothing:
            // no cursor, no hover, no press state. A dashed rectangle that does not react reads as
            // a placeholder rather than a control, which is why the audit found people hunting for
            // the "add" button that was already under their pointer.
            <Pressable
              key={`add-${row}-${col}`}
              // Named, so "which pocket am I filling" is answerable by a test and not only by eye.
              testID={
                activeCell?.row === row && activeCell?.col === col ? 'binder-active-pocket' : undefined
              }
              style={({ pressed, hovered }) => [
                box(row, col, 1, 1),
                styles.addCell,
                { borderRadius: slotRadius },
                hovered && styles.addCellHovered,
                pressed && styles.addCellPressed,
                activeCell?.row === row && activeCell?.col === col && styles.addCellActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Add a card to row ${row + 1}, column ${col + 1}`}
              onPress={() => onCellPress?.(row, col)}>
              {({ pressed, hovered }) => (
                <>
                  {!small && (
                    <Text style={[styles.addPlus, (hovered || pressed) && styles.addPlusLit]}>+</Text>
                  )}
                </>
              )}
            </Pressable>
          ))}

        {/* Placed slots. */}
        {page.slots.map((slot) => {
          // A filled pocket is a target too — "Replace" points a panel at one — so the active mark
          // is not limited to empty cells. Either reason shows the same outline: what the page has
          // to say is "this is the one", not why.
          const isActive =
            !!activeCell && activeCell.row === slot.row && activeCell.col === slot.col;
          const selected =
            editable && (isActive || slot.id === selectedSlotId || !!multiSelectedIds?.has(slot.id));
          const style = box(slot.row, slot.col, slot.rowSpan, slot.colSpan);
          const content = (
            <SlotContent
              pageTitle={page.title}
              slot={slot}
              radius={slotRadius}
              small={small}
              catalog={catalog}
              owned={!!(slot.cardId && ownedIds?.has(slot.cardId))}
              scanUri={slot.cardId ? scanUrlOf?.(slot) : undefined}
              captionFields={captionFields}
              instantImages={instantImages}
              label={label}
              price={slot.cardId ? priceFor(priceSummary, slot.cardId, variantOf?.(slot)) : undefined}
            chipScale={chipScale}
            />
          );
          if (!editable) {
            return (
              <View key={slot.id} style={style}>
                {content}
              </View>
            );
          }
          return (
            <DraggableSlot
              key={slot.id}
              slot={slot}
              boxStyle={style}
              selected={selected}
              slotRadius={slotRadius}
              dimmed={slot.id === dragId}
              cellW={cellW}
              cellH={cellH}
              gap={gap}
              captionH={captionH}
              dragX={dragX}
              dragY={dragY}
              onSetDragId={setDragId}
              onTap={onSlotPress}
              onDropSlot={onDropSlot}
              onCrossDrop={onCrossDrop}
              onDragStart={onDragStart}>
              {content}
            </DraggableSlot>
          );
        })}

        {/* PRINT-FINISH CHIPS (N / H / RH …), a sibling layer rather than a child of the slot.
            It has to be: in edit mode the slot content is wrapped by DraggableSlot's
            Gesture.Exclusive(pan, tap), and every existing in-slot overlay — the owned tick, the
            JUMBO badge, the foil sheen, the caption — is pointerEvents="none". SlotToolbar is the
            precedent for something tappable, and it lives outside the draggable too.

            Top-right is the only free corner: top-left is the owned ✓, bottom-left the kind badge,
            below is the caption strip, and bottom-right is the resize knob. zIndex 20 puts it over
            the card but under the drag ghost (50) and the resize overlay (40). */}
        {variantOf &&
          finishOn &&
          !small &&
          page.slots.map((slot) => {
            if (!slot.cardId) return null;
            const variant = variantOf(slot);
            // An unanswered pocket still gets a target, but only where it can be answered.
            const asking = !variant && !!onVariantPress && !!finishAskable?.(slot);
            if (!variant && !asking) return null;
            const chip = variant ? chipFor(variant) : UNSET_CHIP;
            const b = box(slot.row, slot.col, slot.rowSpan, slot.colSpan);
            return (
              // A right-ALIGNED strip rather than a left-positioned chip: the label is one to
              // three characters wide, so anchoring the left edge would push '1EH' off the pocket.
              // box-none lets taps through everywhere except the chip itself, which matters
              // because this strip spans the pocket's full width.
              <View
                key={`pv-${slot.id}`}
                pointerEvents="box-none"
                style={[
                  styles.variantRow,
                  // FRAMED_INSET, not 2: this strip is in grid coordinates, so it has to pay the
                  // card frame's border and padding itself to line up with the owned mark opposite.
                  {
                    left: b.left + FRAMED_INSET,
                    top: b.top + FRAMED_INSET,
                    width: b.width - FRAMED_INSET * 2,
                  },
                ]}>
                <Pressable
                  onPress={onVariantPress ? () => onVariantPress(slot) : undefined}
                  disabled={!onVariantPress}
                  accessibilityRole="button"
                  accessibilityLabel={`${chip.label}${onVariantPress ? ', tap to change the print finish' : ''}`}
                  // Outward slop is free; inward it is not — the gap between pockets is only a few
                  // pixels and this layer paints above them, so a symmetric slop would swallow taps
                  // meant for the neighbouring card.
                  hitSlop={{ top: 10, right: 10, bottom: 6, left: 6 }}
                  style={[
                    styles.variantChip,
                    {
                      backgroundColor: chip.fill,
                      // Padding rides the same scale, or a big letter sits in a small pill.
                      paddingHorizontal: chipBox(chipScale).padH,
                      paddingVertical: chipBox(chipScale).padV,
                    },
                    // Hollow, so a prompt never passes for an answer at a glance.
                    asking && styles.variantChipAsking,
                  ]}>
                  <Text style={[styles.variantChipText, emphasisType(chipScale), { color: chip.text }]}>
                    {chip.letter}
                  </Text>
                </Pressable>
              </View>
            );
          })}

        {/* Metadata captions under each card, an independent layer so it doesn't disturb the
            draggable slot wrappers. Only cards (slots with a cardId) get a caption. */}
        {captionOn &&
          page.slots.map((slot) => {
            if (!slot.cardId) return null;
            const b = box(slot.row, slot.col, slot.rowSpan, slot.colSpan);
            return (
              <SlotCaption
                key={`cap-${slot.id}`}
                cardId={slot.cardId}
                catalog={catalog}
                fields={captionFields}
                price={priceFor(priceSummary, slot.cardId, variantOf?.(slot))}
                left={b.left}
                top={b.top + b.height}
                width={b.width}
                height={captionH}
                small={small}
              />
            );
          })}

        {/* Source attribution under custom artwork, every piece carries its credit, so a
            sliced scene labels each pocket. Derived from the stored source URL; slices are
            never re-hosted. */}
        {captionOn &&
          page.slots.map((slot) => {
            if (slot.type !== 'artwork' || !slot.imageUrl || slot.cardId) return null;
            const b = box(slot.row, slot.col, slot.rowSpan, slot.colSpan);
            return (
              <ArtCaption
                key={`art-cap-${slot.id}`}
                url={slot.imageUrl}
                attribution={slot.attribution}
                left={b.left}
                top={b.top + b.height}
                width={b.width}
                height={captionH}
                small={small}
              />
            );
          })}

        {/* Floating ghost of the slot being dragged (rendered above everything). */}
        {dragged ? (
          <Animated.View
            pointerEvents="none"
            style={[
              box(dragged.row, dragged.col, dragged.rowSpan, dragged.colSpan),
              styles.ghost,
              ghostStyle,
            ]}>
            <SlotContent
              pageTitle={page.title}
              slot={dragged}
              radius={slotRadius}
              small={small}
              catalog={catalog}
              owned={!!(dragged.cardId && ownedIds?.has(dragged.cardId))}
              scanUri={dragged.cardId ? scanUrlOf?.(dragged) : undefined}
              captionFields={captionFields}
              instantImages={instantImages}
              label={label}
              price={dragged.cardId ? priceFor(priceSummary, dragged.cardId, variantOf?.(dragged)) : undefined}
            chipScale={chipScale}
            />
          </Animated.View>
        ) : null}

        {/* Drag-to-resize handle on the selected slot (edit mode). */}
        {onResizeSlot && resizeSlot ? (
          <ResizeOverlay
            key={`resize-${resizeSlot.id}`}
            slot={resizeSlot}
            cellW={cellW}
            cellH={cellH}
            gap={gap}
            captionH={captionH}
            rows={page.rows}
            cols={page.cols}
            radius={slotRadius}
            onResizeSlot={onResizeSlot}
          />
        ) : null}

        {/* Quick-action toolbar anchored to the selected pocket (edit mode). */}
        {onReplaceSlot && resizeSlot ? (
          <SlotToolbar
            key={`toolbar-${resizeSlot.id}`}
            slot={resizeSlot}
            cellW={cellW}
            cellH={cellH}
            gap={gap}
            captionH={captionH}
            innerW={innerW}
            onReplace={onReplaceSlot}
            onDuplicate={onDuplicateSlot}
            onRemove={onRemoveSlot}
            onDeselect={onDeselectSlot}
            onAutoFill={resizeSlot.cardId ? onAutoFillSlot : undefined}
            onPickCopy={resizeSlot.cardId ? onPickCopySlot : undefined}
            hasCopy={!!resizeSlot.sourceEntryId}
          />
        ) : null}
      </View>
    </View>
  );
});

/**
 * A compact action toolbar that floats over the selected pocket — Replace,
 * Duplicate, Remove and a deselect ✕ — so the actions live *at* the object
 * instead of below the whole grid. Sits above the slot (or just inside its top
 * when there's no room above), centred and clamped to the grid width.
 */
function SlotToolbar({
  slot,
  cellW,
  cellH,
  gap,
  captionH,
  innerW,
  onReplace,
  onDuplicate,
  onRemove,
  onDeselect,
  onAutoFill,
  onPickCopy,
  hasCopy,
}: {
  slot: DemoSlot;
  cellW: number;
  cellH: number;
  gap: number;
  captionH: number;
  innerW: number;
  onReplace?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  onDeselect?: () => void;
  onAutoFill?: () => void;
  onPickCopy?: () => void;
  /** Whether this pocket already names one of the owner's copies (ticked in the label). */
  hasCopy?: boolean;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stepX = cellW + gap;
  const stepY = cellH + gap + captionH;
  const slotLeft = slot.col * stepX;
  const slotTop = slot.row * stepY;
  const slotW = slot.colSpan * cellW + (slot.colSpan - 1) * gap;
  const centerX = slotLeft + slotW / 2;

  const left = Math.max(0, Math.min(centerX - size.w / 2, innerW - size.w));
  const aboveTop = slotTop - size.h - 8;
  const top = aboveTop < 0 ? slotTop + 8 : aboveTop;

  return (
    <View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
      }}
      style={[styles.slotToolbar, { left, top, opacity: size.w ? 1 : 0 }]}>
      <ToolButton label="Replace" onPress={onReplace} />
      <ToolButton label="Duplicate" onPress={onDuplicate} />
      {/* "✨ Fill page" is what this feature is called EVERYWHERE else — the sheet's title, the
          guide that tells you to look for it here, the tier limits, the sign-in perk. The button
          said "Fill", so the one place you act on it was the one place it went by another name. */}
      {onAutoFill ? <ToolButton label="✨ Fill page" onPress={onAutoFill} /> : null}
      {/* Whose card is in this pocket - a tick when it is one of the owner's, so the answer is
          visible without opening anything. The ✓ is state, not decoration, which is the line this
          row draws: a glyph earns its place by saying something the word does not. */}
      {onPickCopy ? (
        <ToolButton label={hasCopy ? 'My card ✓' : 'My card'} onPress={onPickCopy} />
      ) : null}
      {/* Everything left of this line changes the pocket; everything right of it ends something.
          Remove sat flush against Duplicate in a row of six with 2px between them — one slip on a
          crowded toolbar and the card is gone rather than copied. */}
      <View style={styles.toolDivider} />
      <ToolButton label="Remove" tone="danger" onPress={onRemove} />
      <ToolButton label="✕" onPress={onDeselect} accessibilityLabel="Clear selection" />
    </View>
  );
}

function ToolButton({
  label,
  onPress,
  tone = 'default',
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'default' | 'danger';
  /** For the one button whose label is a glyph — "✕" announces as nothing useful. */
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.toolBtn, pressed && styles.dimmed]}>
      <Text style={[styles.toolBtnText, tone === 'danger' && styles.toolBtnTextDanger]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A live, snapped resize handle for the selected slot. The slot's top-left stays fixed; dragging
 * the bottom-right knob previews the new footprint (snapped to whole cells) and commits on release.
 */
function ResizeOverlay({
  slot,
  cellW,
  cellH,
  gap,
  captionH,
  rows,
  cols,
  radius,
  onResizeSlot,
}: {
  slot: DemoSlot;
  cellW: number;
  cellH: number;
  gap: number;
  captionH: number;
  rows: number;
  cols: number;
  radius: number;
  onResizeSlot: (row: number, col: number, rowSpan: number, colSpan: number) => void;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const stepX = cellW + gap;
  const stepY = cellH + gap + captionH;
  const maxCols = cols - slot.col;
  const maxRows = rows - slot.row;

  const spanFor = (translation: number, step: number, span: number, max: number) => {
    'worklet';
    const next = span + Math.round(translation / step);
    return next < 1 ? 1 : next > max ? max : next;
  };

  const sizeStyle = useAnimatedStyle(() => {
    const cs = spanFor(tx.value, stepX, slot.colSpan, maxCols);
    const rs = spanFor(ty.value, stepY, slot.rowSpan, maxRows);
    return {
      width: cs * cellW + (cs - 1) * gap,
      height: rs * cellH + (rs - 1) * (gap + captionH),
    };
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          tx.value = 0;
          ty.value = 0;
        })
        .onUpdate((e) => {
          tx.value = e.translationX;
          ty.value = e.translationY;
        })
        .onEnd(() => {
          const cs = spanFor(tx.value, stepX, slot.colSpan, maxCols);
          const rs = spanFor(ty.value, stepY, slot.rowSpan, maxRows);
          runOnJS(onResizeSlot)(slot.row, slot.col, rs, cs);
        })
        .onFinalize(() => {
          tx.value = 0;
          ty.value = 0;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slot.row, slot.col, slot.rowSpan, slot.colSpan, stepX, stepY, maxCols, maxRows],
  );

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.resizeOverlay,
        { left: slot.col * stepX, top: slot.row * stepY, borderRadius: radius },
        sizeStyle,
      ]}>
      <GestureDetector gesture={pan}>
        {/* The visible knob is 22px, which is under every touch-target guideline there is and sits
            in the corner where a thumb is least accurate. The TARGET is 44px of transparent View
            around it — the knob stays the size it should look, and the thing you have to hit is
            the size it should be. */}
        <View style={styles.resizeHit}>
          <View style={styles.resizeHandle} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

interface DraggableSlotProps {
  slot: DemoSlot;
  boxStyle: BoxStyle;
  selected: boolean;
  slotRadius: number;
  dimmed: boolean;
  cellW: number;
  cellH: number;
  gap: number;
  captionH: number;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onSetDragId: (id: string | null) => void;
  onTap?: (slot: DemoSlot) => void;
  onDropSlot?: (slotId: string, toRow: number, toCol: number) => void;
  onCrossDrop?: (slotId: string, absoluteX: number, absoluteY: number) => void;
  onDragStart?: () => void;
  children: React.ReactNode;
}

function DraggableSlot({
  slot,
  boxStyle,
  selected,
  slotRadius,
  dimmed,
  cellW,
  cellH,
  gap,
  captionH,
  dragX,
  dragY,
  onSetDragId,
  onTap,
  onDropSlot,
  onCrossDrop,
  onDragStart,
  children,
}: DraggableSlotProps) {
  const gesture = useMemo(() => {
    const stepX = cellW + gap;
    const stepY = cellH + gap + captionH;
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .activeOffsetY([-8, 8])
      .onBegin(() => {
        dragX.value = 0;
        dragY.value = 0;
      })
      .onStart(() => {
        runOnJS(onSetDragId)(slot.id);
        if (onDragStart) runOnJS(onDragStart)();
      })
      .onUpdate((e) => {
        dragX.value = e.translationX;
        dragY.value = e.translationY;
      })
      .onEnd((e) => {
        // In the spread, report the dragged card's CENTRE in this grid's inner-content coords
        // (start position + translation) — the editor resolves the page + cell from there, all
        // in one measured frame. Otherwise the drop stays within this grid (translation target).
        if (onCrossDrop) {
          const centerX =
            slot.col * stepX + (slot.colSpan * cellW + (slot.colSpan - 1) * gap) / 2 + e.translationX;
          const centerY =
            slot.row * stepY +
            (slot.rowSpan * cellH + (slot.rowSpan - 1) * (gap + captionH)) / 2 +
            e.translationY;
          runOnJS(onCrossDrop)(slot.id, centerX, centerY);
        } else if (onDropSlot) {
          const targetCol = Math.round((slot.col * stepX + e.translationX) / stepX);
          const targetRow = Math.round((slot.row * stepY + e.translationY) / stepY);
          runOnJS(onDropSlot)(slot.id, targetRow, targetCol);
        }
      })
      .onFinalize(() => {
        runOnJS(onSetDragId)(null);
      });
    const tap = Gesture.Tap().onEnd(() => {
      if (onTap) runOnJS(onTap)(slot);
    });
    return Gesture.Exclusive(pan, tap);
  }, [slot, cellW, cellH, gap, captionH, dragX, dragY, onSetDragId, onTap, onDropSlot, onCrossDrop, onDragStart]);

  // THE CARD SETTLES, it does not teleport. A move, a swap and a resize all used to be a frame
  // swap: the card was in one pocket, then it was in another, with nothing in between. Springing
  // the box to its new coordinates makes the one gesture this app exists for — putting a card into
  // a sleeve — read as an object arriving somewhere rather than a value changing.
  //
  // Done here, on the destination, rather than in the drag: the gesture's own state machine is the
  // riskiest code on this surface, and it does not need to know that the landing is animated.
  const left = useSharedValue(boxStyle.left);
  const top = useSharedValue(boxStyle.top);
  useEffect(() => {
    left.value = withSpring(boxStyle.left, SETTLE);
    top.value = withSpring(boxStyle.top, SETTLE);
  }, [boxStyle.left, boxStyle.top, left, top]);
  const settleStyle = useAnimatedStyle(() => ({ left: left.value, top: top.value }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          boxStyle,
          settleStyle,
          dimmed && styles.dimmed,
          selected && { ...styles.selected, borderRadius: slotRadius + 2 },
        ]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * A custom artwork panel image, with a visible fallback if the URL fails to load. When `crop`
 * is given (a sliced artwork), the image is sized to the whole grid and offset so this slot
 * shows just its sub-rectangle — so one image reads as a sliced scene across the pockets.
 */
function ArtworkImage({
  uri,
  radius,
  small,
  instant,
  crop,
  fit = 'cover',
  transform,
}: {
  uri: string;
  radius: number;
  small: boolean;
  /** Drawn for an animation rather than arriving: see flashMode.ts. */
  instant?: boolean;
  crop?: DemoSlot['imageCrop'];
  fit?: DemoSlot['imageFit'];
  transform?: DemoSlot['imageTransform'];
}) {
  const [failed, setFailed] = useState(false);
  // A rotated/flipped slice needs pixel math (a quarter turn swaps the element's width and
  // height — percentages can't express that), so measure the slot box once. Untransformed
  // slots keep the original percentage path untouched.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const rot = transform?.rot ?? 0;
  const flipped = Boolean(transform && (rot !== 0 || transform.flipH || transform.flipV));
  if (failed) {
    return (
      <View style={[styles.fill, styles.artworkPanel, styles.artworkFallback, { borderRadius: radius }]}>
        {!small ? <Text style={styles.artworkFallbackText}>image didn’t load</Text> : null}
      </View>
    );
  }
  // 'contain' shows the whole image at its original aspect (letterboxed) — no crop windowing.
  const contain = fit === 'contain';
  // A crop is only usable if every field is finite; a degenerate crop (w/h ≈ 0 from a bad
  // slice) would make `100 / w` size the image to hundreds of thousands of px and freeze the
  // page, so clamp the divisor to a sane minimum (max ~20× the pocket).
  const validCrop =
    !contain &&
    crop &&
    Number.isFinite(crop.w) &&
    Number.isFinite(crop.h) &&
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y);
  const cw = validCrop ? Math.max(0.05, crop!.w) : 1;
  const ch = validCrop ? Math.max(0.05, crop!.h) : 1;
  let imgStyle: object;
  let contentFit: 'cover' | 'contain' | 'fill' = contain ? 'contain' : 'cover';
  if (flipped && validCrop && box) {
    // Pixel path: the full (transformed) image spans boxW/cw × boxH/ch, offset so this slot
    // shows its window; the quarter-turn element is laid out pre-rotation and centre-rotated
    // into place. Transformed slices come from the Slice Studio with aspect-true windows, so
    // 'fill' is exact (mirrors SliceStudio's SourceImage).
    const W = box.w / cw;
    const H = box.h / ch;
    const left = -(crop!.x / cw) * box.w;
    const top = -(crop!.y / ch) * box.h;
    const quarter = rot === 90 || rot === 270;
    imgStyle = {
      position: 'absolute' as const,
      width: quarter ? H : W,
      height: quarter ? W : H,
      left: quarter ? left + (W - H) / 2 : left,
      top: quarter ? top + (H - W) / 2 : top,
      transform: [
        { rotate: `${rot}deg` },
        { scaleX: transform?.flipH ? -1 : 1 },
        { scaleY: transform?.flipV ? -1 : 1 },
      ],
    };
    contentFit = 'fill';
  } else {
    imgStyle = validCrop
      ? {
          position: 'absolute' as const,
          width: `${100 / cw}%` as DimensionValue,
          height: `${100 / ch}%` as DimensionValue,
          left: `${(-crop!.x / cw) * 100}%` as DimensionValue,
          top: `${(-crop!.y / ch) * 100}%` as DimensionValue,
        }
      : styles.fill;
  }
  return (
    <View
      style={[styles.fill, styles.artworkPanel, { borderRadius: radius }]}
      onLayout={
        flipped
          ? (e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          : undefined
      }>
      {flipped && !box ? null : (
        <Image
          source={{ uri }}
          style={imgStyle}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={uri}
          // Owner artwork carries no skeleton, so the fade-in is all it has. A copy drawn for an
          // animation skips it, exactly as the cards already did: this component simply never
          // received the flag.
          transition={instant ? 0 : 120}
          // Web: kill the browser's native image-drag ghost so a card can't be "dragged" outside
          // edit mode. Edit-mode reordering uses a gesture-handler pan, not native <img> drag, so
          // it's unaffected. No-op on native.
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

/**
 * A reserved art panel — a pocket a composition set aside (see artTemplates), waiting for the
 * owner's own art. Tapping it in the editor, or dragging a slice from the tray onto it, fills it.
 * Purely empty (no image / card), so it never trips the private-art gate.
 *
 * IT SAYS WHAT IT IS FOR. "Your Art Here" asks the owner to invent the picture and the brief at
 * once; a panel that says "Chase Board · Footer caption band" has already answered the second
 * half. The page supplies the theme, the slot's own role supplies the job. A hand-placed panel
 * has no role and falls back to the plain invitation, which is right — nobody needs telling what
 * they just put there.
 *
 * At a small pocket the role alone is shown: the theme is legible on the page itself, and two
 * lines of five-point text is not a label, it is a smudge.
 */
function ArtGapPlaceholder({
  radius,
  small,
  role,
  pageTitle,
}: {
  radius: number;
  small: boolean;
  role?: string;
  pageTitle?: string;
}) {
  const brief = small ? artSlotBrief(undefined, role) : artSlotBrief(pageTitle, role);
  return (
    <View style={[styles.fill, styles.artGap, { borderRadius: radius }]}>
      <Text style={[styles.artGapText, small && styles.artGapTextSmall]} numberOfLines={3}>
        {brief}
      </Text>
    </View>
  );
}

/** A small corner badge marking a card's real-world size class (jumbo / V-UNION). */
/** '' for an ordinary card — the two shapes worth calling out are the ones that do not fit a
 *  normal pocket. */
function kindLabel(kind?: DemoCard['kind']): string {
  if (kind === 'jumbo') return 'JUMBO';
  if (kind === 'vunion') return 'V-UNION';
  return '';
}

/**
 * The shape marker on its own, bottom-left, for when no card labels are switched on. With labels
 * on it is drawn INSIDE the code row instead (see CardLabels) — otherwise it and the codes would
 * both claim the bottom-left and overlap on any card that has one.
 */
function KindBadge({ kind, small, hidden }: { kind?: DemoCard['kind']; small: boolean; hidden?: boolean }) {
  if (small || hidden || !kindLabel(kind)) return null;
  return (
    <View pointerEvents="none" style={styles.badge}>
      <Text style={styles.badgeText}>{kindLabel(kind)}</Text>
    </View>
  );
}

function SlotContent({
  slot,
  radius,
  small,
  catalog,
  pageTitle,
  owned = false,
  scanUri,
  captionFields = [],
  price,
  chipScale = 1,
  instantImages = false,
  label,
}: {
  /** Chip fill + text from the live appearance (see labelColors). */
  label: { bg: string; text: string };
  /** Draw images with no fade-in (a decorative copy — see BinderGrid.instantImages). */
  instantImages?: boolean;
  slot: DemoSlot;
  radius: number;
  small: boolean;
  catalog: Catalog | null;
  /** Emphasis scale for price / owned / finish at this pocket size (see emphasisScale). */
  chipScale?: number;
  /** Which labels are switched on. The on-card ones are drawn here; the rest go in the strip. */
  captionFields?: CaptionFieldKey[];
  /** This pocket's value, already resolved to the owned copy's finish (see priceFor). */
  price?: number;
  /** The viewer owns this card (own ≥ 1) — show the green ✓ corner badge. */
  owned?: boolean;
  /** This card's real scan (see BinderGridProps.scanUrlOf); card pockets only. */
  scanUri?: string;
  /** The page's own name, so a reserved art panel can say which page's brief it is holding. */
  pageTitle?: string;
}) {
  if (slot.type === 'insert') {
    // Tonal negative-space filler: solid colour with a soft top inner highlight
    // so it reads as an intentional, slightly raised tile.
    return (
      <View
        style={[
          styles.fill,
          styles.insert,
          { borderRadius: radius, backgroundColor: slot.insertColor ?? Palette.hairlineStrong },
        ]}>
        <View
          style={[
            styles.insertHighlight,
            { borderTopLeftRadius: radius, borderTopRightRadius: radius },
          ]}
        />
      </View>
    );
  }

  // A custom artwork panel — a pasted / uploaded image, sized to fill the slot (or a slice
  // of a larger image when imageCrop is set).
  if (slot.type === 'artwork' && slot.imageUrl) {
    return (
      <ArtworkImage
        uri={slot.imageUrl}
        radius={radius}
        small={small}
        instant={instantImages}
        crop={slot.imageCrop}
        fit={slot.imageFit}
        transform={slot.imageTransform}
      />
    );
  }

  // An empty artwork slot is a RESERVED ART GAP (the Build-a-binder wizard leaves these): a
  // dashed placeholder inviting the owner to drop in their own art. No image, no card.
  if (slot.type === 'artwork' && !slot.cardId) {
    return (
      <ArtGapPlaceholder radius={radius} small={small} role={slot.artRole} pageTitle={pageTitle} />
    );
  }

  const id = slot.cardId;
  if (!id) {
    return (
      <CardPlaceholder radius={radius} />
    );
  }

  // The image comes from the id directly (no catalog needed). The catalog, when already loaded,
  // only enriches the size badge — so covers paint immediately even before it's available.
  const kind = resolveCardWith(catalog, id)?.kind;
  // Whether the on-card code row will be drawn, and so whether it — rather than the standalone
  // badge bottom-left — is the thing that shows JUMBO / V-UNION.
  const codeRowOn = captionFields.includes('set') || captionFields.includes('number');

  if (slot.type === 'artwork') {
    // Full-bleed hero art. A spanning slot (>1 cell) covers its box edge-to-edge so a
    // 2×2 reads as one big picture; a single 1×1 stays framed/contained. No card frame.
    const spanning = slot.rowSpan > 1 || slot.colSpan > 1;
    return (
      <View style={[styles.fill, { borderRadius: radius, backgroundColor: SlotBackingFallback }]}>
        <CardImage key={id} id={id} radius={radius} small={small} contentFit={spanning ? 'cover' : 'contain'} instant={instantImages} />
        <KindBadge kind={kind} small={small} />
        <OwnedBadge owned={owned} small={small} scale={chipScale} />
      </View>
    );
  }

  // 'card' — framed like a card in a pocket, with a subtle diagonal foil sheen layered on top.
  return (
    <View style={[styles.fill, styles.cardFrame, { borderRadius: radius }]}>
      <View style={[styles.fill, { backgroundColor: SlotBackingFallback }]}>
        <CardImage key={id} id={id} radius={radius} small={small} contentFit="contain" scanUri={scanUri} instant={instantImages} />
        {/* Diagonal foil sheen: two translucent rotated bars layered as plain Views. */}
        <View pointerEvents="none" style={styles.foil}>
          <View style={[styles.foilBar, styles.foilBarA]} />
          <View style={[styles.foilBar, styles.foilBarB]} />
        </View>
        <KindBadge kind={kind} small={small} hidden={codeRowOn} />
        <OwnedBadge owned={owned} small={small} scale={chipScale} />
        <CardLabels
          card={resolveCatalogCardWith(catalog, id)}
          kind={kind}
          fields={captionFields}
          price={price}
          small={small}
          scale={chipScale}
          label={label}
        />
      </View>
    </View>
  );
}

/**
 * THE LABELS DRAWN ON THE CARD ITSELF — the printing's codes along the bottom edge, the artist on
 * the row above, the price in the corner. Placement, chip-or-text and colour all come from the one
 * table in cardCaption.ts; this only lays out what that table asks for.
 *
 * pointerEvents="none" throughout, like every other in-slot overlay: in edit mode this sits inside
 * DraggableSlot's pan gesture, and a label that swallowed a drag would make the card unmovable.
 * (The finish chip is the exception and lives outside the slot for exactly that reason.)
 *
 * Everything is on a translucent dark scrim rather than a flat colour, because a card's art can be
 * any colour at all — a fill chosen to look good over a white Pikachu is unreadable over a black
 * Umbreon. The scrim is the only treatment that holds over all of them.
 */
function CardLabels({
  card,
  kind,
  fields,
  price,
  small,
  scale = 1,
  label,
}: {
  card: CatalogCard | undefined;
  /** Drawn as the row's leading chip so it is not a second thing claiming the bottom-left. */
  kind?: DemoCard['kind'];
  fields: CaptionFieldKey[];
  price?: number;
  small: boolean;
  /** Emphasis scale for the price chip (see emphasisScale). 1 at a reference-width pocket. */
  scale?: number;
  /** Chip fill + text, derived from the live appearance (see labelColors). */
  label: { bg: string; text: string };
}) {
  // Nothing legible fits on a filmstrip or a discover tile, and a label nobody can read is just
  // dirt on the art.
  if (small || !card || fields.length === 0) return null;
  const on = new Set(fields);
  const valueOf = (key: CaptionFieldKey): string => {
    const field = CAPTION_FIELDS.find((f) => f.key === key);
    if (!field || !on.has(key)) return '';
    return field.get(card, { price }).trim();
  };
  const spotFields = (spot: string) =>
    CAPTION_FIELDS.filter((f) => f.spot === spot && on.has(f.key));

  const bottom = spotFields('bottomRow')
    .map((f) => ({ key: f.key, value: valueOf(f.key) }))
    .filter((x) => x.value.length > 0);
  const artist = valueOf('artist');
  const setName = valueOf('set');
  const corner = spotFields('bottomRight')
    .map((f) => ({ value: valueOf(f.key), tone: f.tone }))
    .filter((x) => x.value.length > 0);

  if (bottom.length === 0 && !artist && !setName && corner.length === 0) return null;

  /**
   * The rows STACK FROM THE BOTTOM EDGE UPWARDS, and only the ones with something in them take a
   * place. Fixed offsets per row would leave a label hovering over the gap where a row nobody
   * switched on would have been — turning a label off would move a different label. Bottom-up
   * because the bottom edge is the anchor: the codes stay put however many rows sit above them.
   */
  // A reference chip is one 9px line plus a pixel of padding each side, so a 15px step leaves the
  // two pixels of air that separate the rows without wasting any on top of that.
  const ROW_STEP = 15;
  const AIR = 2;
  const REF_ROW_H = 13;
  const priceBox = chipBox(scale, PRICE_FACTOR);
  const stack: string[] = [];
  // The price is no longer on this row, so it no longer claims a place in the stack either.
  if (bottom.length > 0) stack.push('codes');
  if (setName) stack.push('set');
  if (artist) stack.push('artist');
  // THE PRICE NO LONGER LIVES ON THIS ROW, so the rows are a uniform step again. It used to share
  // the codes row, which made that row as tall as the price and pushed the set and illustrator up
  // the card — a bigger number quietly re-laid-out three labels that had nothing to do with it.
  // It is now its own column in the corner (see below), and the reference rows stack as they did
  // before any of this. Overlap between the two is accepted: the price wins the corner.
  const bottomOf = (row: string) => {
    const i = stack.indexOf(row);
    return i <= 0 ? CHIP_INSET : CHIP_INSET + REF_ROW_H + AIR + (i - 1) * ROW_STEP;
  };
  // The label stack's total height: each row plus the air between them. The price matches it.
  const stackHeight = Math.max(
    priceBox.height,
    stack.length * REF_ROW_H + Math.max(0, stack.length - 1) * AIR,
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {artist ? (
        <View style={[styles.overlayRow, { bottom: bottomOf('artist') }]}>
          {/* On its own pill rather than bare text with a shadow: a scrim is the only thing that
              stays readable over art that might be white, black or gold. */}
          <View style={[styles.onCardChip, styles.wordyChip, { backgroundColor: label.bg }]}>
            <Text numberOfLines={1} style={[styles.badgeText, { color: label.text }]}>
              {artist}
            </Text>
          </View>
        </View>
      ) : null}
      {/* THE SET GETS A WHOLE LINE. Its name is the only label with no bound on its length, and
          every attempt to squeeze it in beside something else either clipped it to an empty pill
          or crowded the illustrator. A set is called Vivid Voltage, so it says Vivid Voltage. */}
      {setName ? (
        <View style={[styles.overlayRow, { bottom: bottomOf('set') }]}>
          <View style={[styles.onCardChip, styles.wordyChip, { backgroundColor: label.bg }]}>
            <Text numberOfLines={1} style={[styles.badgeText, { color: label.text }]}>
              {setName}
            </Text>
          </View>
        </View>
      ) : null}
      {/* ONE ROW, TWO ENDS. Centring the codes and pinning the price to the corner put both on the
          same line with nothing arbitrating between them, and on a real pocket they overlapped —
          a Sword & Shield card needs about 217px of labels in about 120px of card. Codes left,
          price right, laid out rather than absolutely placed, so flexbox keeps them apart instead
          of arithmetic hoping they will be. The kind badge joins the codes as a leading chip when
          the row is up, so it is not a third thing quietly occupying the same corner. */}
      {bottom.length > 0 ? (
        <View style={[styles.bottomRow, { bottom: bottomOf('codes') }]}>
          <View style={styles.bottomCodes}>
            {/* kindLabel, not kind: `kind` is 'normal' on most cards, and a truthy value with no
                label to show renders as an empty pill sitting on the art. */}
            {kindLabel(kind) && bottom.length > 0 ? (
              <View style={[styles.onCardChip, { backgroundColor: label.bg }]}>
                <Text numberOfLines={1} style={[styles.badgeText, { color: label.text }]}>
                  {kindLabel(kind)}
                </Text>
              </View>
            ) : null}
            {/* Everything left on this row is fixed-width and short — a four-letter series code, a
                three-digit number — so nothing here needs to shrink. The one label whose length
                nobody controls moved up to the artist's row, which has the width for it. */}
            {bottom.map((b) => (
              <View
                key={b.key}
                style={[styles.onCardChip, b.key === 'number' && styles.numberChip, { backgroundColor: label.bg }]}>
                <Text numberOfLines={1} style={[styles.badgeText, { color: label.text }]}>
                  {b.value}
                </Text>
              </View>
            ))}
          </View>
          {/* The price is FILLED, not tinted. It is the one label people are looking for, and at
              this size a coloured word on a dark pill is just a slightly different grey — the
              chip has to carry the colour for it to read as the thing worth finding. */}
        </View>
      ) : null}
      {/* THE PRICE, IN ITS OWN COLUMN. Pinned to the bottom-right corner rather than sharing the
          codes row, so its height is its own business and the reference labels stack at their
          own size whatever the number says. Semi-transparent, like every other chip on the card:
          filled accent hid whatever art was under it, and the price is worth reading, not worth
          covering a card for. */}
      {corner.length > 0 ? (
        <View style={[styles.priceColumn, { bottom: CHIP_INSET, right: CHIP_INSET }]}>
          {corner.map((c) => (
            <View
              key={c.value}
              style={[
                styles.onCardChip,
                {
                  paddingHorizontal: priceBox.padH,
                  backgroundColor: label.bg,
                  // AS TALL AS THE LABEL STACK OPPOSITE IT, so the two bottom corners share a
                  // baseline AND a top edge instead of the price floating short of the rows beside
                  // it. Height is set rather than padded to it: the number's own line box is
                  // smaller, and centring it inside the measured height is what keeps the two
                  // sides square whatever the pocket size or however many rows are switched on.
                  height: stackHeight,
                  justifyContent: 'center',
                },
              ]}>
              <Text
                numberOfLines={1}
                style={[
                  styles.badgeText,
                  { fontSize: priceBox.fontSize, lineHeight: priceBox.lineHeight, color: label.text },
                ]}>
                {c.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A green ✓ corner badge marking a card the viewer owns (own ≥ 1) — top-left, matching the
 *  browse grid's owned marker. Off unless `owned`; shrinks on small (neighbour) tiles. */
function OwnedBadge({ owned, small, scale = 1 }: { owned: boolean; small: boolean; scale?: number }) {
  if (!owned) return null;
  // THE SAME HEIGHT AS THE FINISH CHIP OPPOSITE IT. Both sit at the top of the pocket and the eye
  // pairs them, so the owned mark takes the finish chip's box rather than a size of its own — it
  // was noticeably the taller of the two. Neighbour tiles keep the old small mark: a filmstrip is
  // not something anyone reads.
  const box = chipBox(scale);
  const size = small ? 13 : box.height;
  const type = small ? { fontSize: 8, lineHeight: 10 } : { fontSize: box.fontSize, lineHeight: box.lineHeight };
  return (
    <View
      pointerEvents="none"
      style={[styles.ownedBadge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.ownedBadgeText, type]}>✓</Text>
    </View>
  );
}

/**
 * The metadata caption strip beneath a card: the enabled fields (in canonical order) joined by
 * " * ", read straight from the catalog's `CatalogCard`. Rendered on a subtle scrim pill — like
 * the size badge — so it stays legible over any page background. Renders nothing until the
 * catalog resolves the card or when no enabled field has a value.
 */
function SlotCaption({
  cardId,
  catalog,
  fields,
  price,
  left,
  top,
  width,
  height,
  small,
}: {
  cardId: string;
  catalog: Catalog | null;
  fields: CaptionFieldKey[];
  price?: number;
  left: number;
  top: number;
  width: number;
  height: number;
  small: boolean;
}) {
  const card = resolveCatalogCardWith(catalog, cardId);
  const text = card ? formatCaption(card, fields, { price }) : '';
  if (!text) return null;
  return (
    <View pointerEvents="none" style={[styles.caption, { left, top, width, height }]}>
      <View style={styles.captionPill}>
        <Text numberOfLines={2} style={[styles.captionText, small && styles.captionTextSmall]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/** The attribution strip beneath a custom artwork panel — mirrors SlotCaption's styling. Shows
 *  the illustrator when the slot's stored attribution carries one ("art · suyari · The Art of
 *  Pokémon"); otherwise derives what the source URL reveals. */
function ArtCaption({
  url,
  attribution,
  left,
  top,
  width,
  height,
  small,
}: {
  url: string;
  attribution?: ArtAttribution;
  left: number;
  top: number;
  width: number;
  height: number;
  small: boolean;
}) {
  return (
    <View pointerEvents="none" style={[styles.caption, { left, top, width, height }]}>
      <View style={styles.captionPill}>
        <Text numberOfLines={2} style={[styles.captionText, small && styles.captionTextSmall]}>
          {`art · ${attributionLabel(deriveAttribution(url, attribution))}`}
        </Text>
      </View>
    </View>
  );
}

/**
 * A card image resolved from its id — no catalog required. Uses the 245px tier for small grids
 * and 640px for the larger binder-page view, falling back to the full jpg if a webp tier 404s.
 * A shimmering skeleton shows until the image loads, so a pocket never reads as blank/broken.
 */
function CardImage({
  id,
  radius,
  small,
  contentFit,
  scanUri,
  instant,
}: {
  /** Skip the fade-in: this is a copy drawn for an animation, not a picture arriving. */
  instant?: boolean;
  id: string;
  radius: number;
  small: boolean;
  contentFit: 'cover' | 'contain';
  /** The owner's real scan of this card. Tried FIRST; an error (upload pending, object gone)
   *  falls into the normal tier march. See BinderGridProps.scanUrlOf. */
  scanUri?: string;
}) {
  // Kick off image-manifest hydration; the return re-renders us when it lands.
  const manifestReady = useImageManifest();
  const [stage, setStage] = useState<'scan' | 'tier' | 'full' | 'failed'>(scanUri ? 'scan' : 'tier');
  const [loaded, setLoaded] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const tier: 245 | 640 = small ? 245 : 640;
  // THE fix for blank slots on a cold refresh: cardThumbUrl reads the image manifest, which is
  // mutable MODULE state the React Compiler can't track. A plain `const uri = cardThumbUrl(...)`
  // gets memoised on [id, tier, stage] and returns the first '' forever — the slot only fills in
  // when a REMOUNT (paging the binder) recomputes it, which is exactly the "blank until I scroll"
  // symptom. Recompute via a useMemo whose deps include the reactive manifest signal (and the poll
  // counter below), so the '' → real-URL swap happens in place the instant the manifest lands.
  const uri = useMemo(
    () =>
      stage === 'scan'
        ? (scanUri ?? '')
        : stage === 'full'
          ? cardThumbUrl(id, 'full')
          : cardThumbUrl(id, tier),
    // manifestReady + attempts are DELIBERATE extra deps: the callback doesn't reference them, but
    // cardThumbUrl's result changes with the (untrackable) module-level manifest, so we recompute
    // whenever the manifest flips or the poll ticks. Not unnecessary — the fix depends on them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, tier, stage, manifestReady, attempts, scanUri],
  );

  // A COPY DRAWN FOR AN ANIMATION HAS NO NEWS TO GIVE. It duplicates a pocket already on screen,
  // so a skeleton on it would announce a load that has, by definition, already happened. Delaying
  // the skeleton for ordinary pockets as well was tried and made no visible difference, so the
  // rule stops here rather than growing a timer nobody can see the effect of.
  const quiet = Boolean(instant);

  // cardThumbUrl resolves to '' until the content-hashed image manifest lands. On a COLD load the
  // manifest's own re-render can't be relied on (a module-state read the React Compiler memoises,
  // so `manifestReady` stayed stale and cards sat blank until an unrelated re-render — paging the
  // binder). So actively re-attempt on a short interval until the id resolves to a URL, then stop.
  // Bounded (~6s) so a wholly unmirrored card (never in the manifest) settles on the placeholder
  // rather than polling forever.
  const MAX_ATTEMPTS = 24;
  /* eslint-disable react-hooks/set-state-in-effect -- deliberate poll until the manifest resolves */
  useEffect(() => {
    if (uri || stage === 'failed' || attempts >= MAX_ATTEMPTS) return;
    const t = setTimeout(() => setAttempts((a) => a + 1), 250);
    return () => clearTimeout(t);
  }, [uri, stage, attempts]);
  // Recycled pocket, or the Scans pill flipping: a new card id (or the scan appearing /
  // disappearing without a remount — CardImage is keyed by id) starts fresh.
  useEffect(() => {
    setStage(scanUri ? 'scan' : 'tier');
    setLoaded(false);
    setAttempts(0);
  }, [id, scanUri]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (stage === 'failed') {
    return <CardPlaceholder radius={radius} />;
  }

  // Empty URL = manifest not resolved yet. Skeleton while we're still polling; once the retry
  // budget is spent, a wholly unmirrored card settles on the placeholder (an empty <img> source
  // may never fire onError, which would leave the skeleton pulsing forever).
  if (!uri) {
    if (attempts >= MAX_ATTEMPTS) return <CardPlaceholder radius={radius} />;
    return (
      <View style={styles.fill}>{quiet ? null : <Skeleton radius={radius} />}</View>
    );
  }

  return (
    <View style={styles.fill}>
      <Image
        // Keyed by the resolved URI: when the image manifest lands mid-load the uri SWAPS
        // (flat convention path → hashed/CDN). Without a remount, the aborted first request's
        // stale onError fires into the new render and marches tier→full→failed while the good
        // response lands in a dead component — cards stuck on "?" until reload. A fresh
        // instance per uri means stale callbacks die with the old one.
        key={uri}
        source={{ uri }}
        style={styles.fill}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={`${id}-${stage}`}
        // A DECORATIVE COPY DOES NOT FADE IN. The page-turn overlay mounts fresh copies of pages
        // that are already on screen, and a 150ms fade on each one is exactly the "page visibly
        // refreshing" flash a turn was reported to have. The image is in the memory cache by then,
        // so there is nothing to cover — the transition was animating a swap that had happened.
        transition={instant ? 0 : 150}
        // Web: disable native <img> dragging so cards can't be dragged outside edit mode (edit
        // mode moves them via a gesture pan, not native drag). No-op on native.
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setStage((s) => (s === 'scan' ? 'tier' : s === 'tier' ? 'full' : 'failed'))}
      />
      {!loaded && !quiet ? <Skeleton radius={radius} /> : null}
    </View>
  );
}

/** A soft pulsing placeholder shown over a slot while its image loads. */
function Skeleton({ radius }: { radius: number }) {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 750 }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.skeleton, { borderRadius: radius }, animated]}
    />
  );
}

const styles = StyleSheet.create({
  page: {
    ...Shadows.page,
  },
  pocket: {
    borderWidth: 1,
    borderColor: BinderSurface.pocketBorder,
    backgroundColor: BinderSurface.pocketFill,
    overflow: 'hidden',
  },
  pocketInnerShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
    backgroundColor: BinderSurface.pocketInnerShadow,
  },
  addCell: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Palette.grayBorder50,
    alignItems: 'center',
    justifyContent: 'center',
    // A pocket you can click should say so before you click it. Web-only value, ignored on native
    // where there is no cursor to change.
    cursor: 'pointer',
  },
  /**
   * THE ONE BEING FILLED. Solid rather than dashed, in the selection colour, on a tinted ground —
   * three changes at once on purpose: a dashed border going one shade darker is a hover state, and
   * this has to read across the page from a panel on either side of it.
   */
  addCellActive: {
    borderStyle: 'solid',
    borderWidth: 2.5,
    borderColor: BinderSurface.selection,
    backgroundColor: Palette.panel,
  },
  /** Hover firms the dashes up; press fills them in. Both stop short of looking like a card. */
  addCellHovered: { borderColor: Palette.grayBorder70, backgroundColor: Palette.panelAlt },
  addCellPressed: { borderColor: BinderSurface.selection, backgroundColor: Palette.panel },
  addPlus: {
    fontSize: FontSize.title,
    color: Palette.grayBorder70,
  },
  addPlusLit: { color: BinderSurface.selection },
  dropTarget: {
    borderWidth: 2,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
    zIndex: 2,
  },
  dimmed: {
    opacity: 0.22,
  },
  ghost: {
    zIndex: 50,
    shadowColor: Palette.black,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  fill: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  cardFrame: {
    backgroundColor: BinderSurface.cardFrame,
    borderWidth: 1,
    borderColor: BinderSurface.cardFrameBorder,
    padding: 2,
  },
  insert: {
    borderWidth: 1,
    borderColor: BinderSurface.insertBorder,
  },
  artworkPanel: {
    backgroundColor: Palette.chromeDeep,
  },
  artworkFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Palette.grayBorder50,
    paddingHorizontal: 4,
  },
  artGapText: {
    color: Palette.grayBorder70,
    fontSize: FontSize.sm,
    fontWeight: Weight.semibold,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  artGapTextSmall: { fontSize: FontSize.micro, letterSpacing: 0 },
  artworkFallbackText: {
    color: Palette.onDarkMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  insertHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: BinderSurface.insertHighlight,
  },
  foil: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  foilBar: {
    position: 'absolute',
    // Oversized + rotated so the bar reads as a diagonal band crossing the card.
    top: '-60%',
    bottom: '-60%',
    width: '34%',
    backgroundColor: BinderSurface.foilSheen,
    transform: [{ rotate: '24deg' }],
  },
  foilBarA: {
    left: '6%',
  },
  foilBarB: {
    left: '40%',
    width: '16%',
  },
  selected: {
    borderWidth: 2,
    borderColor: BinderSurface.selection,
  },
  resizeOverlay: {
    position: 'absolute',
    zIndex: 40,
    borderWidth: 2,
    borderColor: BinderSurface.selection,
  },
  resizeHit: {
    position: 'absolute',
    right: -22,
    bottom: -22,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeHandle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BinderSurface.selection,
    borderWidth: 2,
    borderColor: Palette.white,
  },
  // The selected-pocket toolbar: the light gallery voice (surface pill, hairline, soft lift)
  // rather than a dark chrome bar, matching the studio's contextual action bars.
  /** A hairline between "change this pocket" and "stop": the only separation Remove had was 2px. */
  toolDivider: { width: 1, alignSelf: 'stretch', marginHorizontal: 4, backgroundColor: Palette.hairlineStrong },
  slotToolbar: {
    position: 'absolute',
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    shadowColor: Palette.black,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toolBtn: {
    // 5px of vertical padding on a 13px label is a 23px target. These sit in a row of six, so a
    // miss is not a no-op — it is the neighbouring verb, and one of the six is Remove.
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
  },
  toolBtnText: {
    color: Palette.ink2,
    fontSize: FontSize.label,
    fontWeight: Weight.semibold,
  },
  toolBtnTextDanger: {
    color: Palette.dangerAlt,
  },
  skeleton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.skeletonFill,
  },
  caption: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 3,
    paddingHorizontal: 2,
  },
  captionPill: {
    maxWidth: '100%',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Palette.scrim62,
  },
  captionText: {
    color: Palette.white,
    fontSize: FontSize.xs,
    lineHeight: 13,
    fontWeight: Weight.medium,
    textAlign: 'center',
  },
  captionTextSmall: {
    fontSize: FontSize.micro,
    lineHeight: 11,
  },
  // The strip the chip is right-aligned within, so a one- or three-character label both sit flush
  // to the pocket's right edge.
  variantRow: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  variantChip: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    // Radius.tag is 3 in every theme; Radius.sm jumps to 6 in one of them, which reads as a
    // different component rather than the same chip.
    borderRadius: Radius.tag,
    // A hairline so a bright chip keeps its edge over bright card art.
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.30)',
    zIndex: 20,
  },
  variantChipAsking: {
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: Palette.scrim45,
  },
  variantChipText: {
    fontSize: FontSize.micro,
    fontWeight: Weight.bold,
    lineHeight: 11,
    letterSpacing: 0.2,
  },
  badge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    backgroundColor: Palette.scrim62,
  },
  // --- Labels drawn ON the card. Two stacked rows along the bottom edge plus one corner; see
  // CardLabels and the placement table in cardCaption.ts.
  // One stacked line of labels. `bottom` is supplied per row by CardLabels, which knows how many
  // rows are actually showing — see the stack there.
  overlayRow: {
    position: 'absolute',
    left: 2,
    right: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  // The illustrator, alone on its row. It may shrink, but never below a width that could still
  // show a couple of characters — a pill squeezed to nothing reads as a rendering fault rather
  // than as a name that ran out of room.
  wordyChip: { flexShrink: 1, minWidth: 30 },
  bottomRow: {
    position: 'absolute',
    left: 2,
    right: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 2,
  },
  // The codes shrink before the price does: if something has to give on a very narrow pocket, it
  // should be the half that is reference material, not the half people came to look at.
  bottomCodes: { flexDirection: 'row', gap: 2, flexShrink: 1 },
  // The only thing on this row allowed to give, and only at the extremes: an unusually long price
  // ("$1,234.56") on an unusually narrow pocket would otherwise push the number until something
  // clipped, and what clipped would be whichever end lost. The floor keeps the numerator legible,
  // so it shortens to "088/1…" rather than to an empty pill — the failure this row has had twice.
  numberChip: { flexShrink: 1, minWidth: 32 },
  // The price's own column, pinned to the corner and free to be whatever height it needs. Above
  // the label rows, because where the two meet the number is the one worth reading.
  priceColumn: { position: 'absolute', alignItems: 'flex-end', maxWidth: '70%', zIndex: 5 },

  onCardChip: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: Radius.tag,
    backgroundColor: Palette.scrim62,
  },
  onCardAccentChip: { backgroundColor: Palette.accent },
  onCardAccentText: { color: Palette.accentText },
  badgeText: {
    color: Palette.white,
    fontSize: FontSize.micro,
    fontWeight: Weight.bold,
    // Without an explicit line height the platform default leaves a couple of pixels of air above
    // and below every label, which at this size is most of a row's worth across a stack of three.
    lineHeight: 11,
    // Tracking that helps five-point caps on a poster only pads a word out here.
    letterSpacing: 0.2,
  },
  // Owned marker — the same green as the browse grid's owned check (#2e9e5b).
  // Sized to sit level with the finish chip opposite it, and inset to match the label rows below.
  // At 20px it was the loudest thing on a small pocket, for a mark that only says yes.
  ownedBadge: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2e9e5b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownedBadgeSmall: { top: 2, left: 2, width: 13, height: 13, borderRadius: 6.5 },
  ownedBadgeText: { color: Palette.white, fontSize: 10, fontWeight: Weight.bold, lineHeight: 12 },
  ownedBadgeTextSmall: { fontSize: 8, lineHeight: 10 },
});
