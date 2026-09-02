/**
 * THE LAYERS TRAY — what is on this cover surface, front-most first, the way Photoshop lists it.
 *
 * Always on screen while a surface is being decorated: docked, it sits under the Art dock's
 * header on EVERY tab, so switching to Artwork to fetch a piece does not lose sight of the
 * stack; when the dock cannot dock it floats as a card over the binder instead. Either way it
 * costs the pages nothing — an overlay and a dock are both outside the height budget.
 *
 * A row is `[thumb] [name] [eye] [lock] [✕ on the selected row]`, and a selected row is the
 * canvas's selection: the two are one piece of state. Tapping a row selects; tapping it again
 * does nothing, deliberately — a toggle here would deselect the thing you just reached for.
 *
 * ORDER. `items` is BOTTOM-FIRST (array order is z-order, later draws on top), so the tray shows
 * `[...items].reverse()` and maps a row back through rowToIndex. Reorder is the ▲ ▼ pair on the
 * selected row plus "to top / to bottom"; a drag grip can come later without changing the data.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Fonts, Palette, Radius, Weight } from '@/constants/theme';
import type { CoverDecoration } from '@/data/binderTypes';
import {
  MAX_DECORATIONS_PER_SURFACE,
  defaultName,
  moveDecoration,
  patchDecoration,
  removeDecoration,
  rowToIndex,
} from '@/data/coverDecorations';
import { fontFamilyFor } from '@/data/decorationFonts';
import { cardThumbUrl } from '@/lib/catalogConfig';

const ROW_H = 36;
const THUMB = 24;

export function LayersTray({
  items,
  selected,
  onSelect,
  onChange,
  floating = false,
}: {
  items: CoverDecoration[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: CoverDecoration[]) => void;
  /** Drawn as a card over the binder rather than as a strip inside the dock. */
  floating?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const rows = [...items].reverse();
  const count = items.length;

  const commit = (next: CoverDecoration[]) => {
    if (next !== items) onChange(next);
  };

  return (
    <View style={[styles.tray, floating && styles.floating]} testID="cover-layers">
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        style={styles.head}>
        <ThemedText type="smallBold">Layers</ThemedText>
        <Text style={[styles.count, count >= MAX_DECORATIONS_PER_SURFACE && styles.countFull]}>
          {count} / {MAX_DECORATIONS_PER_SURFACE}
        </Text>
        <Text style={styles.chevron}>{collapsed ? '▸' : '▾'}</Text>
      </Pressable>
      {collapsed ? null : count === 0 ? (
        <Text style={styles.empty}>Nothing on this surface yet. Add text, art or a sticker.</Text>
      ) : (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {rows.map((d, row) => {
            const index = rowToIndex(count, row);
            const on = d.id === selected;
            const isTop = index === count - 1;
            const isBottom = index === 0;
            return (
              <Pressable
                key={d.id}
                onPress={() => {
                  if (!on) onSelect(d.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${defaultName(d, index)}${d.hidden ? ', hidden' : ''}${d.locked ? ', locked' : ''}`}
                testID={`cover-layer-${d.id}`}
                style={[styles.row, on && styles.rowOn, d.hidden && styles.rowHidden]}>
                <View style={styles.thumb}>
                  <LayerThumb d={d} />
                </View>
                {renaming?.id === d.id ? (
                  <TextInput
                    autoFocus
                    value={renaming.draft}
                    onChangeText={(draft) => setRenaming({ id: d.id, draft })}
                    onSubmitEditing={() => {
                      const name = renaming.draft.trim();
                      commit(patchDecoration(items, d.id, { name: name || undefined }));
                      setRenaming(null);
                    }}
                    onBlur={() => setRenaming(null)}
                    style={styles.rename}
                  />
                ) : (
                  <Pressable
                    onLongPress={() => setRenaming({ id: d.id, draft: d.name ?? '' })}
                    onPress={() => {
                      if (!on) onSelect(d.id);
                    }}
                    style={styles.nameWrap}>
                    <Text numberOfLines={1} style={[styles.name, on && styles.nameOn]}>
                      {defaultName(d, index)}
                    </Text>
                  </Pressable>
                )}
                {on ? (
                  <View style={styles.orderBtns}>
                    <Tiny label="▲" hint="Bring forward" disabled={isTop} onPress={() => commit(moveDecoration(items, d.id, index + 1))} />
                    <Tiny label="▼" hint="Send backward" disabled={isBottom} onPress={() => commit(moveDecoration(items, d.id, index - 1))} />
                  </View>
                ) : null}
                <Tiny
                  label={d.hidden ? '◌' : '◉'}
                  hint={d.hidden ? 'Show' : 'Hide'}
                  onPress={() => commit(patchDecoration(items, d.id, { hidden: !d.hidden }))}
                  testID={`cover-layer-eye-${d.id}`}
                />
                <Tiny
                  label={d.locked ? '🔒' : '🔓'}
                  hint={d.locked ? 'Unlock' : 'Lock'}
                  dim={!d.locked}
                  onPress={() => commit(patchDecoration(items, d.id, { locked: !d.locked }))}
                />
                {on ? (
                  <Tiny
                    label="✕"
                    hint="Delete"
                    danger
                    onPress={() => {
                      commit(removeDecoration(items, d.id));
                      onSelect(null);
                    }}
                    testID={`cover-layer-delete-${d.id}`}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

/** A 24px picture of the row: the image, or the first two characters of the text in its font. */
function LayerThumb({ d }: { d: CoverDecoration }) {
  if (d.kind === 'text') {
    return (
      <View style={[styles.textThumb, { backgroundColor: d.bg && d.bg.shape !== 'none' ? d.bg.color : Palette.panel }]}>
        <Text numberOfLines={1} style={{ fontFamily: fontFamilyFor(d.font, Fonts as Record<string, string>), fontSize: 11, color: d.color }}>
          {d.text.trim().slice(0, 2) || 'Aa'}
        </Text>
      </View>
    );
  }
  const uri = d.cardId ? cardThumbUrl(d.cardId, 245) : d.imageUrl;
  if (!uri) return <View style={styles.textThumb} />;
  return <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={0} />;
}

function Tiny({
  label,
  hint,
  onPress,
  disabled = false,
  danger = false,
  dim = false,
  testID,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  dim?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={hint}
      style={({ pressed }) => [styles.tiny, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={[styles.tinyText, danger && styles.tinyDanger, dim && styles.tinyDim]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tray: {
    borderRadius: Radius.control,
    backgroundColor: Palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.hairlineStrong,
    overflow: 'hidden',
  },
  floating: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 300,
    zIndex: 80,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, height: 28 },
  count: { fontSize: FontSize.sm, color: Palette.muted, marginLeft: 'auto' },
  countFull: { color: Palette.danger, fontWeight: Weight.semibold },
  chevron: { fontSize: FontSize.sm, color: Palette.muted2 },
  empty: { fontSize: FontSize.sm, color: Palette.muted, paddingHorizontal: 10, paddingBottom: 10 },
  list: { maxHeight: ROW_H * 6 },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_H, paddingHorizontal: 6, gap: 6, borderLeftWidth: 2, borderLeftColor: 'transparent' },
  rowOn: { backgroundColor: Palette.panel, borderLeftColor: Palette.accent },
  rowHidden: { opacity: 0.45 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 4, overflow: 'hidden', backgroundColor: Palette.chromeDeepest },
  textThumb: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nameWrap: { flex: 1, minWidth: 0 },
  name: { fontSize: FontSize.label, color: Palette.ink2 },
  nameOn: { color: Palette.ink, fontWeight: Weight.semibold },
  rename: { flex: 1, minWidth: 0, fontSize: FontSize.label, color: Palette.ink, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, backgroundColor: Palette.panel },
  orderBtns: { flexDirection: 'row', gap: 2 },
  tiny: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  tinyText: { fontSize: 12, color: Palette.ink2 },
  tinyDanger: { color: Palette.danger },
  tinyDim: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.25 },
});

