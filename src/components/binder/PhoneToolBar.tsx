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
 *   Settings everything else: this page's tools (redo, your art, send, delete) and how the
 *            binder looks, in one sheet (owner, 2026-11-05: "replace More with Settings").
 *
 * No "+ Page" here: a turn past the last page grows the binder (BinderPages' step), as long as
 * that page holds something.
 */
import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  onSettings,
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
  onSettings: () => void;
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
      <Tab glyph="⚙" word="Settings" label="Settings: this page's tools and how the binder looks" onPress={onSettings} testID="binder-settings-btn" />
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
});
