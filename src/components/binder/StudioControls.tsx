/**
 * THE STUDIO'S BUTTON VOCABULARY, shared.
 *
 * `Seg` is one cell of a segmented control; `IconBtn` is the compact framing control with a
 * press-and-hold repeat for steps that are deliberately small. Both lived inside SliceStudio.tsx.
 * The cover editor's property panel uses the same two for its size, align and font controls, so
 * the studio and the panel look like one tool rather than two — which is the point of a shared
 * file, not a shared idea.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { FontSize, Palette, Radius, Weight } from '@/constants/theme';

/** One cell of a segmented control (grid presets, fit, whole/sliced, S/M/L/XL). */
export function Seg({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.seg, active && styles.segActive]}>
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** A compact framing control — zoom / rotate / flip / "Just the art" / a stepper's + and −. */
export function IconBtn({
  label,
  onPress,
  disabled = false,
  active = false,
  repeat = false,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  /** Keep firing while held — for steps that are deliberately small. */
  repeat?: boolean;
  /** For the screenshot harnesses: a glyph is not a stable thing to look for. */
  testID?: string;
  accessibilityLabel?: string;
}) {
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => {
    if (delay.current) clearTimeout(delay.current);
    if (tick.current) clearInterval(tick.current);
    delay.current = null;
    tick.current = null;
  }, []);
  // A press that ends off the button, or a component that unmounts mid-hold, must not leave a
  // timer stepping an unmounted control.
  useEffect(() => stop, [stop]);
  const start = useCallback(() => {
    if (!repeat) return;
    stop();
    // A pause first, so a normal tap is one step and not a burst.
    delay.current = setTimeout(() => {
      tick.current = setInterval(onPress, 55);
    }, 280);
  }, [repeat, onPress, stop]);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onPressIn={start}
      onPressOut={stop}
      onHoverOut={stop}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected: active }}
      style={({ pressed }) => [
        styles.iconBtn,
        active && styles.iconBtnActive,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.iconBtnText, active && styles.iconBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** The pill that holds a row of Seg cells. Exported so callers group them the same way. */
export const segGroupStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  backgroundColor: Palette.panel,
  borderRadius: Radius.pill,
  padding: 2,
};

const styles = StyleSheet.create({
  seg: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill },
  segActive: {
    backgroundColor: Palette.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segText: { fontSize: FontSize.label, color: Palette.muted, fontWeight: Weight.medium },
  segTextActive: { color: Palette.ink, fontWeight: Weight.semibold },
  iconBtn: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: Palette.accent },
  iconBtnText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.ink2 },
  iconBtnTextActive: { color: Palette.accentText },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.4 },
});
