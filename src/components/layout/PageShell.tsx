/**
 * The narrow prose scaffold every content route shares (pricing, legal, learn) — extracted from
 * the michi-method page's pattern: SafeAreaView (top edge) over a centred, max-width-capped
 * ScrollView with a back-link header row, and the shared SiteFooter at the bottom.
 *
 * On web it also sets the document title and meta description via expo-router/head (SPA-side
 * only; crawler-grade OG meta follows the api/og-* pattern and is a separate concern).
 */
import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SiteFooter } from '@/components/layout/SiteFooter';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, MaxContentWidth, Spacing, Weight } from '@/constants/theme';

export function PageShell({
  title,
  description,
  maxWidth = MaxContentWidth,
  footer = true,
  children,
}: {
  /** Browser tab / SEO title (web only). */
  title?: string;
  /** Meta description (web only). */
  description?: string;
  /** Content column cap; pricing passes MaxContentWidthWide for its card row. */
  maxWidth?: number;
  /** Render the shared SiteFooter after the content. */
  footer?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.push('/'));

  return (
    <ThemedView style={styles.flex}>
      {Platform.OS === 'web' && title ? (
        <Head>
          <title>{`${title} · michi-maker`}</title>
          {description ? <meta name="description" content={description} /> : null}
        </Head>
      ) : null}
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.scroll, { maxWidth }]}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={goBack}
              hitSlop={10}
              accessibilityLabel="Back"
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
              <ThemedText style={styles.backText}>‹ Back</ThemedText>
            </Pressable>
            <Pressable onPress={() => router.push('/')} hitSlop={10}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                michi-maker
              </ThemedText>
            </Pressable>
          </View>
          {children}
          {footer ? <SiteFooter /> : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
  },
  backBtn: { paddingVertical: Spacing.one, paddingRight: Spacing.two },
  backText: { fontSize: FontSize.control, fontWeight: Weight.semibold },
  pressed: { opacity: 0.7 },
});
