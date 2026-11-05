/**
 * THE PHONE EDITOR'S TOOL BAR (owner, 2026-11-05, picking option C from the phone mock-ups): one
 * row at the bottom of the screen, in thumb reach, with the next action raised in the middle.
 * The header above it drops to one row, so the page gets the height the old tool rows took.
 *
 *   Add      opens the card browser on the first empty pocket of this page. Cards and your own
 *            art both go in through that one sheet (owner: "combine Art and Add a card").
 *   Select   multi-select, the way Similar is searched over one or several cards.
 *   Complete the raised one: fills the empty pockets from what the page holds.
 *   Arrange  the cards this page has, seated several ways.
 *   More     redo, your art tray, send or delete the page, view settings.
 *
 * No "+ Page" here: a turn past the last page grows the binder (BinderPages' step), as long as
 * that page holds something.
 */
import { forwardRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontSize, Palette, Radius, Shadows, Weight } from '@/constants/theme';

export function PhoneToolBar({
  onAdd,
  onSelect,
  selectOn,
  onComplete,
  completeDisabled,
  completeRef,
  onArrange,
  onMore,
  onLayoutHeight,
}: {
  onAdd: () => void;
  onSelect: () => void;
  selectOn: boolean;
  onComplete: () => void;
  completeDisabled: boolean;
  /** The seeded walkthrough measures Complete through this (BinderScreen's completeRef). */
  completeRef: React.RefObject<View | null>;
  onArrange: () => void;
  onMore: () => void;
  onLayoutHeight: (h: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
      testID="phone-tool-bar">
      <Tab glyph="＋" word="Add" label="Add a card or a picture to this page" onPress={onAdd} testID="phone-tab-add" />
      <Tab glyph="☑" word="Select" label={selectOn ? 'Stop selecting' : 'Select several pockets'} on={selectOn} onPress={onSelect} testID="phone-tab-select" />
      {/* Wrapped so the walkthrough can measure it; collapsable={false} keeps the wrapper real on Android. */}
      <View ref={completeRef} collapsable={false} style={styles.raisedWrap}>
        <Pressable
          onPress={onComplete}
          disabled={completeDisabled}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ disabled: completeDisabled }}
          accessibilityLabel="Complete this page: fill the empty pockets from the cards already here"
          testID="tool-complete"
          style={({ pressed }) => [styles.raised, completeDisabled && styles.raisedOff, pressed && !completeDisabled && styles.pressed]}>
          <Text style={styles.raisedGlyph}>✦</Text>
        </Pressable>
        <Text style={[styles.word, styles.wordHot]}>Complete</Text>
      </View>
      <Tab glyph="☷" word="Arrange" label="Arrange the cards on this page" onPress={onArrange} testID="tool-arrange" />
      <Tab glyph="⋯" word="More" label="More: redo, your art, this page, settings" onPress={onMore} testID="phone-tab-more" />
    </View>
  );
}

const Tab = forwardRef<View, { glyph: string; word: string; label: string; on?: boolean; onPress: () => void; testID: string }>(function Tab(
  { glyph, word, label, on = false, onPress, testID },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      <View style={[styles.icon, on && styles.iconOn]}>
        <Text style={[styles.glyph, on && styles.glyphOn]}>{glyph}</Text>
      </View>
      <Text style={[styles.word, on && styles.wordHot]}>{word}</Text>
    </Pressable>
  );
});

/** What "More" holds: one row per action, the destructive one last and red. */
export function PhoneMoreSheet({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: { key: string; label: string; glyph: string; onPress: () => void; disabled?: boolean; danger?: boolean }[];
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]} testID="phone-more-sheet">
        <View style={styles.grab} />
        {items.map((it) => (
          <Pressable
            key={it.key}
            onPress={() => {
              onClose();
              it.onPress();
            }}
            disabled={it.disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: it.disabled }}
            testID={`phone-more-${it.key}`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed, it.disabled && styles.rowOff]}>
            <Text style={[styles.rowGlyph, it.danger && styles.danger]}>{it.glyph}</Text>
            <Text style={[styles.rowText, it.danger && styles.danger]}>{it.label}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingTop: 6,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.surface,
    zIndex: 30,
  },
  tab: { alignItems: 'center', gap: 2, minWidth: 56, paddingVertical: 2 },
  icon: { width: 30, height: 30, borderRadius: Radius.control, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconOn: { backgroundColor: Palette.accent },
  glyph: { fontSize: FontSize.md, lineHeight: 20, color: Palette.ink },
  glyphOn: { color: Palette.accentText },
  word: { fontSize: FontSize.xs, fontWeight: Weight.semibold, color: Palette.ink2 },
  wordHot: { color: Palette.accent },
  raisedWrap: { alignItems: 'center', gap: 2, minWidth: 64, marginTop: -18 },
  raised: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.page,
  },
  raisedOff: { opacity: 0.35 },
  raisedGlyph: { fontSize: 24, lineHeight: 28, color: Palette.accentText },
  pressed: { opacity: 0.6 },
  scrim: { flex: 1, backgroundColor: 'rgba(20, 18, 24, 0.4)' },
  sheet: {
    backgroundColor: Palette.surface,
    borderTopLeftRadius: Radius.panel,
    borderTopRightRadius: Radius.panel,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: Palette.hairlineStrong, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 6 },
  rowOff: { opacity: 0.35 },
  rowGlyph: { width: 24, textAlign: 'center', fontSize: FontSize.md, color: Palette.ink },
  rowText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.ink },
  danger: { color: Palette.dangerAlt },
});
