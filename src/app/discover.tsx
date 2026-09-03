/**
 * Discover — everyone's public binders. Three views share one screen:
 *
 *   • TYPED QUERY — the debounced `search_binders` RPC (title / description / owner @username).
 *   • A CONTEST CATEGORY CHIP — that category's entries, ranked by votes.
 *   • NEITHER (the default) — three stacked sections: a feed of every contest entry, newest entry
 *     first; then Public binders, everything that is not an entry, ordered by likes or by when it
 *     was made public (the reader picks; likes is the default); then the house account's own
 *     reference binders, which are deliberately last.
 *
 * This page was once a single grid of the most-liked binders, which is a leaderboard rather than a
 * discovery surface: the same binders hold the top and something published today is invisible
 * until it earns votes. Splitting the contest entries into their own feed is what fixed that —
 * newly published work has a section of its own to appear in — which is why the main grid can
 * default to likes without swallowing everything new. "Recently public" is one tap away.
 *
 * Results render as a responsive grid of the shared BinderThumb; tapping one opens `/binder/[id]`.
 * Guests can browse too (every RPC here is granted to anon) — this is discovery, not a personal
 * surface. Reached from the web rail's Explore group and, where the rail is hidden, the Home
 * quick-nav.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { CurateCallout } from '@/components/CurateCallout';
import { PagedCarousel } from '@/components/PagedCarousel';
import { ProfileAvatarButton, TILE_AVATAR } from '@/components/people/ProfileAvatarButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CATEGORIES, CONTEST, contestPhase, type ContestCategory } from '@/data/contest';
import { FinalsVoteButton } from '@/components/contest/FinalsVoteButton';
import {
  fetchContestEntryFeed,
  fetchContestLeaderboard,
  fetchFinalsLeaderboard,
  fetchMyFinalsVotes,
  type FeedEntry,
} from '@/data/contestRepo';
import {
  BottomTabInset,
  Breakpoints,
  FontSize,
  MaxContentWidthWide,
  Palette,
  Radius,
  Spacing,
} from '@/constants/theme';
import {
  fetchDiscoverBinders,
  OFFICIAL_AUTHOR,
  searchBinders,
  type DiscoverSort,
} from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { fetchAvatarsByUsername } from '@/data/profileRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';
import { useImageManifest } from '@/lib/catalogConfig';

const GRID_GAP = Spacing.four;
const MIN_TILE = 220;

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
const SHELF_COLS = 5;
const SHELF_ROWS = 2;

/**
 * Slice `items` into carousel pages of `perPage`, each a wrapped grid of `tile(item)`.
 *
 * The tile callback returns a keyed element (the caller knows the id); the page `View` is keyed by
 * its start index, which is stable for a given list and ordering.
 */
function shelfPages<T>(items: T[], perPage: number, tile: (item: T) => ReactNode): ReactNode[] {
  const pages: ReactNode[] = [];
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(
      <View key={i} style={[styles.grid, styles.shelfPage, { gap: GRID_GAP }]}>
        {items.slice(i, i + perPage).map(tile)}
      </View>,
    );
  }
  return pages;
}

/** Category slug to label, so a feed tile can say which category it was entered in. */
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.label]),
);

/**
 * The orderings offered for the "everything else" section. This list is the chip ORDER only — the
 * default lives where the state is initialised (`useState<DiscoverSort>` below), so change it
 * there, not by reordering this.
 *
 * The default is "most liked": someone arriving at /discover for the first time should meet the
 * binders the community rated highest, not whatever happened to go public most recently. The cost
 * is real and is what this list used to be ordered around — a binder published today has to earn
 * its way up a leaderboard the same few binders hold — which is what the "Recently public" chip
 * is still here for.
 */
const SORTS: { key: DiscoverSort; label: string }[] = [
  { key: 'recent', label: 'Recently public' },
  { key: 'likes', label: 'Most liked' },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DemoBinder[] | null>(null);
  const reqId = useRef(0);

  // Contest leaderboards — a selected category chip swaps the grid to that category's
  // vote-ranked entries. Typing a search clears the selection.
  // Voting needs a real account, and nobody votes for their own binder — the server refuses both,
  // and the pill says so up front by being disabled rather than by failing on the tap.
  const { isSignedIn, profile } = useAuth();
  const myUsername = profile?.username?.toLowerCase();

  // The strip runs through BOTH rounds; what it lists changes. In the Final the boards are the
  // frozen finalists ranked by stage-2 votes, not the open field ranked by likes.
  const phase = contestPhase();
  const isFinals = phase === 'finals';
  const contestOn = (phase === 'open' || isFinals) && isSupabaseConfigured;
  const [contestCat, setContestCat] = useState<ContestCategory | null>(null);
  const [board, setBoard] = useState<DemoBinder[] | null>(null);
  const boardReq = useRef(0);
  // The board is reset to null (spinner) where contestCat is SET (the chip press), so this
  // effect only fetches — no synchronous setState in the effect body.
  useEffect(() => {
    if (!contestCat) return;
    const id = ++boardReq.current;
    (isFinals ? fetchFinalsLeaderboard(contestCat) : fetchContestLeaderboard(contestCat))
      .then((rows) => {
        if (id === boardReq.current) setBoard(rows);
      })
      .catch(() => {
        if (id === boardReq.current) setBoard([]);
      });
  }, [contestCat, isFinals]);

  // WHICH FINALISTS THIS ACCOUNT HAS VOTED FOR. Held here rather than per tile so a binder that
  // appears on both the category board and the all-categories shelf agrees with itself, and so a
  // vote cast on one updates the other without a refetch.
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [voteError, setVoteError] = useState<string | null>(null);
  useEffect(() => {
    if (!isFinals || !isSupabaseConfigured) return;
    let alive = true;
    fetchMyFinalsVotes()
      .then((v) => alive && setMyVotes(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isFinals]);

  // Optimistic vote toggle: the set and the displayed count move together, and FinalsVoteButton
  // calls this a second time with the old value if the server refuses.
  const [voteDelta, setVoteDelta] = useState<Map<string, number>>(new Map());
  const onVoteChange = (binderId: string, voted: boolean) => {
    setVoteError(null);
    setMyVotes((prev) => {
      const next = new Set(prev);
      if (voted) next.add(binderId);
      else next.delete(binderId);
      return next;
    });
    setVoteDelta((prev) => {
      const next = new Map(prev);
      next.set(binderId, (next.get(binderId) ?? 0) + (voted ? 1 : -1));
      return next;
    });
  };
  const voteCount = (b: DemoBinder) => Math.max(0, (b.likeCount ?? 0) + (voteDelta.get(b.id) ?? 0));

  /** The vote pill for a finalist tile, or the plain heart count outside the Final. */
  const finalsAccessory = (b: DemoBinder) => (
    <FinalsVoteButton
      binderId={b.id}
      voted={myVotes.has(b.id)}
      votes={voteCount(b)}
      disabled={!isSignedIn || (!!myUsername && b.authorName?.toLowerCase() === myUsername)}
      onChange={onVoteChange}
      onError={setVoteError}
    />
  );

  // The two default sections, shown when nobody has typed a query or picked a category.
  //
  //   1. the entry feed — every public contest entry, newest entry first
  //   2. everything else — public binders that are NOT entries, by publish date or by likes
  //
  // Kept as separate fetches rather than one: they answer different questions, the feed is
  // contest-scoped and disappears when the contest ends, and a failure in one should not blank
  // the other.
  const [feed, setFeed] = useState<FeedEntry[] | null>(null);
  // The default ordering for public binders — see SORTS above for why it is likes and not recency.
  const [sort, setSort] = useState<DiscoverSort>('likes');
  const [others, setOthers] = useState<DemoBinder[] | null>(null);

  useEffect(() => {
    if (!contestOn) return;
    let alive = true;
    // In the Final the shelf is the finalists themselves, every category together, ranked by
    // stage-2 votes. The entry feed it replaces was ordered by ENTRY TIME, which stops meaning
    // anything the moment the field is frozen.
    const load = isFinals
      ? fetchFinalsLeaderboard(null).then((binders) =>
          binders.map((b) => ({ binder: b, category: 'aesthetic' as ContestCategory, enteredAt: '' })),
        )
      : fetchContestEntryFeed();
    load.then((rows) => alive && setFeed(rows)).catch(() => alive && setFeed([]));
    return () => {
      alive = false;
    };
  }, [contestOn, isFinals]);

  // Re-fetches when the sort flips. The contest id is passed so entries are left out of this
  // section: they are already the feed above, and showing them twice makes the page look shorter
  // than it is. Like the leaderboard above, `others` is cleared to null by the PRESS that changes
  // the sort, so this effect only fetches and never sets state synchronously.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    fetchDiscoverBinders(sort, {
      excludeContest: contestOn ? CONTEST.id : undefined,
      excludeAuthor: OFFICIAL_AUTHOR,
    })
      .then((rows) => alive && setOthers(rows))
      .catch(() => alive && setOthers([]));
    return () => {
      alive = false;
    };
  }, [sort, contestOn]);

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
    if (!query.trim()) return;
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
  // Search results and a contest leaderboard stay plain grids — they are answers to a question the
  // reader asked, so they run as long as they need to.
  const contentW = Math.min(width, MaxContentWidthWide) - Spacing.four * 2;
  const cols = Math.max(2, Math.floor((contentW + GRID_GAP) / (MIN_TILE + GRID_GAP)));
  const tileW = Math.max(120, Math.floor((contentW - GRID_GAP * (cols - 1)) / cols));
  // The shelves cap at SHELF_COLS and take the width that frees as extra tile, so a slot is always
  // a whole number of columns wide and a page never half-shows an eleventh binder.
  const shelfCols = Math.min(SHELF_COLS, cols);
  const shelfTileW = Math.max(120, Math.floor((contentW - GRID_GAP * (shelfCols - 1)) / shelfCols));
  const perShelf = shelfCols * SHELF_ROWS;

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
            Discover Binders
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            Search everyone’s public binders by title, description, or creator.
          </ThemedText>

          {/* Contest strip — category leaderboards while the contest runs. */}
          {contestOn ? (
            <View style={styles.contestBox}>
              <View style={styles.contestHead}>
                <ThemedText type="smallBold">🏆 {CONTEST.name}</ThemedText>
                <Pressable onPress={() => router.push('/contest' as Href)} hitSlop={6}>
                  <ThemedText type="small" style={styles.contestLink}>
                    Prizes & rules ›
                  </ThemedText>
                </Pressable>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.contestSub}>
                {isFinals
                  ? `The Final: the top ${CONTEST.finalistsPerCategory} of each category, locked as they qualified and back to zero votes. Tap a category to see its finalists.`
                  : `${CONTEST.headline} Tap a category to see its entries, ranked by votes.`}
              </ThemedText>
              {voteError ? (
                <ThemedText type="small" style={styles.voteError}>
                  {voteError}
                </ThemedText>
              ) : null}
              <View style={styles.contestChips}>
                {CATEGORIES.map((c) => {
                  const active = contestCat === c.slug;
                  return (
                    <Pressable
                      key={c.slug}
                      onPress={() => {
                        setBoard(null);
                        setContestCat(active ? null : c.slug);
                      }}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={[styles.contestChip, active && styles.contestChipActive]}
                      hitSlop={2}>
                      <ThemedText
                        type="small"
                        style={[styles.contestChipText, active && styles.contestChipTextActive]}>
                        {c.flagship ? '★ ' : ''}
                        {c.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              if (t.trim()) setContestCat(null);
            }}
            placeholder="Search public binders…"
            placeholderTextColor={Palette.muted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            style={styles.search}
          />

          {contestCat ? (
            board === null ? (
              <View style={styles.center}>
                <ActivityIndicator />
              </View>
            ) : board.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                No entries in this category yet, yours could be first! Make a binder public, then
                enter it from the Share sheet.
              </ThemedText>
            ) : (
              <View style={[styles.grid, { gap: GRID_GAP }]}>
                {board.map((b) => (
                  <BinderThumb
                    key={b.id}
                    binder={b}
                    width={tileW}
                    onPress={() => openBinder(b.id)}
                    accessory={
                      isFinals ? (
                        finalsAccessory(b)
                      ) : (
                        <ThemedText type="small" themeColor="textSecondary">
                          ♥ {b.likeCount ?? 0}
                        </ThemedText>
                      )
                    }
                  />
                ))}
              </View>
            )
          ) : !isSupabaseConfigured ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              Public binder search isn’t available in this build.
            </ThemedText>
          ) : q ? (
            results === null ? (
              <View style={styles.center}>
                <ActivityIndicator />
              </View>
            ) : results.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                {`No public binders match “${q}”.`}
              </ThemedText>
            ) : (
              <View style={[styles.grid, { gap: GRID_GAP }]}>
                {results.map((b) => (
                  <BinderThumb key={b.id} binder={b} width={tileW} onPress={() => openBinder(b.id)} />
                ))}
              </View>
            )
          ) : (
            <>
              {/* 1. Every entry in the running contest, newest first. */}
              {contestOn && feed && feed.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <ThemedText
                      type="smallBold"
                      themeColor="textSecondary"
                      style={styles.sectionLabel}>
                      {isFinals ? 'The Final' : 'Contest entries'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {isFinals ? `${feed.length} finalists` : `${feed.length} entered`}
                    </ThemedText>
                  </View>
                  <PagedCarousel
                    width={contentW}
                    prevLabel="Previous entries"
                    nextLabel="More entries"
                    pages={shelfPages(feed, perShelf, (e) => (
                      <BinderThumb
                        key={e.binder.id}
                        binder={e.binder}
                        width={shelfTileW}
                        onPress={() => openBinder(e.binder.id)}
                        accessory={
                          isFinals ? (
                            finalsAccessory(e.binder)
                          ) : (
                            <ThemedText type="small" themeColor="textSecondary">
                              {CATEGORY_LABEL[e.category] ?? e.category} · ♥{' '}
                              {e.binder.likeCount ?? 0}
                            </ThemedText>
                          )
                        }
                      />
                    ))}
                  />
                </View>
              ) : null}

              {/* 2. Everything that is not an entry, in the order the reader chooses. */}
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <ThemedText
                    type="smallBold"
                    themeColor="textSecondary"
                    style={styles.sectionLabel}>
                    Public binders
                  </ThemedText>
                  <View style={styles.sortRow}>
                    {SORTS.map((s) => {
                      const active = sort === s.key;
                      return (
                        <Pressable
                          key={s.key}
                          onPress={() => {
                            if (active) return;
                            setOthers(null);
                            setSort(s.key);
                          }}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: active }}
                          style={[styles.sortChip, active && styles.sortChipActive]}
                          hitSlop={2}>
                          <ThemedText
                            type="small"
                            style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                            {s.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                {others === null ? (
                  <View style={styles.center}>
                    <ActivityIndicator />
                  </View>
                ) : others.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                    No public binders to show yet.
                  </ThemedText>
                ) : (
                  <PagedCarousel
                    width={contentW}
                    prevLabel="Previous binders"
                    nextLabel="More binders"
                    pages={shelfPages(others, perShelf, (b) => (
                      <BinderThumb
                        key={b.id}
                        binder={b}
                        width={shelfTileW}
                        onPress={() => openBinder(b.id)}
                        accessory={
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
                    ))}
                  />
                )}
              </View>

              {/* The curator, between the shelves: the people browsing finished binders are the
                  ones who have not heard that theirs can be built from what they own. */}
              <View style={styles.section}>
                <CurateCallout surface="discover" />
              </View>

              {/* 3. The house account's reference binders, last. Hidden entirely when it has
                  published none, so the heading never sits above an empty shelf. */}
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
                  <PagedCarousel
                    width={contentW}
                    prevLabel="Previous reference binders"
                    nextLabel="More reference binders"
                    pages={shelfPages(house, perShelf, (b) => (
                      <BinderThumb
                        key={b.id}
                        binder={b}
                        width={shelfTileW}
                        onPress={() => openBinder(b.id)}
                      />
                    ))}
                  />
                </View>
              ) : null}
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
  voteError: { color: Palette.dangerAlt, marginTop: Spacing.one },
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
  shelfPage: { alignContent: 'flex-start' },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
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
  contestSub: { lineHeight: 18 },
  contestChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  contestChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.surface,
  },
  contestChipActive: { borderColor: Palette.accent, backgroundColor: Palette.accent },
  contestChipText: { fontSize: 12 },
  contestChipTextActive: { color: Palette.accentText },
});
