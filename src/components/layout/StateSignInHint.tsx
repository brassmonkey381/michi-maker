/**
 * The hint line under a StatePanel's buttons with a Sign in link in it (MIC-045 M3), e.g.
 * "Is this your binder? Sign in to open it." The kit's panel takes text or a node for its hint;
 * this is the node, drawn in the kit's own hint style so the two read as one line.
 */
import { StyleSheet, Text } from 'react-native';
import { FontScaleCap, TypeScale, useKit } from 'tcgscan-ui';

export function StateSignInHint({ before, after, onSignIn }: { before: string; after: string; onSignIn: () => void }) {
  const { colors } = useKit();
  return (
    <Text maxFontSizeMultiplier={FontScaleCap.reading} style={[styles.hint, { color: colors.textSecondary }]}>
      {before}{' '}
      <Text
        onPress={onSignIn}
        role="button"
        accessibilityRole="button"
        style={[styles.link, { color: colors.link }]}
        testID="state-sign-in">
        Sign in
      </Text>{' '}
      {after}
    </Text>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: TypeScale.meta, lineHeight: 18, textAlign: 'center' },
  link: { fontWeight: '700' },
});
