import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { BinderSurface, FontSize, Palette, Radii, Radius, Shadows, SlotBackingFallback, Weight } from '@/constants/theme';
import { resolveCardWith, resolveCatalogCardWith } from '@/data/cardResolver';
import { formatCaption, type CaptionFieldKey } from '@/data/cardCaption';
import { occupiedCells, type DemoCard, type DemoPage, type DemoSlot } from '@/data/binderTypes';
import { useCatalog } from '@/hooks/use-catalog';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import type { Catalog } from '@/lib/catalog';
import { getPriceSummary, priceSnapshot, type PriceSummary } from '@/lib/prices';

const CARD_ASPECT = 88 / 63; // height / width of a standard card

interface BinderGridProps {
  page: DemoPage;
  /** Outer page width in px (padding is added internally). */
  width: number;
  editable?: boolean;
  /** Metadata fields to show as a caption under each card. Empty/undefined ⇒ no captions. */
  captionFields?: CaptionFieldKey[];
  selectedSlotId?: string | null;
  /** Extra slots shown highlighted (Ctrl/Cmd multi-select) — a border only, no per-slot toolbar. */
  multiSelectedIds?: ReadonlySet<string> | null;
  onSlotPress?: (slot: DemoSlot) => void;
  onCellPress?: (row: number, col: number) => void;
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
  /** Cross-page drag: report the drop point (the dragged card's centre) in THIS grid's
   *  inner-content coords. The editor maps it to window coords via the source grid's
   *  localToWindow and hit-tests every page in one frame. Replaces onDropSlot's local target. */
  onCrossDrop?: (slotId: string, localX: number, localY: number) => void;
  /** Fired when a slot drag begins — lets the editor re-measure sibling grids for hit-testing. */
  onDragStart?: () => void;
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
    selectedSlotId,
    multiSelectedIds,
    onSlotPress,
    onCellPress,
    onDropSlot,
    onResizeSlot,
    onReplaceSlot,
    onDuplicateSlot,
    onRemoveSlot,
    onDeselectSlot,
    onAutoFillSlot,
    onCrossDrop,
    onDragStart,
  }: BinderGridProps,
  ref,
) {
  // Passive catalog subscription: card *images* come from the id directly (cardThumbUrl), so the
  // grid never forces the ~25 MB catalog load just to render — covers paint immediately. When the
  // catalog is already loaded (editor/picker), we use it only to enrich (the jumbo/V-UNION badge).
  // Captions, though, need real metadata (name/set/rarity/…), so turning them on forces the load.
  const captionOn = captionFields.length > 0;
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

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }, { translateY: dragY.value }, { scale: 1.06 }],
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

        {/* Empty-cell tap targets (edit mode only; neighbours in the spread omit onCellPress). */}
        {editable && onCellPress &&
          emptyCells.map(({ row, col }) => (
            <Pressable
              key={`add-${row}-${col}`}
              style={[box(row, col, 1, 1), styles.addCell, { borderRadius: slotRadius }]}
              onPress={() => onCellPress?.(row, col)}>
              {!small && <Text style={styles.addPlus}>+</Text>}
            </Pressable>
          ))}

        {/* Placed slots. */}
        {page.slots.map((slot) => {
          const selected =
            editable && (slot.id === selectedSlotId || !!multiSelectedIds?.has(slot.id));
          const style = box(slot.row, slot.col, slot.rowSpan, slot.colSpan);
          const content = <SlotContent slot={slot} radius={slotRadius} small={small} catalog={catalog} />;
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

        {/* Metadata captions under each card — an independent layer so it doesn't disturb the
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
                price={priceSummary?.[slot.cardId]?.cur}
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
            <SlotContent slot={dragged} radius={slotRadius} small={small} catalog={catalog} />
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
      {onAutoFill ? <ToolButton label="✨ Fill" onPress={onAutoFill} /> : null}
      <ToolButton label="Remove" tone="danger" onPress={onRemove} />
      <ToolButton label="✕" onPress={onDeselect} />
    </View>
  );
}

function ToolButton({
  label,
  onPress,
  tone = 'default',
}: {
  label: string;
  onPress?: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.toolBtn, pressed && styles.dimmed]}>
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
        <View style={styles.resizeHandle} />
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

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[
          boxStyle,
          dimmed && styles.dimmed,
          selected && { ...styles.selected, borderRadius: slotRadius + 2 },
        ]}>
        {children}
      </View>
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
  crop,
  fit = 'cover',
}: {
  uri: string;
  radius: number;
  small: boolean;
  crop?: DemoSlot['imageCrop'];
  fit?: DemoSlot['imageFit'];
}) {
  const [failed, setFailed] = useState(false);
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
  const cw = validCrop ? Math.min(1, Math.max(0.05, crop!.w)) : 1;
  const ch = validCrop ? Math.min(1, Math.max(0.05, crop!.h)) : 1;
  const imgStyle = validCrop
    ? {
        position: 'absolute' as const,
        width: `${100 / cw}%` as DimensionValue,
        height: `${100 / ch}%` as DimensionValue,
        left: `${(-crop!.x / cw) * 100}%` as DimensionValue,
        top: `${(-crop!.y / ch) * 100}%` as DimensionValue,
      }
    : styles.fill;
  return (
    <View style={[styles.fill, styles.artworkPanel, { borderRadius: radius }]}>
      <Image
        source={{ uri }}
        style={imgStyle}
        contentFit={contain ? 'contain' : 'cover'}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={120}
        // Web: kill the browser's native image-drag ghost so a card can't be "dragged" outside
        // edit mode. Edit-mode reordering uses a gesture-handler pan, not native <img> drag, so
        // it's unaffected. No-op on native.
        draggable={false}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

/** A small corner badge marking a card's real-world size class (jumbo / V-UNION). */
function KindBadge({ kind, small }: { kind?: DemoCard['kind']; small: boolean }) {
  if (small || (kind !== 'jumbo' && kind !== 'vunion')) return null;
  return (
    <View pointerEvents="none" style={styles.badge}>
      <Text style={styles.badgeText}>{kind === 'jumbo' ? 'JUMBO' : 'V-UNION'}</Text>
    </View>
  );
}

function SlotContent({
  slot,
  radius,
  small,
  catalog,
}: {
  slot: DemoSlot;
  radius: number;
  small: boolean;
  catalog: Catalog | null;
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
    return <ArtworkImage uri={slot.imageUrl} radius={radius} small={small} crop={slot.imageCrop} fit={slot.imageFit} />;
  }

  const id = slot.cardId;
  if (!id) {
    return (
      <View style={[styles.fill, styles.missing, { borderRadius: radius }]}>
        <Text style={styles.missingText}>?</Text>
      </View>
    );
  }

  // The image comes from the id directly (no catalog needed). The catalog, when already loaded,
  // only enriches the size badge — so covers paint immediately even before it's available.
  const kind = resolveCardWith(catalog, id)?.kind;

  if (slot.type === 'artwork') {
    // Full-bleed hero art. A spanning slot (>1 cell) covers its box edge-to-edge so a
    // 2×2 reads as one big picture; a single 1×1 stays framed/contained. No card frame.
    const spanning = slot.rowSpan > 1 || slot.colSpan > 1;
    return (
      <View style={[styles.fill, { borderRadius: radius, backgroundColor: SlotBackingFallback }]}>
        <CardImage key={id} id={id} radius={radius} small={small} contentFit={spanning ? 'cover' : 'contain'} />
        <KindBadge kind={kind} small={small} />
      </View>
    );
  }

  // 'card' — framed like a card in a pocket, with a subtle diagonal foil sheen layered on top.
  return (
    <View style={[styles.fill, styles.cardFrame, { borderRadius: radius }]}>
      <View style={[styles.fill, { backgroundColor: SlotBackingFallback }]}>
        <CardImage key={id} id={id} radius={radius} small={small} contentFit="contain" />
        {/* Diagonal foil sheen: two translucent rotated bars layered as plain Views. */}
        <View pointerEvents="none" style={styles.foil}>
          <View style={[styles.foilBar, styles.foilBarA]} />
          <View style={[styles.foilBar, styles.foilBarB]} />
        </View>
        <KindBadge kind={kind} small={small} />
      </View>
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
}: {
  id: string;
  radius: number;
  small: boolean;
  contentFit: 'cover' | 'contain';
}) {
  // Subscribe to the content-hashed image manifest so this re-renders when it hydrates.
  const manifestReady = useImageManifest();
  const [stage, setStage] = useState<'tier' | 'full' | 'failed'>('tier');
  const [loaded, setLoaded] = useState(false);
  const tier: 245 | 640 = small ? 245 : 640;
  const uri = stage === 'full' ? cardThumbUrl(id, 'full') : cardThumbUrl(id, tier);

  // On a cold load the covers render BEFORE the manifest hydrates, so cardThumbUrl returns a
  // fallback that 404s and latches this to 'failed'. When the manifest lands (or the card id
  // changes) the id now resolves to a real hashed URL — retry from the top so it recovers
  // without needing a remount (previously the cover stayed broken until the binder was opened).
  /* eslint-disable react-hooks/set-state-in-effect -- deliberate retry on manifest/id change */
  useEffect(() => {
    setStage('tier');
    setLoaded(false);
  }, [manifestReady, id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (stage === 'failed') {
    return (
      <View style={[styles.fill, styles.missing, { borderRadius: radius }]}>
        <Text style={styles.missingText}>?</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Image
        source={{ uri }}
        style={styles.fill}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={`${id}-${stage}`}
        transition={150}
        // Web: disable native <img> dragging so cards can't be dragged outside edit mode (edit
        // mode moves them via a gesture pan, not native drag). No-op on native.
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setStage((s) => (s === 'tier' ? 'full' : 'failed'))}
      />
      {!loaded ? <Skeleton radius={radius} /> : null}
    </View>
  );
}

/**
 * Latest price summary, loaded lazily and only while `enabled` (the Price caption is on). Seeds
 * from any already-loaded snapshot so re-mounts are instant, and updates once the fetch resolves
 * so captions fill in without a manual refresh. Never throws — pricing stays optional decoration.
 */
function usePriceSummaryWhen(enabled: boolean): PriceSummary | null {
  const [summary, setSummary] = useState<PriceSummary | null>(() => priceSnapshot());
  useEffect(() => {
    if (!enabled || summary) return;
    let mounted = true;
    getPriceSummary().then((s) => {
      if (mounted) setSummary(s);
    });
    return () => {
      mounted = false;
    };
  }, [enabled, summary]);
  return summary;
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
  },
  addPlus: {
    fontSize: FontSize.title,
    color: Palette.grayBorder70,
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
  resizeHandle: {
    position: 'absolute',
    right: -11,
    bottom: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BinderSurface.selection,
    borderWidth: 2,
    borderColor: Palette.white,
  },
  slotToolbar: {
    position: 'absolute',
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Palette.chrome,
    shadowColor: Palette.black,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  toolBtnText: {
    color: Palette.white,
    fontSize: FontSize.label,
    fontWeight: Weight.semibold,
  },
  toolBtnTextDanger: {
    color: Palette.danger,
  },
  missing: {
    backgroundColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeleton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.skeletonFill,
  },
  missingText: {
    fontSize: FontSize.h2,
    color: Palette.onDark,
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
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Palette.scrim62,
  },
  badgeText: {
    color: Palette.white,
    fontSize: FontSize.micro,
    fontWeight: Weight.bold,
    letterSpacing: 0.5,
  },
});
