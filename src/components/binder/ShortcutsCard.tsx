/**
 * THE SHORTCUTS CARD: eight keys, shown once on a person's first edit, and again on request.
 *
 * Web only, because it is about a keyboard. It floats over the binder's bottom edge, covers no
 * control, and one press of "Got it" retires it on this device (SHORTCUTS_SEEN_KEY). The ⌨ button
 * in the tools row reopens it, so learning them is never a one-shot.
 */
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { shortcutList } from '@/data/keyboardShortcuts';
import { FontSize, Palette, Radius, Shadows, Spacing, Weight } from '@/constants/theme';

function modWord(): 'Ctrl' | '⌘' {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘' : 'Ctrl';
}

export function ShortcutsCard({ onDismiss }: { onDismiss: () => void }) {
  const list = shortcutList(modWord());
  return (
    <View style={styles.card} testID="shortcuts-card" accessibilityRole="summary">
      <View style={styles.head}>
        <Text style={styles.title}>Keyboard shortcuts</Text>
        <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close the shortcuts" testID="shortcuts-dismiss">
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.rows}>
        {list.map((s) => (
          <View key={s.keys} style={styles.row}>
            <View style={styles.keys}>
              {s.keys.split(' ').map((k, i) => (
                <View key={`${k}-${i}`} style={styles.key}>
                  <Text style={styles.keyText}>{k}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.does}>{s.does}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={onDismiss} style={({ pressed }) => [styles.gotIt, pressed && styles.pressed]} accessibilityRole="button" testID="shortcuts-got-it">
        <Text style={styles.gotItText}>Got it</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 300,
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surface,
    ...Shadows.page,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.ink },
  closeGlyph: { fontSize: FontSize.md, color: Palette.ink2, lineHeight: 18 },
  rows: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  keys: { flexDirection: 'row', gap: 3, width: 118, flexWrap: 'wrap' },
  key: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.panel,
  },
  keyText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink, fontVariant: ['tabular-nums'] },
  does: { flex: 1, minWidth: 0, fontSize: FontSize.body, color: Palette.ink2 },
  gotIt: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Palette.accent },
  gotItText: { fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.accentText },
  pressed: { opacity: 0.7 },
});
