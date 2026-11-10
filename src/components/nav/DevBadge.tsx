/**
 * THE DEV BADGE (MIC-017). A small "DEV" pill pinned top-centre while this browser is in dev mode
 * (lib/devMode), so the owner always knows he is looking at the dev version. Tapping it leaves dev
 * mode and reloads the page as everyone sees it. Renders nothing otherwise, and never on native.
 */
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEV_MODE, leaveDevMode } from '@/lib/devMode';

export function DevBadge() {
  const insets = useSafeAreaInsets();
  if (!DEV_MODE || Platform.OS !== 'web') return null;
  return (
    <Pressable
      onPress={leaveDevMode}
      accessibilityRole="button"
      accessibilityLabel="Dev mode is on. Tap to turn it off."
      testID="dev-badge"
      style={[styles.pill, { top: insets.top + 6 }]}>
      <Text style={styles.text}>DEV</Text>
      <Text style={styles.off}>tap to turn off</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    // fixed on web keeps it on screen while the page scrolls
    position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
    alignSelf: 'center',
    left: '50%',
    transform: [{ translateX: '-50%' }],
    zIndex: 10000,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#E8590C',
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
  },
  text: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  off: { color: '#fff', opacity: 0.85, fontSize: 10 },
});
