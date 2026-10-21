/**
 * THE CARD TRAY (owner, 2026-10-21: "a scratch work dock / tray"): the cards that are in this
 * binder but on no page. A card taken off a page while rearranging, or displaced from a full page
 * by an Arrange template, waits here and goes back into any pocket on any page.
 *
 * Sits at the head of the Cards side, docked or as a sheet, so the place cards come FROM is also
 * the place they wait. Same handling as the slice tray's chips, on purpose: drag a card onto a
 * pocket (web/desktop), or tap it then tap a pocket; a pocket's own bar has "Tray" to send a card
 * here, and a card dragged off a page onto this strip lands here too (BinderScreen measures it).
 * The × discards the card from the binder; Undo brings it back.
 *
 * Store-backed (DemoBinder.tray), so it survives reload and undo. Pure presentation: the drop
 * hit-test and every store call live in BinderScreen, which owns the page grids.
 */
import { Image } from 'expo-image';
import { memo, useMemo, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, type SharedValue } from 'react-native-reanimated';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { DemoSlot } from '@/data/binderTypes';
import { cardThumbUrl } from '@/lib/catalogConfig';

const CHIP_W = 56;
const CHIP_H = 78;

export function CardTray({
  slots,
  armedId,
  onArm,
  onDragStart,
  onDrop,
  onRemove,
  onClear,
  ghostOn,
  ghostX,
  ghostY,
  trayRef,
}: {
  slots: readonly DemoSlot[];
  armedId: string | null;
  onArm: (slotId: string | null) => void;
  onDragStart: (slot: DemoSlot) => void;
  onDrop: (slot: DemoSlot, windowX: number, windowY: number) => void;
  onRemove: (slot: DemoSlot) => void;
  /** Empty the tray in one go (owner, 2026-10-22): one commit, one Undo. */
  onClear: () => void;
  ghostOn: SharedValue<number>;
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
  /** The strip's own view, so a card dragged off a page can be dropped onto it. */
  trayRef: RefObject<View | null>;
}) {
  const [open, setOpen] = useState(true);
  const ordered = useMemo(() => [...slots].sort((a, b) => a.col - b.col), [slots]);
  return (
    <View ref={trayRef} style={styles.tray} collapsable={false}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}>
        <Text style={styles.headerTitle}>Tray{ordered.length ? ` · ${ordered.length}` : ''}</Text>
        <View style={styles.headerRight}>
          {ordered.length ? (
            <Pressable onPress={onClear} hitSlop={8} style={styles.clearBtn} accessibilityRole="button" accessibilityLabel="Clear the tray">
              <Text style={styles.clearBtnText}>Clear tray</Text>
            </Pressable>
          ) : null}
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        </View>
      </Pressable>
      {open ? (
        ordered.length === 0 ? (
          <Text style={styles.emptyText}>
            Cards you take off a page wait here. Drag one back into any pocket, or tap it and then tap a pocket.
          </Text>
        ) : (
          <View style={styles.strip}>
            {ordered.map((slot) => (
              <TrayChip
                key={slot.id}
                slot={slot}
                armed={slot.id === armedId}
                onArm={onArm}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onRemove={onRemove}
                ghostOn={ghostOn}
                ghostX={ghostX}
                ghostY={ghostY}
              />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const TrayChip = memo(function TrayChip({
  slot,
  armed,
  onArm,
  onDragStart,
  onDrop,
  onRemove,
  ghostOn,
  ghostX,
  ghostY,
}: {
  slot: DemoSlot;
  armed: boolean;
  onArm: (slotId: string | null) => void;
  onDragStart: (slot: DemoSlot) => void;
  onDrop: (slot: DemoSlot, windowX: number, windowY: number) => void;
  onRemove: (slot: DemoSlot) => void;
  ghostOn: SharedValue<number>;
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
}) {
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .activeOffsetY([-8, 8])
      .onStart((e) => {
        ghostOn.value = 1;
        ghostX.value = e.absoluteX;
        ghostY.value = e.absoluteY;
        runOnJS(onDragStart)(slot);
      })
      .onUpdate((e) => {
        ghostX.value = e.absoluteX;
        ghostY.value = e.absoluteY;
      })
      .onEnd((e) => {
        ghostOn.value = 0;
        runOnJS(onDrop)(slot, e.absoluteX, e.absoluteY);
      })
      .onFinalize(() => {
        ghostOn.value = 0;
      });
    const tap = Gesture.Tap().onEnd(() => {
      runOnJS(onArm)(armed ? null : slot.id);
    });
    return Gesture.Exclusive(pan, tap);
  }, [slot, armed, onArm, onDragStart, onDrop, ghostOn, ghostX, ghostY]);

  return (
    <View style={styles.chipWrap}>
      <GestureDetector gesture={gesture}>
        <View style={[styles.chip, armed && styles.chipArmed]} accessibilityRole="button" accessibilityLabel={armed ? 'Tray card, armed: tap a pocket to place it' : 'Tray card: tap to arm, or drag to a pocket'}>
          {slot.cardId ? (
            <Image source={{ uri: cardThumbUrl(slot.cardId, 245) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} />
          ) : null}
        </View>
      </GestureDetector>
      <Pressable onPress={() => onRemove(slot)} hitSlop={10} accessibilityLabel="Remove this card from the tray" style={styles.remove}>
        <Text style={styles.removeText}>×</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  tray: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
    backgroundColor: Palette.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerTitle: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  clearBtn: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  clearBtnText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink2 },
  chevron: { fontSize: FontSize.md, color: Palette.muted },
  emptyText: { fontSize: FontSize.sm, color: Palette.muted3, lineHeight: 17, paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  strip: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  chipWrap: { paddingTop: 6, paddingRight: 6 },
  chip: {
    width: CHIP_W,
    height: CHIP_H,
    borderRadius: Radius.thumb,
    overflow: 'hidden',
    backgroundColor: Palette.chromeDeepest,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
  },
  chipArmed: { borderWidth: 2, borderColor: Palette.accent },
  remove: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Palette.toast,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: Palette.white, fontSize: FontSize.sm, fontWeight: Weight.bold, lineHeight: 14 },
});
