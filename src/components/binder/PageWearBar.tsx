/**
 * THE PAGE BAR: what THIS page's pockets wear, on the page itself.
 *
 * Owner direction, 2026-09-14: binder-wide settings and defaults stay behind the gear, the
 * title and description stay behind the page's title, and the page-level colour choices (the
 * sleeves round its cards, the backing under its art) sit in a subtle toolbar attached to the
 * page, the way the pocket's tools attach to the pocket. Two chips, each showing the colour in
 * effect (the page's own, else the binder's, else bare); pressing one opens the same three-state
 * row the page dialog has (a colour, None, Use binder's) in a small card anchored under it.
 *
 * Drawn only on the page being edited, floating over its bottom edge so it costs the page no
 * height. The card is a transparent Modal placed at window coordinates, so it is never clipped
 * by the column or the scroller and closes on a tap anywhere else.
 */
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type View as ViewType } from 'react-native';

import { ColorBox, PillButton, Row, WearRow } from '@/components/binder/inspector/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BinderSurface, FontSize, Palette, Radius, Shadows, Weight } from '@/constants/theme';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';
import { isImageRef, resolveWear } from '@/data/pageStyle';
import { useBinders } from '@/store/binders';

type Kind = 'background' | 'sleeve' | 'artBacking';

/** Wide enough for Colour, the swatch, Picture and None on one line; narrower only on a phone. */
const CARD_W = 460;
/** The card's height before it has been measured: about one title and one row. */
const CARD_H_GUESS = 96;

export interface PageSelect {
  /** Select mode is on: taps on pockets add to the selection instead of opening them. */
  on: boolean;
  /** How many pockets are selected. */
  count: number;
  onToggle: () => void;
  /** Open the actions for the selection. */
  onActions: () => void;
}

export function PageWearBar({
  binder,
  page,
  select,
  hint = false,
}: {
  binder: DemoBinder;
  page: DemoPage;
  /** A one-time hint is pointing at this bar (data/editorHints): ring it. */
  hint?: boolean;
  /** The multi-select chip, when this page can be selected on. */
  select?: PageSelect;
}) {
  const store = useBinders();
  const { width: winW, height: winH } = useWindowDimensions();
  const [open, setOpen] = useState<{ kind: Kind; x: number; top: number; bottom: number } | null>(null);
  // The card's real height, once drawn: placed above the bar it has to clear the whole bar, and a
  // guess put it over the chips (the first draw sat 150px up and covered the row it came from).
  const [cardH, setCardH] = useState(CARD_H_GUESS);
  const refs = { background: useRef<ViewType>(null), sleeve: useRef<ViewType>(null), artBacking: useRef<ViewType>(null) };

  const background = page.backgroundColor ?? BinderSurface.mat;
  const bgPictured = isImageRef(background);
  const sleeve = resolveWear(page.sleeve, binder.pageStyle?.sleeve);
  const backing = resolveWear(page.artBacking, binder.pageStyle?.artBacking);

  const show = (kind: Kind) => {
    const node = refs[kind].current;
    if (!node) return;
    node.measureInWindow((x, y, w, h) => setOpen({ kind, x: x + w / 2, top: y, bottom: y + h }));
  };

  const chip = (kind: Kind, label: string, colour: string | undefined) => (
    <Pressable
      ref={refs[kind]}
      onPress={() => show(kind)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${label} on this page: ${colour ?? 'none'}. Change`}
      testID={`page-bar-${kind}`}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <View style={[styles.swatch, colour && !isImageRef(colour) ? { backgroundColor: colour } : styles.swatchNone]}>
        {isImageRef(colour) ? <Image source={{ uri: colour }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} /> : null}
        {colour ? null : <View style={styles.swatchSlash} />}
      </View>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );

  // The card sits under the chip, centred on it, clamped to the window. Near the bottom, where it
  // would not fit, it goes ABOVE the bar instead: its bottom edge 8px over the chip's top, so the
  // chip that opened it and its neighbours stay in view.
  const cardW = Math.min(CARD_W, winW - 16);
  const cardLeft = open ? Math.max(8, Math.min(open.x - cardW / 2, winW - cardW - 8)) : 0;
  const below = open ? open.bottom + 8 : 0;
  const cardTop = open && below + cardH > winH - 8 ? Math.max(8, open.top - 8 - cardH) : below;

  return (
    <>
      <View style={styles.bar} pointerEvents="box-none" testID="page-bar">
        {hint ? <View pointerEvents="none" style={styles.hintRing} /> : null}
        {chip('background', 'Background', background)}
        {chip('sleeve', 'Sleeves', sleeve)}
        {chip('artBacking', 'Art backing', backing)}
        {select ? (
          <Pressable
            // ONE CHIP, TWO JOBS (owner, 2026-09-15): off, it starts selecting; on with pockets
            // chosen, it opens their actions; on with none chosen, it stops. The count sits in
            // the chip, so nothing else on screen has to announce the mode.
            onPress={select.on && select.count > 0 ? select.onActions : select.onToggle}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: select.on }}
            accessibilityLabel={
              select.on
                ? select.count > 0
                  ? `Actions for ${select.count} selected pockets`
                  : 'Stop selecting pockets'
                : 'Select several pockets'
            }
            testID="binder-select-toggle"
            style={({ pressed }) => [styles.chip, select.on && styles.chipOn, pressed && styles.pressed]}>
            <Text style={[styles.chipGlyph, select.on && styles.chipTextOn]}>{'⊕'}</Text>
            <Text style={[styles.chipText, select.on && styles.chipTextOn]}>Select</Text>
            {select.on && select.count > 0 ? (
              <View style={styles.count} testID="binder-select-count">
                <Text style={styles.countText}>{select.count}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <Modal visible transparent animationType="none" onRequestClose={() => setOpen(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(null)} accessibilityLabel="Close" />
          <ThemedView
            type="backgroundElement"
            onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
            testID="page-bar-card"
            style={[styles.card, { top: cardTop, left: cardLeft, width: cardW }]}>
            <ThemedText type="smallBold" style={styles.cardTitle}>
              {open.kind === 'background' ? 'Background of this page' : open.kind === 'sleeve' ? 'Sleeves on this page' : 'Art backing on this page'}
            </ThemedText>
            {open.kind === 'background' ? (
              // THIS PAGE'S OWN COLOUR (owner, 2026-09-15). The binder's Background in Settings
              // paints every page at once; this paints one, and "All pages" spreads it.
              // A colour only (owner, 2026-09-15): a picture behind the pages is a share-image
              // choice, made in the Share sheet.
              <Row label="Colour">
                <ColorBox
                  fieldKey={`${page.id}-bar-bg`}
                  value={bgPictured ? undefined : background}
                  onChange={(backgroundColor) => store.updatePage(binder.id, page.id, { backgroundColor })}
                />
                <PillButton label="All pages" onPress={() => store.setBinderBackground(binder.id, bgPictured ? BinderSurface.mat : background)} testID="page-bg-all" />
              </Row>
            ) : open.kind === 'sleeve' ? (
              <WearRow
                label="Colour"
                fieldKey={`${page.id}-bar-sleeve`}
                own={page.sleeve}
                above={binder.pageStyle?.sleeve}
                inherit="Use binder's"
                onChange={(sleeve) => store.updatePage(binder.id, page.id, { sleeve })}
                testID="page-sleeve"
              />
            ) : (
              <WearRow
                label="Colour"
                fieldKey={`${page.id}-bar-backing`}
                own={page.artBacking}
                above={binder.pageStyle?.artBacking}
                inherit="Use binder's"
                onChange={(artBacking) => store.updatePage(binder.id, page.id, { artBacking })}
                testID="page-backing"
              />
            )}
          </ThemedView>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  /** Over the page's bottom edge, centred: attached to the page, not a row of its own. */
  /** The ring a one-time hint draws round the whole row of chips. */
  hintRing: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: '12%',
    right: '12%',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Palette.accent,
  },
  bar: {
    position: 'absolute',
    bottom: -15,
    left: 0,
    right: 0,
    zIndex: 61,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: Radius.pill,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    ...Shadows.page,
  },
  chipText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink2 },
  chipGlyph: { fontSize: FontSize.md, lineHeight: 16, color: Palette.ink2 },
  chipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  chipTextOn: { color: Palette.accentText },
  /** The count, inside the chip: a small number, not a second control. */
  count: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: Palette.surface, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: FontSize.xs, fontWeight: Weight.bold, color: Palette.accent, fontVariant: ['tabular-nums'] },
  swatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  swatchNone: { backgroundColor: Palette.panel },
  /** A diagonal through an empty swatch: "none", the way a colour picker draws it. */
  swatchSlash: { width: 20, height: 1.5, backgroundColor: Palette.dangerAlt, transform: [{ rotate: '-45deg' }] },
  card: {
    position: 'absolute',
    padding: 14,
    gap: 10,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairline,
    ...Shadows.page,
  },
  cardTitle: { marginBottom: 2 },
  pressed: { opacity: 0.7 },
});
