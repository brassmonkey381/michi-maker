import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CARDS } from '@/data/sampleData';
import type { DemoSlot } from '@/data/binderTypes';

const SPANS: { label: string; rowSpan: number; colSpan: number }[] = [
  { label: '1×1', rowSpan: 1, colSpan: 1 },
  { label: '1×2', rowSpan: 1, colSpan: 2 },
  { label: '2×1', rowSpan: 2, colSpan: 1 },
  { label: '2×2', rowSpan: 2, colSpan: 2 },
];

interface CardPickerProps {
  visible: boolean;
  /** The existing slot at the target cell, if any. */
  slot?: DemoSlot | null;
  onClose: () => void;
  onPickCard: (cardId: string) => void;
  onSetSpan: (rowSpan: number, colSpan: number) => void;
  onClear: () => void;
}

export function CardPicker({
  visible,
  slot,
  onClose,
  onPickCard,
  onSetSpan,
  onClear,
}: CardPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <ThemedText type="subtitle">{slot ? 'Edit pocket' : 'Add a card'}</ThemedText>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Done</Text>
            </Pressable>
          </View>

          {slot && (
            <View style={styles.controlsRow}>
              <Text style={styles.controlsLabel}>Span</Text>
              {SPANS.map((span) => {
                const active = slot.rowSpan === span.rowSpan && slot.colSpan === span.colSpan;
                return (
                  <Pressable
                    key={span.label}
                    onPress={() => onSetSpan(span.rowSpan, span.colSpan)}
                    style={[styles.spanChip, active && styles.spanChipActive]}>
                    <Text style={[styles.spanChipText, active && styles.spanChipTextActive]}>
                      {span.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={onClear} style={styles.clearBtn}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            </View>
          )}

          <ScrollView contentContainerStyle={styles.grid}>
            {CARDS.map((card) => {
              const selected = slot?.cardId === card.id;
              return (
                <Pressable
                  key={card.id}
                  style={[styles.thumb, selected && styles.thumbSelected]}
                  onPress={() => onPickCard(card.id)}>
                  <View style={[styles.thumbImageWrap, { backgroundColor: `${card.dominantColor}22` }]}>
                    <Image source={{ uri: card.imageUrl }} style={styles.thumbImage} contentFit="contain" />
                  </View>
                  <Text numberOfLines={1} style={styles.thumbName}>
                    {card.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: '76%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d4d4d4',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  close: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  controlsLabel: {
    fontSize: 13,
    color: '#666',
    marginRight: 2,
  },
  spanChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f3',
  },
  spanChipActive: {
    backgroundColor: '#3B82F6',
  },
  spanChipText: {
    fontSize: 13,
    color: '#333',
  },
  spanChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  clearBtn: {
    marginLeft: 'auto',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fdeaea',
  },
  clearText: {
    fontSize: 13,
    color: '#c0392b',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 12,
  },
  thumb: {
    width: 70,
    borderRadius: 8,
    padding: 3,
  },
  thumbSelected: {
    backgroundColor: '#e8f0fe',
  },
  thumbImageWrap: {
    width: '100%',
    aspectRatio: 63 / 88,
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbName: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 3,
    color: '#444',
  },
});
