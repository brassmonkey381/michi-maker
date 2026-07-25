/**
 * Discover — search across EVERYONE's public binders. A debounced query hits the `search_binders`
 * RPC (title / description / owner @username, gated on public binder + public profile); an empty
 * query shows the most-liked public binders ("popular"), so the page has life before anyone types.
 * Results render as a responsive grid of the shared BinderThumb; tapping one opens `/binder/[id]`.
 *
 * Guests can browse too (the RPC is granted to anon) — this is discovery, not a personal surface.
 * Reached from the web rail's Explore group and, where the rail is hidden, the Home quick-nav.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinderThumb } from '@/components/binder/BinderThumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  BottomTabInset,
  Breakpoints,
  FontSize,
  MaxContentWidthWide,
  Palette,
  Radius,
  Spacing,
} from '@/constants/theme';
import { searchBinders } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { isSupabaseConfigured } from '@/lib/env';
import { useImageManifest } from '@/lib/catalogConfig';

const GRID_GAP = Spacing.four;
const MIN_TILE = 220;

export default function DiscoverScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DemoBinder[] | null>(null);
  const reqId = useRef(0);

  // Covers resolve straight from card ids, so hydrate the lite image manifest for hashed URLs.
  useImageManifest();

  // Debounced search; the empty-query load (popular) also runs on first mount. When the backend
  // isn't configured we skip entirely — the render shows the "not available" note (results stay
  // null), so there's no synchronous setState here.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      try {
        const rows = await searchBinders(query.trim());
        if (id !== reqId.current) return; // a newer query superseded this one
        setResults(rows);
      } catch {
        if (id === reqId.current) setResults([]);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  // Responsive grid: cap the content column, then fit as many ≥MIN_TILE tiles as the width allows.
  const contentW = Math.min(width, MaxContentWidthWide) - Spacing.four * 2;
  const cols = Math.max(2, Math.floor((contentW + GRID_GAP) / (MIN_TILE + GRID_GAP)));
  const tileW = Math.max(120, Math.floor((contentW - GRID_GAP * (cols - 1)) / cols));

  const q = query.trim();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {railHidden ? (
            <View style={styles.backRow}>
              <Pressable onPress={() => router.push('/')} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ‹ Home
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          <ThemedText type="title" style={styles.h1}>
            Discover binders
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            Search everyone’s public binders by title, description, or creator.
          </ThemedText>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search public binders…"
            placeholderTextColor={Palette.muted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            style={styles.search}
          />

          {!isSupabaseConfigured ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Public binder search isn’t available in this build.
            </ThemedText>
          ) : results === null ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : results.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              {q ? `No public binders match “${q}”.` : 'No public binders to show yet.'}
            </ThemedText>
          ) : (
            <>
              {!q ? (
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                  Popular right now
                </ThemedText>
              ) : null}
              <View style={[styles.grid, { gap: GRID_GAP }]}>
                {results.map((b) => (
                  <BinderThumb key={b.id} binder={b} width={tileW} onPress={() => openBinder(b.id)} />
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidthWide,
    alignSelf: 'center',
  },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.three },
  h1: { marginBottom: Spacing.one },
  sub: { marginBottom: Spacing.three, lineHeight: 20 },
  search: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: FontSize.control,
    color: Palette.ink,
    marginBottom: Spacing.four,
    maxWidth: 520,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: FontSize.sm,
    marginBottom: Spacing.three,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  note: { paddingVertical: Spacing.three },
});
