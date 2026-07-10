/**
 * Binder route (`/binder/[id]`) — the single addressable surface for a binder.
 *
 * Resolves the binder locally first (your own binders + the bundled examples, held in the store):
 *  - your binder → the full editor (`BinderScreen`)
 *  - an example  → the editor in read-only / Duplicate mode
 * Falling back to Supabase for a shared link to someone ELSE's public binder → a read-only viewer.
 * Card images resolve from ids (no catalog needed), so a shared page paints without the catalog.
 */
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { BinderScreen } from '@/components/binder/BinderScreen';
import { BinderPages } from '@/components/binder/BinderPages';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, MaxContentWidth, Palette, Spacing } from '@/constants/theme';
import { fetchBinder } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { isSupabaseConfigured } from '@/lib/env';
import { useBinders } from '@/store/binders';

export default function BinderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useBinders();
  const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const local = id ? store.getBinder(id) : undefined;
  if (local) {
    // Your binder → editable; an example → read-only + Duplicate (BinderScreen handles both).
    return (
      <BinderScreen
        binderId={local.id}
        onClose={goHome}
        onOpenBinder={(bid) => router.replace(`/binder/${bid}`)}
      />
    );
  }

  // Not in the store: either the owner's binders are still loading, or it's a shared link to
  // someone else's public binder — fetch it read-only.
  if (store.loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={[styles.flex, styles.center]} edges={['top']}>
          <ActivityIndicator />
        </SafeAreaView>
      </ThemedView>
    );
  }
  return <PublicViewer id={id} />;
}

type State = { status: 'loading' } | { status: 'ok'; binder: DemoBinder } | { status: 'missing' };

/** Read-only viewer for a shared link (a public binder that isn't in your local store). */
function PublicViewer({ id }: { id?: string }) {
  const { width } = useWindowDimensions();
  const availableWidth = width - 32;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [pageIndex, setPageIndex] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-id-change: reset to loading, then resolve. */
  useEffect(() => {
    if (!isSupabaseConfigured || !id) {
      setState({ status: 'missing' });
      return;
    }
    let active = true;
    setState({ status: 'loading' });
    setPageIndex(0);
    fetchBinder(id)
      .then((binder) => {
        if (active) setState(binder ? { status: 'ok', binder } : { status: 'missing' });
      })
      .catch(() => {
        if (active) setState({ status: 'missing' });
      });
    return () => {
      active = false;
    };
  }, [id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Nice browser-tab title on web.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = state.status === 'ok' ? `${state.binder.title} · michi-maker` : 'michi-maker';
    }
  }, [state]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.topbar}>
          <Link href="/" asChild>
            <Pressable hitSlop={8}>
              <ThemedText type="link" themeColor="textSecondary">‹ michi-maker</ThemedText>
            </Pressable>
          </Link>
        </View>

        {state.status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : state.status === 'missing' ? (
          <View style={styles.center}>
            <ThemedText type="subtitle" style={styles.missTitle}>
              Binder not available
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.missText}>
              This binder is private or no longer exists.
            </ThemedText>
            <Link href="/" asChild>
              <Pressable style={styles.cta} hitSlop={8}>
                <ThemedText type="smallBold" style={styles.ctaText}>
                  Explore michi-maker
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        ) : (
          <Viewer
            binder={state.binder}
            pageIndex={Math.min(pageIndex, state.binder.pages.length - 1)}
            onPage={setPageIndex}
            availableWidth={availableWidth}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function Viewer({
  binder,
  pageIndex,
  onPage,
  availableWidth,
}: {
  binder: DemoBinder;
  pageIndex: number;
  onPage: (i: number) => void;
  availableWidth: number;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ThemedText type="subtitle" style={styles.title}>
        {binder.title}
      </ThemedText>
      {binder.description ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
          {binder.description}
        </ThemedText>
      ) : null}

      {/* The same page-browsing surface the owner sees — read-only here. */}
      <BinderPages
        binder={binder}
        pageIndex={pageIndex}
        onPageChange={onPage}
        availableWidth={availableWidth}
        editable={false}
        renderGrid={({ page, width, captionFields }) => (
          <BinderGrid page={page} width={width} editable={false} captionFields={captionFields} />
        )}
      />

      <Link href="/" asChild>
        <Pressable style={styles.madeWith} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.madeWithText}>
            Made with michi-maker — build your own binder ›
          </ThemedText>
        </Pressable>
      </Link>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  topbar: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  missTitle: { fontSize: FontSize.title, lineHeight: 30, textAlign: 'center' },
  missText: { textAlign: 'center' },
  cta: { marginTop: Spacing.three, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, borderRadius: 999, backgroundColor: Palette.accent },
  ctaText: { color: Palette.accentText },
  scroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
  },
  title: { textAlign: 'center', fontSize: FontSize.nav, lineHeight: 34 },
  description: { textAlign: 'center', marginTop: Spacing.two, maxWidth: 520 },
  madeWith: { marginTop: Spacing.five },
  madeWithText: { textAlign: 'center' },
});
