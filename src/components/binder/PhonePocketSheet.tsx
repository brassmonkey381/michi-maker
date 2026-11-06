/**
 * A PICKED POCKET'S ACTIONS ON A PHONE (owner, 2026-11-05, from the option-1 mock-up): a sheet
 * that sits on the tool bar instead of a column of buttons over the page. The actions are a
 * uniform grid, five across, two rows, in the order a person reaches for them:
 *
 *   row 1  what the page holds   Fill page · Similar · Colors · Replace · Move
 *   row 2  this card itself      Tray · Duplicate · My card · Sleeve · Remove
 *
 * An art piece has Edit, Backing and Split in place of the card-only verbs; every action that
 * does not apply is simply absent, and the grid closes up. Done (the header) clears the pick.
 * Same callbacks as BinderGrid's SlotToolbar, which stays the desktop's bar.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, Palette, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import type { DemoSlot } from '@/data/binderTypes';

const COLS = 5;

type Action = { key: string; glyph: string; word: string; label?: string; onPress: () => void; hot?: boolean; danger?: boolean };

export function PhonePocketSheet({
  slot,
  name,
  bottom,
  onLayoutHeight,
  hint,
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
  /** The card's name when it is known; the header says "Pocket" otherwise. */
  name?: string | null;
  /** The tool bar's height: the sheet sits on it. */
  bottom: number;
  onLayoutHeight: (h: number) => void;
  /** The one-time hint about this sheet, shown inside it until Got it. */
  hint?: { title: string; body: string; onDone: () => void } | null;
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
  onDeselect: () => void;
}) {
  const art = slot.type === 'artwork';
  const actions: Action[] = [];
  const push = (a: Action | null | undefined) => a && actions.push(a);
  push(onAutoFill && { key: 'fill', glyph: '✦', word: 'Fill page', label: 'Fill page: build the page around this card', onPress: onAutoFill, hot: true });
  push(onSimilar && { key: 'similar', glyph: '≈', word: 'Similar', label: 'Cards like this one', onPress: onSimilar });
  push(onColors && { key: 'colors', glyph: '◐', word: 'Colors', label: 'Cards in this one’s colours', onPress: onColors });
  push(onReplace && { key: 'replace', glyph: '⟳', word: 'Replace', onPress: onReplace });
  push(onEditArt && { key: 'edit', glyph: '✎', word: 'Edit', label: 'Edit this picture: zoom, rotate, flip, cut', onPress: onEditArt });
  push(onMove && { key: 'move', glyph: '⇄', word: 'Move', label: 'Move to any pocket on any page', onPress: onMove });
  push(onToTray && { key: 'tray', glyph: '▭', word: 'Tray', label: 'Send this card to the tray', onPress: onToTray });
  push(onDuplicate && { key: 'dup', glyph: '⧉', word: 'Duplicate', onPress: onDuplicate });
  push(onPickCopy && { key: 'mine', glyph: hasCopy ? '✓' : '☐', word: 'My card', label: hasCopy ? 'My card: one of yours, tap to change' : 'My card: pick which of your copies this is', onPress: onPickCopy });
  push(onStyle && { key: 'style', glyph: '▢', word: art ? 'Backing' : 'Sleeve', onPress: onStyle });
  push(onSplit && { key: 'split', glyph: '⊞', word: 'Split', label: 'Split this picture into its pockets', onPress: onSplit });
  push(onRemove && { key: 'remove', glyph: '✕', word: 'Remove', label: 'Remove from this pocket', onPress: onRemove, danger: true });

  return (
    <View
      style={[styles.sheet, { bottom }]}
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
      testID="phone-pocket-sheet">
      {hint ? (
        <View style={styles.hint} testID="editor-hint">
          <View style={styles.hintText}>
            <Text style={styles.hintTitle}>{hint.title}</Text>
            <Text style={styles.hintBody}>{hint.body}</Text>
          </View>
          <Pressable onPress={hint.onDone} hitSlop={8} accessibilityRole="button" testID="editor-hint-done">
            <Text style={styles.done}>Got it</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {name || (art ? 'Picture' : 'Pocket')}
        </Text>
        <Pressable onPress={onDeselect} hitSlop={8} accessibilityRole="button" accessibilityLabel="Done with this pocket" testID="phone-pocket-done">
          <Text style={styles.done}>Done</Text>
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
            style={({ pressed }) => [styles.cell, a.hot && styles.cellHot, a.danger && styles.cellDanger, pressed && styles.pressed]}>
            <Text style={[styles.glyph, a.hot && styles.glyphHot, a.danger && styles.glyphDanger]}>{a.glyph}</Text>
            <Text style={[styles.word, a.hot && styles.wordHot, a.danger && styles.wordDanger]} numberOfLines={1}>
              {a.word}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const GAP = 6;
const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
    backgroundColor: Palette.surface,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    zIndex: 31,
    ...Shadows.page,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
    padding: Spacing.two,
    borderRadius: Radius.control,
    borderWidth: 2,
    borderColor: Palette.accent,
    backgroundColor: Palette.surface,
  },
  hintText: { flex: 1, minWidth: 0, gap: 2 },
  hintTitle: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.ink },
  hintBody: { fontSize: FontSize.xs, lineHeight: 16, color: Palette.ink2 },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.ink2 },
  done: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.accent, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  // Five across, every cell the same width whatever its word, so the grid reads as one control.
  cell: {
    width: `${100 / COLS}%` as unknown as number,
    // flexBasis carries the width; the gap comes off it so five still fit on one row.
    flexBasis: `calc(${100 / COLS}% - ${(GAP * (COLS - 1)) / COLS}px)` as unknown as number,
    height: 50,
    borderRadius: Radius.control,
    backgroundColor: Palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  cellHot: { backgroundColor: Palette.accent },
  cellDanger: { backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.dangerAlt },
  glyph: { fontSize: FontSize.md, lineHeight: 20, color: Palette.ink },
  glyphHot: { color: Palette.accentText },
  glyphDanger: { color: Palette.dangerAlt },
  word: { fontSize: 11, fontWeight: Weight.semibold, color: Palette.ink2 },
  wordHot: { color: Palette.accentText },
  wordDanger: { color: Palette.dangerAlt },
  pressed: { opacity: 0.6 },
});
