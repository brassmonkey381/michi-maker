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
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type View as ViewType } from 'react-native';

import { WearRow } from '@/components/binder/inspector/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Shadows, Weight } from '@/constants/theme';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';
import { resolveWear } from '@/data/pageStyle';
import { useBinders } from '@/store/binders';

type Kind = 'sleeve' | 'artBacking';

const CARD_W = 360;

export function PageWearBar({ binder, page }: { binder: DemoBinder; page: DemoPage }) {
  const store = useBinders();
  const { width: winW, height: winH } = useWindowDimensions();
  const [open, setOpen] = useState<{ kind: Kind; x: number; y: number } | null>(null);
  const refs = { sleeve: useRef<ViewType>(null), artBacking: useRef<ViewType>(null) };

  const sleeve = resolveWear(page.sleeve, binder.pageStyle?.sleeve);
  const backing = resolveWear(page.artBacking, binder.pageStyle?.artBacking);

  const show = (kind: Kind) => {
    const node = refs[kind].current;
    if (!node) return;
    node.measureInWindow((x, y, w, h) => setOpen({ kind, x: x + w / 2, y: y + h }));
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
      <View style={[styles.swatch, colour ? { backgroundColor: colour } : styles.swatchNone]}>
        {colour ? null : <View style={styles.swatchSlash} />}
      </View>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );

  // The card sits under the chip, centred on it, clamped to the window; above it near the bottom.
  const cardLeft = open ? Math.max(8, Math.min(open.x - CARD_W / 2, winW - CARD_W - 8)) : 0;
  const below = open ? open.y + 8 : 0;
  const cardTop = open && below + 120 > winH ? Math.max(8, open.y - 150) : below;

  return (
    <>
      <View style={styles.bar} pointerEvents="box-none" testID="page-bar">
        {chip('sleeve', 'Sleeves', sleeve)}
        {chip('artBacking', 'Art backing', backing)}
      </View>
      {open ? (
        <Modal visible transparent animationType="none" onRequestClose={() => setOpen(null)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(null)} accessibilityLabel="Close" />
          <ThemedView type="backgroundElement" style={[styles.card, { top: cardTop, left: cardLeft, width: CARD_W }]}>
            <ThemedText type="smallBold" style={styles.cardTitle}>
              {open.kind === 'sleeve' ? 'Sleeves on this page' : 'Art backing on this page'}
            </ThemedText>
            {open.kind === 'sleeve' ? (
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
