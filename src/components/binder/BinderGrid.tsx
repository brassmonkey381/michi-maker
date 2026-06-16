import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BinderSurface, Radii, Shadows, SlotBackingFallback } from '@/constants/theme';
import { CARDS_BY_ID } from '@/data/sampleData';
import { occupiedCells, type DemoPage, type DemoSlot } from '@/data/binderTypes';

const CARD_ASPECT = 88 / 63; // height / width of a standard card

interface BinderGridProps {
  page: DemoPage;
  /** Outer page width in px (padding is added internally). */
  width: number;
  editable?: boolean;
  selectedSlotId?: string | null;
  onSlotPress?: (slot: DemoSlot) => void;
  onCellPress?: (row: number, col: number) => void;
}

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

  const box = (row: number, col: number, rowSpan: number, colSpan: number) => ({
    position: 'absolute' as const,
    left: col * (cellW + gap),
    top: row * (cellH + gap),
    width: colSpan * cellW + (colSpan - 1) * gap,
    height: rowSpan * cellH + (rowSpan - 1) * gap,
  });

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
          const content = <SlotContent slot={slot} radius={slotRadius} />;
          const style = [box(slot.row, slot.col, slot.rowSpan, slot.colSpan)];
          if (!editable) {
            return (
              <View key={slot.id} style={style}>
                {content}
              </View>
            );
          }
          return (
            <Pressable
              key={slot.id}
              style={[style, selected && { ...styles.selected, borderRadius: slotRadius + 2 }]}
              onPress={() => onSlotPress?.(slot)}>
              {content}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SlotContent({ slot, radius }: { slot: DemoSlot; radius: number }) {
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
});
