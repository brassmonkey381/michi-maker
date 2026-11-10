/**
 * THE HAND (MIC-017 editor-hand, owner's pick 2026-11-10). The binder's tray as a hand of cards
 * under the page, centred and as big as the tray allows (handLayout picks rows and size from the
 * tray's real width and height; every card keeps a strip to grab, and lifts on hover or pick). Same cards and same handling as the tray (CardTray: DemoBinder.tray) —
 * drag one up into any pocket, or tap it then a pocket; drag a card off the page onto the hand to
 * put it back. The header fills it fast: Suggest (cards that fit this page: similar, palette, theme,
 * the Complete-page fills sent here instead of into pockets), Search (the card browser, each pick
 * lands in the hand), and Clear.
 *
 * ON A PHONE (owner 2026-11-10, iPhone): the hand is part of the page, not a band under it: no
 * divider, no panel colour, and its controls (Hand · N, Suggest, Search, Clear) fold behind a
 * chevron at its bottom-right. They fold away by themselves when cards arrive (a search or a
 * Suggest finishing), and start open while the hand is empty so Suggest can be found.
 *
 * Behind the 'editor-hand' dev flag; BinderScreen decides where it sits and owns every store call.
 */
import { useMemo, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { TrayChip } from '@/components/binder/CardTray';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { DemoSlot } from '@/data/binderTypes';
import { handLayout } from '@/data/handLayout';

/** Height the cards may use: a little taller than the old tray on desktop, as before on phones. */
const CARDS_H_DESKTOP = 200;
const CARDS_H_PHONE = 150;
/** How far a hovered or picked card rises out of the hand. */
const LIFT = 14;

/** A small, stable tilt per card, so the hand looks held rather than gridded (-3..3 degrees). */
function tilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 7) - 3) * 1;
}

export function HandTray({
  slots,
  armedId,
  onArm,
  onDragStart,
  onDrop,
  onRemove,
  onClear,
  onSuggest,
  onSearch,
  ghostOn,
  ghostX,
  ghostY,
  trayRef,
  onHeight,
}: {
  slots: readonly DemoSlot[];
  armedId: string | null;
  onArm: (slotId: string | null) => void;
  onDragStart: (slot: DemoSlot) => void;
  onDrop: (slot: DemoSlot, windowX: number, windowY: number) => void;
  onRemove: (slot: DemoSlot) => void;
  onClear: () => void;
  onSuggest: () => void;
  onSearch: () => void;
  ghostOn: SharedValue<number>;
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
  trayRef: RefObject<View | null>;
  /** The hand's measured height, so the page leaves room for it. */
  onHeight: (h: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const ordered = useMemo(() => [...slots].sort((a, b) => a.col - b.col), [slots]);
  const phone = useWindowDimensions().width < 600;
  const [areaW, setAreaW] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  // Phone: are the hand's controls showing? Folds when cards arrive; opens when the hand empties.
  const n = ordered.length;
  const [tools, setTools] = useState(n === 0);
  const [seenN, setSeenN] = useState(n);
  if (n !== seenN) {
    setSeenN(n);
    if (n > seenN) setTools(false);
    else if (n === 0) setTools(true);
  }
  const showHeader = !phone || tools;
  const showCards = phone ? true : open;
  const L = useMemo(() => handLayout(ordered.length, areaW, phone ? CARDS_H_PHONE : CARDS_H_DESKTOP), [ordered.length, areaW, phone]);
  return (
    <View
      ref={trayRef}
      collapsable={false}
      style={[styles.hand, phone && styles.handPhone]}
      testID="editor-hand"
      onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}>
      {showHeader ? (
      <View style={[styles.header, phone && styles.headerPhone]}>
        {phone ? (
          <Text style={styles.title}>Hand{ordered.length ? ` · ${ordered.length}` : ''}</Text>
        ) : (
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.titleBtn}>
          <Text style={styles.title}>Hand{ordered.length ? ` · ${ordered.length}` : ''}</Text>
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
        </Pressable>
        )}
        <View style={styles.actions}>
          <Pressable onPress={onSuggest} style={[styles.btn, styles.btnPrimary]} accessibilityRole="button" testID="hand-suggest">
            <Text style={[styles.btnText, styles.btnPrimaryText]}>✦ Suggest</Text>
          </Pressable>
          <Pressable onPress={onSearch} style={styles.btn} accessibilityRole="button" testID="hand-search">
            <Text style={styles.btnText}>Search</Text>
          </Pressable>
          {ordered.length ? (
            <Pressable onPress={onClear} style={styles.btn} accessibilityRole="button" accessibilityLabel="Clear the hand">
              <Text style={styles.btnText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      ) : null}
      {showCards ? (
        ordered.length === 0 ? (
          phone && !tools ? null :
          <Text style={styles.empty}>
            Your hand is empty. Suggest deals cards that fit this page; Search adds the ones you pick. Drag a card up into a pocket, or a card from the page down here.
          </Text>
        ) : (
          <View style={styles.area} onLayout={(e) => setAreaW(Math.floor(e.nativeEvent.layout.width) - 2 * Spacing.three)} testID="hand-cards">
            <View style={{ width: L.width, height: L.height + LIFT, alignSelf: 'center' }}>
              {L.rows.map((row, r) =>
                row.map((i, k) => {
                    const slot = ordered[i];
                    const up = slot.id === hovered || slot.id === armedId;
                    return (
                      <View
                        key={slot.id}
                        onPointerEnter={() => setHovered(slot.id)}
                        onPointerLeave={() => setHovered((h) => (h === slot.id ? null : h))}
                        style={[
                          styles.card,
                          {
                            left: (r % 2 === 1 ? L.offset : 0) + k * L.stride,
                            top: LIFT + r * L.rowStep,
                            zIndex: up ? 100 : r * 30 + k,
                            transform: [{ translateY: up ? -LIFT : 0 }, { rotate: up ? '0deg' : `${tilt(slot.id)}deg` }],
                          },
                        ]}>
                        <TrayChip
                          slot={slot}
                          large={false}
                          size={{ w: L.cardW, h: L.cardH }}
                          removeOnlyArmed
                          armed={slot.id === armedId}
                          onArm={onArm}
                          onDragStart={onDragStart}
                          onDrop={onDrop}
                          onRemove={onRemove}
                          ghostOn={ghostOn}
                          ghostX={ghostX}
                          ghostY={ghostY}
                        />
                      </View>
                    );
                })
              )}
            </View>
          </View>
        )
      ) : null}
      {phone ? (
        <Pressable
          onPress={() => setTools((t) => !t)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ expanded: tools }}
          accessibilityLabel={tools ? 'Hide the hand controls' : 'Show the hand controls: Suggest, Search, Clear'}
          testID="hand-tools"
          style={styles.toolsBtn}>
          <Text style={styles.toolsBtnText}>{tools ? '▾' : '▴'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hand: {
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.surface,
    paddingBottom: Spacing.two,
  },
  // Phone: the hand sits on the page's own ground, close under it (owner 2026-11-10).
  handPhone: { borderTopWidth: 0, backgroundColor: 'transparent', paddingBottom: Spacing.one, minHeight: 40 },
  headerPhone: { paddingTop: 0, paddingRight: 52 },
  toolsBtn: {
    position: 'absolute',
    right: Spacing.two,
    bottom: Spacing.one,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Palette.hairline,
    zIndex: 200,
  },
  toolsBtnText: { fontSize: FontSize.md, color: Palette.ink, fontWeight: Weight.bold },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink },
  chevron: { fontSize: FontSize.md, color: Palette.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  btn: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  btnText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  btnPrimary: { backgroundColor: Palette.accent },
  btnPrimaryText: { color: Palette.accentText },
  empty: { fontSize: FontSize.sm, color: Palette.muted, lineHeight: 17, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  area: { paddingHorizontal: Spacing.three },
  card: { position: 'absolute' },
});
