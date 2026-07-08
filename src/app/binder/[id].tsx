/**
 * Public, read-only binder viewer — the target of a shared link (`/binder/[id]`).
 *
 * Fetches the binder by id straight from Supabase. RLS returns it to the owner, or to
 * ANYONE (including a signed-out visitor) when it's flagged public — so a shared link
 * opens without an account. Private / missing binders show a friendly not-available state.
 *
 * This is the app's only addressable route beyond home; the owner's editing flow stays a
 * modal on `/`. Card images resolve from their ids (no catalog needed), so a shared page
 * paints without the ~25 MB catalog.
 */
import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { CaptionControls } from '@/components/binder/CaptionControls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, MaxContentWidth, Palette, Spacing } from '@/constants/theme';
import { fetchBinder } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { DEFAULT_CAPTION_FIELDS, type CaptionFieldKey } from '@/data/cardCaption';
import { isSupabaseConfigured } from '@/lib/env';

type State = { status: 'loading' } | { status: 'ok'; binder: DemoBinder } | { status: 'missing' };

export default function PublicBinderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width - 32, 460);
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
            pageWidth={pageWidth}
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
  pageWidth,
}: {
  binder: DemoBinder;
  pageIndex: number;
  onPage: (i: number) => void;
  pageWidth: number;
}) {
  const page = binder.pages[pageIndex];
  const count = binder.pages.length;

  // Card labels: master on/off + selected fields (display order fixed in cardCaption.ts).
  const [labelsOn, setLabelsOn] = useState(false);
  const [labelFields, setLabelFields] = useState<CaptionFieldKey[]>(DEFAULT_CAPTION_FIELDS);
  const toggleLabelField = (key: CaptionFieldKey) =>
    setLabelFields((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

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

      {count > 1 ? (
        <View style={styles.pageNav}>
          <NavArrow label="‹" disabled={pageIndex === 0} onPress={() => onPage(pageIndex - 1)} />
          <ThemedText type="smallBold">
            Page {pageIndex + 1} / {count}
          </ThemedText>
          <NavArrow label="›" disabled={pageIndex >= count - 1} onPress={() => onPage(pageIndex + 1)} />
        </View>
      ) : null}

      {page?.title ? (
        <ThemedText type="smallBold" style={styles.pageTitle}>
          {page.title}
        </ThemedText>
      ) : null}

      <CaptionControls
        enabled={labelsOn}
        onToggle={() => setLabelsOn((v) => !v)}
        fields={labelFields}
        onToggleField={toggleLabelField}
      />

      <View style={styles.pageWrap}>
        <BinderGrid
          page={page}
          width={pageWidth}
          editable={false}
          captionFields={labelsOn ? labelFields : []}
        />
      </View>

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

function NavArrow({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} style={disabled && styles.navDisabled}>
      <ThemedText style={styles.navArrow}>{label}</ThemedText>
    </Pressable>
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
  pageNav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.three },
  navArrow: { fontSize: FontSize.nav, lineHeight: 28, fontWeight: '600' },
  navDisabled: { opacity: 0.3 },
  pageTitle: { marginTop: Spacing.three, textAlign: 'center' },
  pageWrap: { marginTop: Spacing.four },
  madeWith: { marginTop: Spacing.five },
  madeWithText: { textAlign: 'center' },
});
