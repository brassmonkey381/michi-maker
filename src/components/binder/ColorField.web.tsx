/**
 * Page-background colour field — web.
 *
 * Renders the browser/OS-native colour picker (`<input type="color">`). React Native Web renders
 * to the DOM, so a raw DOM `<input>` composes fine inside the RN tree here. Keyed by the caller
 * (per page) so its initial value re-seeds when the page changes; picker drags are debounced so
 * they don't spam the backend with writes.
 */

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';

const DEFAULT = Palette.white;
const toHex6 = (value?: string) =>
  value && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : DEFAULT;

export function ColorField({ value, onChange }: { value?: string; onChange: (hex: string) => void }) {
  const [val, setVal] = useState(() => toHex6(value));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending debounce on unmount.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handle = (next: string) => {
    setVal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 200);
  };

  return (
    <View style={styles.row}>
      <input
        type="color"
        value={val}
        onChange={(e) => handle(e.currentTarget.value)}
        aria-label="Page background colour"
        style={inputStyle}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {val.toUpperCase()}
      </ThemedText>
    </View>
  );
}

const inputStyle = {
  width: 48,
  height: 40,
  padding: 0,
  border: 'none',
  background: 'transparent',
  borderRadius: Radius.control,
  cursor: 'pointer',
} as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
