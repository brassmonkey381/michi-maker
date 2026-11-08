/**
 * Discover — everyone's public binders. Two views share one screen:
 *
 *   • TYPED QUERY — the debounced `search_binders` RPC (title / description / page titles / owner @username).
 *   • NO QUERY (the default) — Public binders, ordered by likes or by when they were made public
 *     (the reader picks; likes is the default), then the house account's own reference binders,
 *     which are deliberately last, then one card pointing at the contest.
 *
 * THE CONTEST LIVES ON /contest-binders (owner call, 2026-09-15). Its category boards and entry
 * feed used to sit at the top of this page, above the search box, so everyone who came here to
 * search scrolled past them; and the field had no page of its own to link to. What is left here is
 * the card at the bottom. Contest entries are ordinary public binders again in the shelf above —
 * nothing shows them twice now, so nothing needs to exclude them.
 *
 * Results render as a responsive grid of the shared BinderThumb; tapping one opens `/binder/[id]`.
 * Guests can browse too (every RPC here is granted to anon) — this is discovery, not a personal
 * surface. Reached from the web rail's Explore group and, where the rail is hidden, the Home
 * quick-nav.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AccountButton } from '@/components/auth/AccountButton';
import { BinderCoverGrid } from '@/components/binder/BinderCoverGrid';
import { Seg } from '@/components/binder/inspector/controls';
import { CurateCallout } from '@/components/CurateCallout';
import { ProfileAvatarButton, TILE_AVATAR } from '@/components/people/ProfileAvatarButton';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { CONTEST, contestPhase } from '@/data/contest';
import { discoverHref, shelfFromParam } from '@/data/backLink';
import {
  BottomTabInset,
  FontSize,
  MaxContentWidthWide,
  Palette,
  Radius,
  Spacing,
} from '@/constants/theme';
import {
  fetchDiscoverBinders,
  fetchDiscoverPage,
  OFFICIAL_AUTHOR,
  searchBindersPage,
  type BinderListCursor,
  type DiscoverSort,
} from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { fetchAvatarsByUsername } from '@/data/profileRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useImageManifest } from '@/lib/catalogConfig';


/**
 * THE THREE SHELVES ARE CAROUSELS, ONE SCREENFUL PER SLOT.
 *
 * Contest entries, Public binders and From michi-maker each rendered every row they had, one under
 * the next. Three open-ended grids on one page means the third heading starts below however many
 * binders the first two happened to return — the house shelf was a scroll away on a good week —
 * and a reader looking for the sections has to scroll past the contents to find them.
 *
 * Ten tiles a slot (5 × 2) is a shelf you can take in at a glance, and every heading stays within
 * a screen of the last. 5 rather than the 6 the grid fits at 1440 because a wider tile reads its
 * cover better, and the arithmetic is the same one the grid already does: the column count only
 * falls below 5 when the tiles would go under MIN_TILE.
 */

/**
 * The orderings offered for the "everything else" section. This list is the chip ORDER only — the
 * default lives where the state is initialised (`useState<DiscoverSort>` below), so change it
 * there, not by reordering this.
 *
 * The default is "recently public" (owner, 2026-09-29). It used to be "most liked", on the
 * argument that a first-time visitor should meet the community's best work. What that actually
 * produced was a shelf that barely moves: the same few binders hold the top of a leaderboard, so
 * a reader who comes back a week later sees the page they already saw, and a binder published
 * today has to climb past them to be seen at all. Recency gives every new binder its day at the
 * front and gives returning readers a reason to return. "Most liked" is still one chip away.
 */
const SORTS: { key: DiscoverSort; label: string }[] = [
  { key: 'recent', label: 'Recently public' },
  { key: 'likes', label: 'Most liked' },
];

/** Fewest letters that run a search. See the note where the search fires. */
const MIN_QUERY = 2;

/** The public binders loaded so far, per ordering, kept across this page's unmounts (see `shelfCache` below). */
const shelfCache = new Map<DiscoverSort, { binders: DemoBinder[]; next: BinderListCursor | null; at: number }>();
const SHELF_CACHE_MS = 10 * 60 * 1000;
const keptShelf = (sort: DiscoverSort) => {
  const kept = shelfCache.get(sort);
  return kept && Date.now() - kept.at < SHELF_CACHE_MS ? kept : undefined;
};

/** "Load more": the next page of a list that has one. */
function LoadMore({ busy, onPress, testID }: { busy: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [styles.moreBtn, (pressed || busy) && styles.moreBtnDim]}>
      {busy ? <ActivityIndicator size="small" /> : null}
      <ThemedText type="smallBold">{busy ? 'Loading…' : 'Load more binders'}</ThemedText>
    </Pressable>
  );
}

export default function DiscoverScreen() {
  const router = useRouter();

  // The scroller's own width, which is the window minus the navigation rail. Only accepted on a
  // real change so a sub-pixel wobble cannot loop; set from an event, never from an effect.
  // The way back rides in the address, so it survives a reload and a new tab.
  const openBinder = (id: string) =>
    router.push(`/binder/${id}?back=${encodeURIComponent(returnTo.current)}` as Href);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DemoBinder[] | null>(null);
  const reqId = useRef(0);
  // A PAGE AT A TIME (2026-09-20). Both lists used to stop at 40 with no way past: the 41st public
  // binder existed only for someone who searched for it. Each list now remembers where it left
  // off (`next`, null when finished) and "Load more" asks for the rows after it.
  const [resultsNext, setResultsNext] = useState<BinderListCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState<'results' | 'others' | null>(null);
  /** Append a page, never a binder twice: likes move while someone reads, so a row can recur. */
  const appended = (have: DemoBinder[] | null, more: DemoBinder[]) => {
    const seen = new Set((have ?? []).map((b) => b.id));
    return [...(have ?? []), ...more.filter((b) => !seen.has(b.id))];
  };

  // Whether to show the card at the bottom that points at /contest-binders. The contest's own
  // views live there; this page only advertises it while a contest is running.
  const contestOn = contestPhase() !== 'ended' && contestPhase() !== 'upcoming' && isSupabaseConfigured;

  /**
   * THE SHELF POSITION AND THE ORDERING LIVE IN THE URL.
   *
   * `/discover?sort=likes&shelf=3`. They were held in a module-level Map, which worked and was the
   * wrong shape: nothing showed in the address bar, so a reload or a middle-click into a new tab
   * lost the position, and there was no way to see the state or tell whether it had worked.
   *
   * Both are read ONCE, as the initial state. Re-reading them would fight the reader: `setParams`
   * below rewrites the address as they page, and feeding that back in would make the carousel jump
   * to wherever the address said on the last render.
   */
  const params = useLocalSearchParams<{ sort?: string; shelf?: string }>();
  const [initialShelf] = useState(() => shelfFromParam(params.shelf));

  // The default ordering for public binders — see SORTS above for why it is recency.
  const [sort, setSort] = useState<DiscoverSort>(() =>
    (SORTS.some((s) => s.key === params.sort) ? (params.sort as DiscoverSort) : 'recent'));

  /**
   * The address a binder opened from here should come back to. Kept in a ref, not state: it
   * changes on every swipe and nothing renders from it, so making it state would re-render the
   * whole page for each one.
   */
  const returnTo = useRef(discoverHref(sort, initialShelf));

  // THE LIST SURVIVES A LOOK AT A BINDER (owner, 2026-11-04). This page is unmounted the moment
  // a binder opens (the root layout is a Slot), so without this a return refetched page one and
  // every page that "load more" had added was gone, while the address still asked for shelf
  // seven. The shelf position rides in the address; the pages ride here, per ordering, for a
  // while: a stale like count on the way back is fine, a list that forgot is not.
  const [others, setOthers] = useState<DemoBinder[] | null>(() => keptShelf(sort)?.binders ?? null);
  const [othersNext, setOthersNext] = useState<BinderListCursor | null>(() => keptShelf(sort)?.next ?? null);
  useEffect(() => {
    if (others) shelfCache.set(sort, { binders: others, next: othersNext, at: Date.now() });
  }, [sort, others, othersNext]);

  // Re-fetches when the sort flips. Contest entries are INCLUDED here: since the contest moved to
  // its own page nothing else on Discover lists them, and leaving them out would hide public
  // binders from the one page that is meant to show every public binder. `others` is cleared to
  // null by the PRESS that changes the sort, so this effect only fetches and never sets state
  // synchronously. A fresh cached list (above) skips the fetch.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (keptShelf(sort)) return;
    let alive = true;
    fetchDiscoverPage(sort, { excludeAuthor: OFFICIAL_AUTHOR })
      .then((page) => {
        if (!alive) return;
        setOthers(page.binders);
        setOthersNext(page.next);
      })
      .catch(() => alive && setOthers([]));
    return () => {
      alive = false;
    };
  }, [sort]);

  // Avatars for the people whose binders are on show. Keyed by username because that is the only
  // thing a listed binder knows about its owner (`authorName`), and it is enough: the username is
  // also the profile's address. One query for the whole grid, resolved after the binders land so a
  // slow or failed avatar lookup never delays or blanks the tiles.
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map());
  const authorNames = (others ?? []).map((b) => b.authorName).filter(Boolean) as string[];
  const authorKey = [...new Set(authorNames)].sort().join(',');
  useEffect(() => {
    if (!isSupabaseConfigured || !authorKey) return;
    let alive = true;
    fetchAvatarsByUsername(authorKey.split(','))
      .then((m) => alive && setAvatars(m))
      .catch(() => {
        /* no pictures; the lettered tiles still render */
      });
    return () => {
      alive = false;
    };
  }, [authorKey]);

  // The house account's own binders, kept out of the section above and shown last. Fetched once,
  // not re-fetched on the sort chips: this is a shelf of reference material rather than a ranking,
  // so newest-published is the only order it needs.
  const [house, setHouse] = useState<DemoBinder[] | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    fetchDiscoverBinders('recent', { author: OFFICIAL_AUTHOR, limit: 24 })
      .then((rows) => alive && setHouse(rows))
      .catch(() => alive && setHouse([]));
    return () => {
      alive = false;
    };
  }, []);

  // Covers resolve straight from card ids, so hydrate the lite image manifest for hashed URLs.
  useImageManifest();

  // Debounced search; the empty-query load (popular) also runs on first mount. When the backend
  // isn't configured we skip entirely — the render shows the "not available" note (results stay
  // null), so there's no synchronous setState here.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Bump the request id even when we don't search, so an in-flight query that the user has
    // since cleared cannot land and repaint the grid behind the default sections.
    const id = ++reqId.current;
    // TWO LETTERS OR MORE. One letter matches nearly every title, and the trigram indexes that
    // make this search fast need three characters to narrow anything; two is the compromise
    // that still finds "XY". Below that the page keeps showing its shelves.
    if (query.trim().length < MIN_QUERY) return;
    const handle = setTimeout(async () => {
      try {
        const page = await searchBindersPage(query.trim());
        if (id !== reqId.current) return; // a newer query superseded this one
        setResults(page.binders);
        setResultsNext(page.next);
      } catch {
        if (id === reqId.current) setResults([]);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  // The grids size themselves (BinderCoverGrid measures its own width, MIC-017), so this page
  // no longer measures a frame or counts columns.

  const q = query.trim();
  const searching = q.length >= MIN_QUERY;

  const loadMoreResults = async () => {
    if (!resultsNext || loadingMore) return;
    const id = reqId.current;
    setLoadingMore('results');
    try {
      const page = await searchBindersPage(q, { after: resultsNext });
      if (id !== reqId.current) return; // the query changed while this was in flight
      setResults((have) => appended(have, page.binders));
      setResultsNext(page.next);
    } catch {
      setResultsNext(null);
    } finally {
      setLoadingMore(null);
    }
  };
  const loadMoreOthers = async () => {
    if (!othersNext || loadingMore) return;
    const forSort = sort;
    setLoadingMore('others');
    try {
      const page = await fetchDiscoverPage(forSort, { excludeAuthor: OFFICIAL_AUTHOR, after: othersNext });
      setOthers((have) => appended(have, page.binders));
      setOthersNext(page.next);
    } catch {
      setOthersNext(null);
    } finally {
      setLoadingMore(null);
    }
  };

  return (
    // THE SHARED FRAME (MIC-017, layout only). Discover is a top-level page: no way back. The
    // grid still measures its own width, now from the column instead of the old scroll view.
    <PageShell maxWidth={MaxContentWidthWide} back={false} footer={false} keyboardShouldPersistTaps="handled">
      <View>
          {/* The account button top right, as on My Binders (owner, 2026-10-29): a visitor who
              arrives here from a shared binder has nowhere else to create an account. */}
          <View style={styles.topRow}>
            <View />
            <AccountButton />
          </View>

          <ThemedText type="title" style={styles.h1}>
            Discover Binders
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            Search everyone’s public binders by title, page title, description, or creator.
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
          ) : searching ? (
            results === null ? (
              <View style={styles.center}>
                <ActivityIndicator />
              </View>
            ) : results.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                {`No public binders match “${q}”.`}
              </ThemedText>
            ) : (
              <>
                <BinderCoverGrid binders={results} onOpen={openBinder} minTile={150} minCols={2} maxCols={5} gap={16} testID="discover-results" />
                {resultsNext ? (
                  <LoadMore busy={loadingMore === 'results'} onPress={loadMoreResults} testID="discover-more-results" />
                ) : null}
              </>
            )
          ) : (
            <>
              {/* 1. Every public binder, in the order the reader chooses. */}
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <ThemedText
                    type="smallBold"
                    themeColor="textSecondary"
                    style={styles.sectionLabel}>
                    Public binders
                  </ThemedText>
                </View>
                {/* ONE CONTROL FOR THE ORDER (MIC-017): two 12 pt chips became a 44 pt segmented control. */}
                <Seg
                  tall
                  options={SORTS.map((s) => ({ id: s.key, label: s.label }))}
                  value={sort}
                  onChange={(key) => {
                    if (key === sort) return;
                    // A list seen in the last few minutes comes straight back; the fetch effect skips it.
                    setOthers(keptShelf(key)?.binders ?? null);
                    setOthersNext(keptShelf(key)?.next ?? null);
                    setSort(key);
                  }}
                />
                {others === null ? (
                  <View style={styles.center}>
                    <ActivityIndicator />
                  </View>
                ) : others.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                    No public binders to show yet.
                  </ThemedText>
                ) : (
                  // ONE CONTINUOUS GRID (MIC-017, 2026-11-08): two across on a phone, five on a desk, in
                  // place of the paged shelf with its arrows. Load more still adds the next page.
                  <BinderCoverGrid
                    binders={others}
                    onOpen={openBinder}
                    minTile={150}
                    minCols={2}
                    maxCols={5}
                    gap={16}
                    testID="discover-grid"
                    accessory={(b) =>
                      b.authorName ? (
                        <ProfileAvatarButton
                          username={b.authorName}
                          avatarUrl={avatars.get(b.authorName.toLowerCase())}
                          size={TILE_AVATAR}
                          onPress={() => router.push(`/u/${b.authorName}` as Href)}
                        />
                      ) : null
                    }
                  />
                )}
                {othersNext ? (
                  <LoadMore busy={loadingMore === 'others'} onPress={loadMoreOthers} testID="discover-more-binders" />
                ) : null}
              </View>

              {/* The curator, between the shelves: the people browsing finished binders are the
                  ones who have not heard that theirs can be built from what they own. */}
              <View style={styles.section}>
                <CurateCallout surface="discover" />
              </View>

              {/* 2. The house account's reference binders. Hidden entirely when it has published
                  none, so the heading never sits above an empty shelf. */}
              {house && house.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <ThemedText
                      type="smallBold"
                      themeColor="textSecondary"
                      style={styles.sectionLabel}>
                      From Michi-Maker
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.sectionNote}>
                    Reference binders from the house account: plain card layouts to copy and build
                    on, rather than finished pieces.
                  </ThemedText>
                  <BinderCoverGrid binders={house} onOpen={openBinder} minTile={150} minCols={2} maxCols={5} gap={16} testID="discover-house" />
                </View>
              ) : null}

              {/* 3. The contest, LAST and as one card: the boards and the entry feed live on
                  /contest-binders since 2026-09-15. */}
              {contestOn ? (
                <View style={styles.contestBox}>
                  <View style={styles.contestHead}>
                    <ThemedText type="smallBold">🏆 {CONTEST.name}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.contestSub}>
                    {CONTEST.headline}
                  </ThemedText>
                  {/* Two SIBLING links, not a card-wide Pressable with a link inside it: a nested
                      Pressable's tap is swallowed by the outer one on web. */}
                  <View style={styles.contestLinks}>
                    <Pressable
                      onPress={() => router.push('/contest-binders' as Href)}
                      hitSlop={6}
                      style={({ pressed }) => [pressed && styles.dim]}>
                      <ThemedText type="small" style={styles.contestLink}>
                        See the entries ›
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => router.push('/contest' as Href)}
                      hitSlop={6}
                      style={({ pressed }) => [pressed && styles.dim]}>
                      <ThemedText type="small" style={styles.contestLink}>
                        Prizes & rules ›
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          )}
      </View>
      <View style={styles.shellTail} />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  // The old scroll view's bottom room, for the phone's menu button.
  shellTail: { height: BottomTabInset + Spacing.four },
  h1: { marginBottom: Spacing.one },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
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
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, fontSize: FontSize.sm },
  section: { marginBottom: Spacing.five },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  sectionNote: { lineHeight: 18, marginTop: -Spacing.two, marginBottom: Spacing.three },
  sortRow: { flexDirection: 'row', gap: Spacing.one },
  sortChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.surface,
  },
  sortChipActive: { borderColor: Palette.accent, backgroundColor: Palette.accent },
  sortChipText: { fontSize: 12 },
  sortChipTextActive: { color: Palette.accentText },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // A carousel page is exactly as tall as its rows: `alignContent` stops a short last page (one
  // row, or a partial one) from spreading its tiles down the height the tallest page set.
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  moreBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
  },
  moreBtnDim: { opacity: 0.6 },
  note: { paddingVertical: Spacing.three },
  contestBox: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
    marginBottom: Spacing.four,
  },
  contestHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  contestLink: { color: Palette.accent, fontWeight: '600' },
  contestLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four, marginTop: Spacing.one },
  contestSub: { lineHeight: 18 },
  dim: { opacity: 0.7 },
});
