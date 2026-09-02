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
import { ProfileAvatarButton } from '@/components/people/ProfileAvatarButton';
import { BinderScreen } from '@/components/binder/BinderScreen';
import { BinderPages } from '@/components/binder/BinderPages';
import { LikeButton } from '@/components/binder/LikeButton';
import { ReportSheet } from '@/components/binder/ReportSheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, FontSize, MaxContentWidthWide, Palette, Spacing } from '@/constants/theme';
import { fetchBinder } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { fetchBinderOwner, profileHandle, type PublicProfile } from '@/data/profileRepo';
import { CONTEST } from '@/data/contest';
import { fetchEntry } from '@/data/contestRepo';
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

type State =
  | { status: 'loading' }
  | { status: 'ok'; binder: DemoBinder; contestCapped?: boolean }
  | { status: 'missing' };

/** Read-only viewer for a shared link (a public binder that isn't in your local store). */
function PublicViewer({ id }: { id?: string }) {
  const { width } = useWindowDimensions();
  // Clamp to the scroll shell's usable width (max width minus its padding) — the window can be
  // wider than the shell, and BinderPages sizes the wide-screen spread from this number. On a
  // desktop this now crosses the ≥900 spread breakpoint, so shared binders get the full
  // prev · current · next spread instead of a single page.
  const availableWidth = Math.min(width, MaxContentWidthWide) - Spacing.four * 2;
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
    // A contest ENTRY shows at most the first N public pages (the submission cap). RLS already
    // filters this fetch to public pages; the entry gate + ShareSheet cap public pages at N, and
    // this slice is the backstop for any that slip past (e.g. pages added after entering). The
    // owner's own view (store path above) is uncapped.
    Promise.all([fetchBinder(id), fetchEntry(id).catch(() => null)])
      .then(([binder, entry]) => {
        if (!active) return;
        if (!binder) {
          setState({ status: 'missing' });
          return;
        }
        const capped = Boolean(entry) && binder.pages.length > CONTEST.pageCap;
        setState({
          status: 'ok',
          binder: capped ? { ...binder, pages: binder.pages.slice(0, CONTEST.pageCap) } : binder,
          contestCapped: capped,
        });
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
          <>
            {state.contestCapped ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.capNote}>
                Contest entry, showing the first {CONTEST.pageCap} pages.
              </ThemedText>
            ) : null}
            <Viewer
              binder={state.binder}
              pageIndex={Math.min(pageIndex, state.binder.pages.length - 1)}
              onPage={setPageIndex}
              availableWidth={availableWidth}
            />
          </>
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
  const [needAccount, setNeedAccount] = useState(false);
  const [reporting, setReporting] = useState(false);
  // Where the scroller starts in the window — the one term of the page's height budget that lives
  // outside it. Rounded and only accepted on a real change, so a sub-pixel wobble cannot loop.
  const [viewportTop, setViewportTopRaw] = useState(0);
  const setViewportTop = (y: number) =>
    setViewportTopRaw((cur) => (Math.abs(cur - y) > 2 ? Math.round(y) : cur));
  const router = useRouter();

  // Who made this. A shared binder arrives with no owner attached — a DemoBinder carries pages,
  // not people — so the author is resolved separately and appears when it lands. Deliberately NOT
  // folded into the page's loading state: the binder is the point and should never wait on a
  // byline. A private or missing profile resolves to null and simply shows nothing.
  const [author, setAuthor] = useState<PublicProfile | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !binder.id) return;
    let alive = true;
    fetchBinderOwner(binder.id)
      .then((p) => alive && setAuthor(p))
      .catch(() => {
        /* no byline; the binder still reads fine without one */
      });
    return () => {
      alive = false;
    };
  }, [binder.id]);
  const openAuthor = () => author && router.push(`/u/${profileHandle(author)}` as never);

  return (
    <ScrollView
      // The page's height budget needs to know where this scroller starts. It used to rely on
      // BinderPages' default allowance of 96px, which was a guess about THIS screen made in another
      // file — and this screen stacks a title, an author line, a description and a like row above
      // the page, so the guess was never close.
      onLayout={(e) => setViewportTop(e.nativeEvent.layout.y)}
      contentContainerStyle={styles.scroll}>
      <ThemedText type="subtitle" style={styles.title}>
        {binder.title}
      </ThemedText>
      {author ? (
        <View style={styles.authorRow}>
          <ProfileAvatarButton
            username={author.username}
            avatarUrl={author.avatarUrl}
            size={28}
            onPress={openAuthor}
          />
          <Pressable onPress={openAuthor} hitSlop={6} accessibilityRole="link">
            <ThemedText type="small" themeColor="textSecondary">
              by {author.username ? `@${author.username}` : 'a collector'}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
      {binder.description ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
          {binder.description}
        </ThemedText>
      ) : null}

      <View style={styles.likeRow}>
        <LikeButton binderId={binder.id} onNeedsAccount={() => setNeedAccount(true)} />
      </View>
      {needAccount ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.likeHint}>
          Sign in with an account to like this binder.
        </ThemedText>
      ) : null}

      {/* The same page-browsing surface the owner sees — read-only here. */}
      <BinderPages
        viewportTop={viewportTop}
        binder={binder}
        pageIndex={pageIndex}
        onPageChange={onPage}
        availableWidth={availableWidth}
        editable={false}
        renderGrid={({ page, width, captionFields, decorative }) => (
          <BinderGrid
            page={page}
            width={width}
            editable={false}
            captionFields={captionFields}
            // A page-turn copy of a page already on screen: no fade-in, or it reads as refreshing.
            instantImages={decorative}
          />
        )}
      />

      <Link href="/" asChild>
        <Pressable style={styles.madeWith} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.madeWithText}>
            Made with michi-maker · build your own binder ›
          </ThemedText>
        </Pressable>
      </Link>

      {/* Takedown intake: any viewer can report this public binder (see docs/roadmap/ART-RIGHTS). */}
      <Pressable onPress={() => setReporting(true)} hitSlop={6} style={styles.reportLink}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.reportText}>
          Report this binder
        </ThemedText>
      </Pressable>
      {reporting ? (
        <ReportSheet target={{ binderId: binder.id }} onClose={() => setReporting(false)} />
      ) : null}
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  topbar: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  capNote: { textAlign: 'center', paddingBottom: Spacing.one },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  missTitle: { fontSize: FontSize.title, lineHeight: 30, textAlign: 'center' },
  missText: { textAlign: 'center' },
  cta: { marginTop: Spacing.three, paddingVertical: Spacing.two, paddingHorizontal: Spacing.four, borderRadius: 999, backgroundColor: Palette.accent },
  ctaText: { color: Palette.accentText },
  scroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    // Wide shell so desktop viewers get the prev·current·next spread; prose below caps itself.
    maxWidth: MaxContentWidthWide,
    alignSelf: 'center',
    alignItems: 'center',
  },
  title: { textAlign: 'center', fontFamily: Fonts?.brand, fontSize: FontSize.nav, lineHeight: 34 },
  description: { textAlign: 'center', marginTop: Spacing.two, maxWidth: 520 },
  likeRow: { marginTop: Spacing.three, alignItems: 'center' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  likeHint: { marginTop: Spacing.two, textAlign: 'center' },
  madeWith: { marginTop: Spacing.five },
  madeWithText: { textAlign: 'center' },
  reportLink: { marginTop: Spacing.three },
  reportText: { textAlign: 'center', fontSize: FontSize.sm, textDecorationLine: 'underline' },
});
