/**
 * THE BOOKSHELF (MIC-017 piece 6, owner's pick "shelf toggle", 2026-11-10). My Binders as coloured
 * spines standing on shelf boards, the binder's cover colour finally meaning something. Pulling one
 * out (hover on a desk, the first tap on a phone) lifts it and shows its cover above it with the
 * binder's menu; clicking it, or tapping it again, opens the binder.
 *
 * The cover grid (BinderCoverGrid) stays the default; this is the other half of the Grid / Shelf
 * switch on My Binders, behind the 'mybinders-shelf' dev flag.
 */
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BinderThumb } from '@/components/binder/BinderThumb';
import { Fonts, FontSize, Palette, Radius } from '@/constants/theme';
import { binderColourway, binderModel } from '@/data/binderModels';
import type { DemoBinder } from '@/data/binderTypes';

/** Spines for binders without a chosen cover: muted binder colours, picked by id so they stay put. */
const PLAIN_SPINES = ['#2f4858', '#7a3b3b', '#3c5a3a', '#4a3f6b', '#8a5a2b', '#2e2e33', '#6b4c5e', '#2d5a6b'];

function spineColour(b: DemoBinder): string {
  if (b.cover) return binderColourway(binderModel(b.cover.modelId), b.cover.colourway).shell;
  let h = 0;
  for (let i = 0; i < b.id.length; i += 1) h = (h * 31 + b.id.charCodeAt(i)) | 0;
  return PLAIN_SPINES[Math.abs(h) % PLAIN_SPINES.length];
}

/** White or near-black title on the spine, whichever reads on its colour. */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#1d1d1f' : '#fff';
}

export function BinderShelf({
  binders,
  onOpen,
  accessory,
  testID,
}: {
  binders: readonly DemoBinder[];
  onOpen: (id: string) => void;
  accessory?: (binder: DemoBinder) => ReactNode;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const [pulled, setPulled] = useState<string | null>(null);
  const phone = width > 0 && width < 600;
  const spineW = phone ? 46 : 60;
  const spineH = phone ? 200 : 270;
  const gap = phone ? 6 : 8;
  const perShelf = width > 0 ? Math.max(1, Math.floor((width - 24 + gap) / (spineW + gap))) : 0;
  const shelves: DemoBinder[][] = [];
  if (perShelf) for (let i = 0; i < binders.length; i += perShelf) shelves.push(binders.slice(i, i + perShelf));
  const previewW = phone ? 150 : 180;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap} testID={testID}>
      {shelves.map((row, r) => (
        <View key={r} style={styles.shelf}>
          <View style={[styles.spines, { gap, minHeight: spineH + 30 }]}>
            {row.map((b, k) => {
              const colour = spineColour(b);
              const up = pulled === b.id;
              return (
                <View
                  key={b.id}
                  style={[styles.slot, { width: spineW, height: spineH + 30 }, up && styles.slotUp]}
                  // A desk pulls a spine on hover; a phone pulls it on the first tap.
                  onPointerEnter={Platform.OS === 'web' && !phone ? () => setPulled(b.id) : undefined}
                  onPointerLeave={Platform.OS === 'web' && !phone ? () => setPulled((p) => (p === b.id ? null : p)) : undefined}>
                  {up ? (
                    // Beside the spine, on whichever side has room, so it is never cut off at the top.
                    <View
                      style={[styles.preview, { width: previewW }, 12 + (k + 1) * (spineW + gap) + previewW + 10 <= width ? { left: spineW + 10 } : { right: spineW + 10 }]}
                      testID="shelf-preview">
                      <BinderThumb binder={b} width={previewW - 12} onPress={() => onOpen(b.id)} accessory={accessory?.(b)} />
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => (phone && pulled !== b.id ? setPulled(b.id) : onOpen(b.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.title}${phone && pulled !== b.id ? ', tap again to open' : ', open'}`}
                    testID="shelf-spine"
                    style={[
                      styles.spine,
                      { width: spineW, height: spineH, backgroundColor: colour, transform: [{ translateY: up ? -22 : 0 }] },
                    ]}>
                    <View style={styles.spineShade} pointerEvents="none" />
                    <View style={[styles.titleBox, { width: spineH - 24, left: (spineW - (spineH - 24)) / 2, top: (spineH - 24) / 2 }]}>
                      <Text numberOfLines={1} style={[styles.title, { color: inkOn(colour), fontSize: phone ? 13 : 16 }]}>
                        {b.title || 'Untitled binder'}
                      </Text>
                    </View>
                    <Text style={[styles.count, { color: inkOn(colour) }]}>{b.pages.length}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          <View style={styles.board} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 26, paddingTop: 10 },
  shelf: {},
  spines: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12 },
  slot: { justifyContent: 'flex-end', alignItems: 'center' },
  slotUp: { zIndex: 20 },
  spine: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  // A hint of a rounded spine: darker edges, a soft highlight.
  spineShade: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    borderLeftWidth: 4,
    borderRightWidth: 5,
    borderLeftColor: 'rgba(0,0,0,0.22)',
    borderRightColor: 'rgba(0,0,0,0.18)',
  },
  titleBox: { position: 'absolute', height: 24, marginTop: -12, transform: [{ rotate: '-90deg' }], justifyContent: 'center' },
  title: { fontFamily: Fonts?.brand, fontWeight: '700', textAlign: 'center', letterSpacing: 0.2 },
  count: { position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', fontSize: FontSize.tag, fontWeight: '700', opacity: 0.8 },
  board: {
    height: 14,
    borderRadius: 3,
    backgroundColor: '#8f6440',
    borderBottomWidth: 4,
    borderBottomColor: '#6b4728',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  preview: {
    position: 'absolute',
    bottom: 0,
    padding: 6,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Palette.hairline,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
});
