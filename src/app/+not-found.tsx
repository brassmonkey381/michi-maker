/**
 * Branded 404 for any unmatched URL. Expo Router renders this in place of its bare built-in
 * "Unmatched Route" screen. On the web SPA the Vercel catch-all rewrite serves the shell for any
 * path, so this is the client-side terminal state for a mistyped or stale deep link — with a clear
 * path home rather than a dead end.
 */
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { Wordmark } from '@/components/brand/Wordmark';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { flag } from '@/lib/flags';
import { PocketsArt, StatePanel } from 'tcgscan-ui';

/** MIC-045 M3 ('dev'): the 404 as the kit's StatePanel. */
const STATE_PANEL = flag('state-panel');

export default function NotFound() {
  const router = useRouter();
  if (STATE_PANEL) {
    return (
      <PageShell title="Page not found">
        <StatePanel
          art={<PocketsArt badge="?" />}
          title="This page doesn’t exist"
          body="The link may be mistyped or out of date. Head back home and pick up from there."
          primary={{ label: 'Go home', onPress: () => router.replace('/' as Href) }}
          secondary={{ label: 'Discover binders', onPress: () => router.push('/discover' as Href) }}
        />
      </PageShell>
    );
  }
  return (
    <PageShell
      title="Page not found"
      heading="This page doesn’t exist"
      lede="The link may be mistyped or out of date. Head back home and pick up from there.">
      <Pressable
        onPress={() => router.replace('/' as Href)}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
        <ThemedText style={styles.ctaText}>
          Go to <Wordmark /> home
        </ThemedText>
      </Pressable>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  cta: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  ctaText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },
  pressed: { opacity: 0.7 },
});
