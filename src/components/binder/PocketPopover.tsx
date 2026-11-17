/**
 * THE DESKTOP POCKET POP-OVER (MIC-045 M2, `pocket-popover` dev flag): one 296px card beside the
 * picked pocket instead of the row of words and its "More" step. The tiles are the phone sheet's
 * (PhonePocketSheet): same glyphs, same order, three across. Fill page leads in the accent; Remove
 * sits alone under a rule in the danger tint, with the one key the editor really binds to it
 * (Delete). No other action has a key today, so none is shown.
 *
 * A pointer ties the card to its pocket. It opens to the pocket's right, flips to its left when the
 * right runs out of room, and is shifted up or down to stay inside `bounds` (the window when it
 * lives in the top layer, the page otherwise). When neither side fits it overlaps the pocket,
 * clamped, with no pointer.
 */
import { useState, type Ref } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Palette, Weight } from '@/constants/theme';
import type { DemoSlot } from '@/data/binderTypes';
import { flag } from '@/lib/flags';

const TRAY_WORD = flag('editor-hand') ? 'Hand' : 'Tray';

export const POPOVER_W = 296;
const SIDE_GAP = 12;
const EDGE = 8;
const ARROW = 14;

type Action = { key: string; glyph: string; word: string; label?: string; onPress: () => void; hot?: boolean };

export function PocketPopover({
  slot,
  name,
  pocketNumber,
  pageNumber,
  anchor,
  bounds,
  fixed,
  hint,
  popRef,
  onReplace,
  onEditArt,
  onAutoFill,
  onSimilar,
  onColors,
  onMove,
  onToTray,
  onDuplicate,
  onPickCopy,
  hasCopy,
  onStyle,
  onSplit,
  onRemove,
  onDeselect,
}: {
  slot: DemoSlot;
  /** The card's name when it is known. */
  name?: string | null;
  pocketNumber: number;
  /** One-based page number, when the host knows it. */
  pageNumber?: number;
  /** The pocket's box, in the same space as `bounds`. */
  anchor: { x: number; y: number; w: number; h: number };
  /** The space the card must stay inside. */
  bounds: { w: number; h: number };
  /** Position: fixed (top layer, window space) rather than absolute (page space). */
  fixed: boolean;
  /** A one-time hint is pointing at this card: ring it. */
  hint?: boolean;
  popRef?: Ref<View>;
  onReplace?: () => void;
  onEditArt?: () => void;
  onAutoFill?: () => void;
  onSimilar?: () => void;
  onColors?: () => void;
  onMove?: () => void;
  onToTray?: () => void;
  onDuplicate?: () => void;
  onPickCopy?: () => void;
  hasCopy?: boolean;
  onStyle?: () => void;
  onSplit?: () => void;
  onRemove?: () => void;
  onDeselect?: () => void;
}) {
  const [h, setH] = useState(0);
  const art = slot.type === 'artwork';

  // The phone sheet's list, in its order, minus Remove (it gets its own row below).
  const actions: Action[] = [];
  const push = (a: Action | null | undefined | false) => a && actions.push(a);
  push(onAutoFill && { key: 'fill', glyph: '✦', word: 'Fill page', label: 'Fill page: build the page around this card', onPress: onAutoFill, hot: true });
  push(onSimilar && { key: 'similar', glyph: '≈', word: 'Similar', label: 'Cards like this one', onPress: onSimilar });
  push(onColors && { key: 'colors', glyph: '◐', word: 'Colors', label: 'Cards in this one’s colours', onPress: onColors });
  push(onReplace && { key: 'replace', glyph: '⟳', word: 'Replace', onPress: onReplace });
  push(onEditArt && { key: 'edit', glyph: '✎', word: 'Edit', label: 'Edit this picture: zoom, rotate, flip, cut', onPress: onEditArt });
  push(onMove && { key: 'move', glyph: '⇄', word: 'Move', label: 'Move to any pocket on any page', onPress: onMove });
  push(onToTray && { key: 'tray', glyph: '▭', word: `To ${TRAY_WORD.toLowerCase()}`, label: `Send this card to the ${TRAY_WORD.toLowerCase()}`, onPress: onToTray });
  push(onDuplicate && { key: 'dup', glyph: '⧉', word: 'Duplicate', onPress: onDuplicate });
  push(onPickCopy && { key: 'mine', glyph: hasCopy ? '✓' : '☐', word: 'My card', label: hasCopy ? 'My card: one of yours, click to change' : 'My card: pick which of your copies this is', onPress: onPickCopy });
  push(onStyle && { key: 'style', glyph: '▢', word: art ? 'Backing' : 'Sleeve', onPress: onStyle });
  push(onSplit && { key: 'split', glyph: '⊞', word: 'Split', label: 'Split this picture into its pockets', onPress: onSplit });

  // PLACEMENT. Right of the pocket, else left, else over it (clamped, no pointer).
  const W = POPOVER_W;
  const rightX = anchor.x + anchor.w + SIDE_GAP;
  const leftX = anchor.x - SIDE_GAP - W;
  let side: 'right' | 'left' | 'none';
  let left: number;
  if (rightX + W <= bounds.w - EDGE) {
    side = 'right';
    left = rightX;
  } else if (leftX >= EDGE) {
    side = 'left';
    left = leftX;
  } else {
    side = 'none';
    left = Math.max(EDGE, Math.min(anchor.x + anchor.w / 2 - W / 2, bounds.w - W - EDGE));
  }
  // The pointer aims a little below the pocket's top (its art), or its middle for a short pocket.
  const aimY = anchor.y + Math.min(anchor.h / 2, 70);
  const height = h || 300;
  let top = aimY - 69;
  top = Math.max(EDGE, Math.min(top, bounds.h - height - EDGE));
  const arrowTop = Math.max(16, Math.min(aimY - top - ARROW / 2, height - 16 - ARROW));

  // A guest never loads the catalog, so the card's name is unknown: the pocket heads the card then.
  const titled = !!name || art;
  const title = name || (art ? 'Picture' : `Pocket ${pocketNumber}`);
  const sub = titled
    ? pageNumber ? `Pocket ${pocketNumber} · page ${pageNumber}` : `Pocket ${pocketNumber}`
    : pageNumber ? `Page ${pageNumber}` : '';

  return (
    <View
      ref={popRef}
      collapsable={false}
      testID="pocket-popover"
      onLayout={(e) => {
        const nh = e.nativeEvent.layout.height;
        setH((o) => (Math.abs(o - nh) < 1 ? o : nh));
      }}
      style={[
        styles.pop,
        hint && styles.popHint,
        { left, top, opacity: h ? 1 : 0 },
        // The top layer's host is pointer-events: none; the card opts back in (see SlotToolbar).
        fixed ? ({ position: 'fixed', zIndex: 10, pointerEvents: 'auto' } as unknown as ViewStyle) : null,
      ]}>
      {side !== 'none' ? (
        <View pointerEvents="none" style={[styles.arrow, side === 'right' ? styles.arrowLeftEdge : styles.arrowRightEdge, { top: arrowTop }]} />
      ) : null}
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <Pressable
          onPress={onDeselect}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Clear selection"
          testID="pocket-popover-close"
          style={(state) => [styles.close, hoverOf(state) && styles.closeHover, state.pressed && styles.pressed]}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            accessibilityRole="button"
            accessibilityLabel={a.label ?? a.word}
            testID={`pocket-${a.key}`}
            style={(state) => [
              styles.tile,
              a.hot && styles.tileHot,
              !a.hot && hoverOf(state) && styles.tileHover,
              state.pressed && styles.pressed,
            ]}>
            <Text style={[styles.glyph, a.hot && styles.onAccent]}>{a.glyph}</Text>
            <Text style={[styles.word, a.hot && styles.onAccent]} numberOfLines={1}>
              {a.word}
            </Text>
          </Pressable>
        ))}
      </View>
      {onRemove ? (
        <>
          <View style={styles.rule} />
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={art ? 'Remove picture (Delete key)' : 'Remove card (Delete key)'}
            testID="pocket-remove"
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
            <Text style={styles.removeText}>✕ {art ? 'Remove picture' : 'Remove card'}</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.kbd}>
                <Text style={styles.kbdText}>Delete</Text>
              </View>
            ) : null}
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

/** react-native-web passes `hovered` to a Pressable's style callback; native never does. */
function hoverOf(state: { pressed: boolean }): boolean {
  return !!(state as { hovered?: boolean }).hovered;
}

const GAP = 6;
const styles = StyleSheet.create({
  pop: {
    position: 'absolute',
    width: POPOVER_W,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    boxShadow: '0 18px 48px rgba(0,0,0,0.22)',
    zIndex: 10,
  },
  popHint: { borderWidth: 2, borderColor: Palette.accent },
  arrow: {
    position: 'absolute',
    width: ARROW,
    height: ARROW,
    backgroundColor: Palette.surface,
    transform: [{ rotate: '45deg' }],
  },
  // Its outer half pokes out past the card's border toward the pocket.
  arrowLeftEdge: { left: -ARROW / 2, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: Palette.hairline },
  arrowRightEdge: { right: -ARROW / 2, borderRightWidth: 1, borderTopWidth: 1, borderColor: Palette.hairline },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4, paddingTop: 2, paddingBottom: 10, gap: 8 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: Weight.bold, color: Palette.ink },
  sub: { fontSize: 12, fontWeight: Weight.medium, color: Palette.ink3, marginTop: 1 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.panelAlt },
  closeHover: { backgroundColor: Palette.hairline },
  closeText: { fontSize: 14, fontWeight: Weight.bold, color: Palette.ink2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    // The card's padding (12 each side) and its 1px border, less the two gaps: three to a row.
    width: Math.floor((POPOVER_W - 24 - 2 - GAP * 2) / 3),
    height: 62,
    borderRadius: 12,
    backgroundColor: Palette.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tileHot: { backgroundColor: Palette.accent },
  tileHover: { backgroundColor: Palette.accentSoft, outlineWidth: 2, outlineStyle: 'solid', outlineColor: Palette.accent } as ViewStyle,
  glyph: { fontSize: 18, lineHeight: 20, color: Palette.ink2 },
  word: { fontSize: 12.5, fontWeight: Weight.semibold, color: Palette.ink },
  onAccent: { color: Palette.accentText },
  rule: { height: 1, backgroundColor: Palette.hairline, marginVertical: 10, marginHorizontal: 2 },
  remove: {
    height: 40,
    borderRadius: 10,
    backgroundColor: Palette.dangerBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  removeText: { fontSize: 13.5, fontWeight: Weight.semibold, color: Palette.danger },
  kbd: { borderWidth: 1, borderColor: Palette.danger, borderRadius: 4, paddingHorizontal: 4, opacity: 0.6 },
  kbdText: { fontSize: 9, fontWeight: Weight.semibold, color: Palette.danger },
  pressed: { opacity: 0.6 },
});
