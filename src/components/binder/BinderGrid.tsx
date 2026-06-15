import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}22` : '#f1f1f1';
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
  const radius = small ? 8 : 16;
  const slotRadius = small ? 4 : 8;

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
        { width, padding: pad, borderRadius: radius, backgroundColor: page.backgroundColor ?? '#ffffff' },
      ]}>
      <View style={{ width: innerW, height: innerH }}>
        {/* Pocket outlines for every cell (visible negative space). */}
        {Array.from({ length: page.rows * page.cols }).map((_, i) => {
          const row = Math.floor(i / page.cols);
          const col = i % page.cols;
          return (
            <View
              key={`pocket-${row}-${col}`}
              style={[box(row, col, 1, 1), styles.pocket, { borderRadius: slotRadius }]}
            />
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
    return (
      <View
        style={[styles.fill, { borderRadius: radius, backgroundColor: slot.insertColor ?? '#dddddd' }]}
      />
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
    return (
      <View
        style={[styles.fill, { borderRadius: radius, backgroundColor: tint(cardData.dominantColor) }]}>
        <Image source={{ uri: cardData.imageUrl }} style={styles.fill} contentFit="contain" />
      </View>
    );
  }

  // 'card' — framed like a card in a pocket.
  return (
    <View style={[styles.fill, styles.cardFrame, { borderRadius: radius }]}>
      <View style={[styles.fill, { backgroundColor: tint(cardData.dominantColor) }]}>
        <Image source={{ uri: cardData.imageUrl }} style={styles.fill} contentFit="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  pocket: {
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.22)',
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
    padding: 2,
  },
  selected: {
    borderWidth: 2,
    borderColor: '#3B82F6',
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
