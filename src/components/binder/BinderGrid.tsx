import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
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

import { BinderSurface, Radii, Shadows, SlotBackingFallback } from '@/constants/theme';
import { resolveCardWith } from '@/data/cardResolver';
import { occupiedCells, type DemoCard, type DemoPage, type DemoSlot } from '@/data/binderTypes';
import { useCatalog } from '@/hooks/use-catalog';
import { cardThumbUrl } from '@/lib/catalogConfig';
import type { Catalog } from '@/lib/catalog';

const CARD_ASPECT = 88 / 63; // height / width of a standard card

interface BinderGridProps {
  page: DemoPage;
  /** Outer page width in px (padding is added internally). */
  width: number;
  editable?: boolean;
  selectedSlotId?: string | null;
  onSlotPress?: (slot: DemoSlot) => void;
  onCellPress?: (row: number, col: number) => void;
  /** Drag-and-drop: a slot was dropped with its top-left over (toRow, toCol). */
  onDropSlot?: (slotId: string, toRow: number, toCol: number) => void;
  /** Drag-to-resize: the selected slot's footprint changed to rowSpan×colSpan (top-left fixed). */
  onResizeSlot?: (row: number, col: number, rowSpan: number, colSpan: number) => void;
}

type BoxStyle = {
  position: 'absolute';
  left: number;
  top: number;
  width: number;
  height: number;
};

export function BinderGrid({
  page,
  width,
  editable = false,
  selectedSlotId,
  onSlotPress,
  onCellPress,
  onDropSlot,
  onResizeSlot,
}: BinderGridProps) {
  // Passive catalog subscription: card *images* come from the id directly (cardThumbUrl), so the
  // grid never forces the ~25 MB catalog load just to render — covers paint immediately. When the
  // catalog is already loaded (editor/picker), we use it only to enrich (the jumbo/V-UNION badge).
  const { catalog } = useCatalog(false);
  const small = width < 220;
  const pad = small ? 6 : 12;
  const gap = small ? 3 : 6;
  const radius = small ? Radii.pageSmall : Radii.page;
  const slotRadius = small ? Radii.slotSmall : Radii.slot;

  const innerW = width - pad * 2;
  const cellW = (innerW - gap * (page.cols - 1)) / page.cols;
  const cellH = cellW * CARD_ASPECT;
  const innerH = cellH * page.rows + gap * (page.rows - 1);

  const box = (row: number, col: number, rowSpan: number, colSpan: number): BoxStyle => ({
    position: 'absolute',
    left: col * (cellW + gap),
    top: row * (cellH + gap),
    width: colSpan * cellW + (colSpan - 1) * gap,
    height: rowSpan * cellH + (rowSpan - 1) * gap,
  });

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

        {/* Empty-cell tap targets (edit mode only). */}
        {editable &&
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
          const selected = editable && slot.id === selectedSlotId;
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
              dragX={dragX}
              dragY={dragY}
              onSetDragId={setDragId}
              onTap={onSlotPress}
              onDropSlot={onDropSlot}>
              {content}
            </DraggableSlot>
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
            rows={page.rows}
            cols={page.cols}
            radius={slotRadius}
            onResizeSlot={onResizeSlot}
          />
        ) : null}
      </View>
    </View>
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
  rows,
  cols,
  radius,
  onResizeSlot,
}: {
  slot: DemoSlot;
  cellW: number;
  cellH: number;
  gap: number;
  rows: number;
  cols: number;
  radius: number;
  onResizeSlot: (row: number, col: number, rowSpan: number, colSpan: number) => void;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const stepX = cellW + gap;
  const stepY = cellH + gap;
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
      height: rs * cellH + (rs - 1) * gap,
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
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onSetDragId: (id: string | null) => void;
  onTap?: (slot: DemoSlot) => void;
  onDropSlot?: (slotId: string, toRow: number, toCol: number) => void;
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
  dragX,
  dragY,
  onSetDragId,
  onTap,
  onDropSlot,
  children,
}: DraggableSlotProps) {
  const gesture = useMemo(() => {
    const stepX = cellW + gap;
    const stepY = cellH + gap;
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .activeOffsetY([-8, 8])
      .onBegin(() => {
        dragX.value = 0;
        dragY.value = 0;
      })
      .onStart(() => {
        runOnJS(onSetDragId)(slot.id);
      })
      .onUpdate((e) => {
        dragX.value = e.translationX;
        dragY.value = e.translationY;
      })
      .onEnd((e) => {
        const targetCol = Math.round((slot.col * stepX + e.translationX) / stepX);
        const targetRow = Math.round((slot.row * stepY + e.translationY) / stepY);
        if (onDropSlot) runOnJS(onDropSlot)(slot.id, targetRow, targetCol);
      })
      .onFinalize(() => {
        runOnJS(onSetDragId)(null);
      });
    const tap = Gesture.Tap().onEnd(() => {
      if (onTap) runOnJS(onTap)(slot);
    });
    return Gesture.Exclusive(pan, tap);
  }, [slot, cellW, cellH, gap, dragX, dragY, onSetDragId, onTap, onDropSlot]);

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
}: {
  uri: string;
  radius: number;
  small: boolean;
  crop?: DemoSlot['imageCrop'];
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.fill, styles.artworkPanel, styles.artworkFallback, { borderRadius: radius }]}>
        {!small ? <Text style={styles.artworkFallbackText}>image didn’t load</Text> : null}
      </View>
    );
  }
  const imgStyle = crop
    ? {
        position: 'absolute' as const,
        width: `${100 / crop.w}%` as DimensionValue,
        height: `${100 / crop.h}%` as DimensionValue,
        left: `${(-crop.x / crop.w) * 100}%` as DimensionValue,
        top: `${(-crop.y / crop.h) * 100}%` as DimensionValue,
      }
    : styles.fill;
  return (
    <View style={[styles.fill, styles.artworkPanel, { borderRadius: radius }]}>
      <Image
        source={{ uri }}
        style={imgStyle}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={120}
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
          { borderRadius: radius, backgroundColor: slot.insertColor ?? '#dddddd' },
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
    return <ArtworkImage uri={slot.imageUrl} radius={radius} small={small} crop={slot.imageCrop} />;
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
  const [stage, setStage] = useState<'tier' | 'full' | 'failed'>('tier');
  const [loaded, setLoaded] = useState(false);
  const tier: 245 | 640 = small ? 245 : 640;
  const uri = stage === 'full' ? cardThumbUrl(id, 'full') : cardThumbUrl(id, tier);

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
        onLoad={() => setLoaded(true)}
        onError={() => setStage((s) => (s === 'tier' ? 'full' : 'failed'))}
      />
      {!loaded ? <Skeleton radius={radius} /> : null}
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
    borderColor: 'rgba(128,128,128,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlus: {
    fontSize: 22,
    color: 'rgba(128,128,128,0.7)',
  },
  dimmed: {
    opacity: 0.22,
  },
  ghost: {
    zIndex: 50,
    shadowColor: '#000',
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
    backgroundColor: '#11111a',
  },
  artworkFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkFallbackText: {
    color: '#8a8a96',
    fontSize: 10,
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
    borderColor: '#ffffff',
  },
  missing: {
    backgroundColor: '#ececec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeleton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(150,150,150,0.20)',
  },
  missingText: {
    fontSize: 20,
    color: '#9a9a9a',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
