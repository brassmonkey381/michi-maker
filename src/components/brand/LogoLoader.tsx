/**
 * A branded loading state: the animated michi mark filling itself in, over an optional label.
 * Use it for the genuinely LONG waits (the ~25 MB catalog parse, building a binder, generating
 * a print PDF) — the places a plain spinner sits for a few seconds. Quick, inline "working"
 * indicators (a button mid-tap) should stay a small ActivityIndicator; a logo doesn't belong
 * on a button.
 *
 * `variant`: 'loading' (steady, rhythmic — data loads) or 'thinking' (quick, restless —
 * active composition). See AnimatedLogoMark.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AnimatedLogoMark } from '@/components/brand/AnimatedLogoMark';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function LogoLoader({
  label,
  variant = 'loading',
  size = 56,
  style,
}: {
  label?: string;
  variant?: 'loading' | 'thinking';
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <AnimatedLogoMark size={size} variant={variant} />
      {label ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.three },
  label: { textAlign: 'center' },
});
