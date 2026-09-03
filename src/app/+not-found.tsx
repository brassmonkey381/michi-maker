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
import { Fonts, FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

export default function NotFound() {
  const router = useRouter();
  return (
    <PageShell title="Page not found">
      <ThemedText type="subtitle" style={styles.h1}>
        This page doesn’t exist
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        The link may be mistyped or out of date. Head back home and pick up from there.
      </ThemedText>
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
  h1: { fontFamily: Fonts?.brand, marginBottom: Spacing.two },
  lede: { lineHeight: 22, marginBottom: Spacing.four },
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
