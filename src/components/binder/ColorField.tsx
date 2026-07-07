/**
 * Page-background colour field — native fallback.
 *
 * iOS/Android have no built-in colour picker, so this is a #hex text field with a live preview
 * swatch. The web build uses `ColorField.web.tsx`, which renders the OS colour picker instead.
 * Keyed by the caller (per page) so its local text re-initialises when the page changes.
 */

import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function ColorField({ value, onChange }: { value?: string; onChange: (hex: string) => void }) {
  const theme = useTheme();
  const [text, setText] = useState(value ?? '');

  const handleChange = (raw: string) => {
    let next = raw.trim();
    if (next && !next.startsWith('#')) next = `#${next}`;
    setText(next);
    if (HEX_RE.test(next)) onChange(next);
  };

  const preview = HEX_RE.test(text.trim()) ? text.trim() : (value ?? 'transparent');

  return (
    <View style={styles.row}>
      <View style={[styles.preview, { backgroundColor: preview, borderColor: theme.backgroundSelected }]} />
      <TextInput
        value={text}
        onChangeText={handleChange}
        placeholder="#RRGGBB"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  preview: { width: 40, height: 40, borderRadius: 8, borderWidth: 1 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
});
