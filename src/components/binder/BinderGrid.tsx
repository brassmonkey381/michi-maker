import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { BinderSurface, Radii, Shadows, SlotBackingFallback } from '@/constants/theme';
import { CARDS_BY_ID } from '@/data/sampleData';
import { occupiedCells, type DemoCard, type DemoPage, type DemoSlot } from '@/data/binderTypes';

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
}

type BoxStyle = {
  position: 'absolute';
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Append ~13% alpha to a #rrggbb colour for a soft slot backing. */
function tint(hex?: string): string {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}22` : SlotBackingFallback;
}

/** A slightly stronger ~33% alpha tint, used as the full-bleed backing behind spanning art. */
function tintStrong(hex?: string): string {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}55` : SlotBackingFallback;
}

export function BinderGrid({
  page,
  width,
  editable = false,
  selectedSlotId,
  onSlotPress,
  onCellPress,
  onDropSlot,
}: BinderGridProps) {
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
          const content = <SlotContent slot={slot} radius={slotRadius} small={small} />;
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
            <SlotContent slot={dragged} radius={slotRadius} small={small} />
          </Animated.View>
        ) : null}
      </View>
    </View>
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

/** A custom artwork panel image, with a visible fallback if the URL fails to load. */
function ArtworkImage({ uri, radius, small }: { uri: string; radius: number; small: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.fill, styles.artworkPanel, styles.artworkFallback, { borderRadius: radius }]}>
        {!small ? <Text style={styles.artworkFallbackText}>image didn’t load</Text> : null}
      </View>
    );
  }
  return (
    <View style={[styles.fill, styles.artworkPanel, { borderRadius: radius }]}>
      <Image
        source={{ uri }}
        style={styles.fill}
        contentFit="cover"
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

function SlotContent({ slot, radius, small }: { slot: DemoSlot; radius: number; small: boolean }) {
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

  // A custom artwork panel — a pasted / playground image, sized to fill the slot.
  if (slot.type === 'artwork' && slot.imageUrl) {
    return <ArtworkImage uri={slot.imageUrl} radius={radius} small={small} />;
  }

  const cardData = slot.cardId ? CARDS_BY_ID[slot.cardId] : undefined;
  if (!cardData) {
    return (
      <View style={[styles.fill, styles.missing, { borderRadius: radius }]}>
        <Text style={styles.missingText}>?</Text>
      </View>
    );
  }

  if (slot.type === 'artwork') {
    // Full-bleed hero art. A spanning slot (>1 cell) covers its box edge-to-edge so a
    // 2×2 reads as one big picture; a single 1×1 stays framed/contained. No card frame.
    const spanning = slot.rowSpan > 1 || slot.colSpan > 1;
    return (
      <View
        style={[styles.fill, { borderRadius: radius, backgroundColor: tintStrong(cardData.dominantColor) }]}>
        <Image
          source={{ uri: cardData.imageUrl }}
          style={styles.fill}
          contentFit={spanning ? 'cover' : 'contain'}
        />
        <KindBadge kind={cardData.kind} small={small} />
      </View>
    );
  }

  // 'card' — framed like a card in a pocket, with a faint dominant-colour backing
  // and a subtle diagonal foil sheen layered on top.
  return (
    <View style={[styles.fill, styles.cardFrame, { borderRadius: radius }]}>
      <View style={[styles.fill, { backgroundColor: tint(cardData.dominantColor) }]}>
        <Image source={{ uri: cardData.imageUrl }} style={styles.fill} contentFit="contain" />
        {/* Diagonal foil sheen: two translucent rotated bars layered as plain Views. */}
        <View pointerEvents="none" style={styles.foil}>
          <View style={[styles.foilBar, styles.foilBarA]} />
          <View style={[styles.foilBar, styles.foilBarB]} />
        </View>
        <KindBadge kind={cardData.kind} small={small} />
      </View>
    </View>
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
  missing: {
    backgroundColor: '#ececec',
    alignItems: 'center',
    justifyContent: 'center',
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
