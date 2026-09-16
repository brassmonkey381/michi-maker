/**
 * Discover — everyone's public binders. Two views share one screen:
 *
 *   • TYPED QUERY — the debounced `search_binders` RPC (title / description / owner @username).
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
import { CONTEST, contestPhase } from '@/data/contest';
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

  // Whether to show the card at the bottom that points at /contest-binders. The contest's own
  // views live there; this page only advertises it while a contest is running.
  const contestOn = contestPhase() !== 'ended' && contestPhase() !== 'upcoming' && isSupabaseConfigured;

  // The default ordering for public binders — see SORTS above for why it is likes and not recency.
  const [sort, setSort] = useState<DiscoverSort>('likes');
  const [others, setOthers] = useState<DemoBinder[] | null>(null);

  // Re-fetches when the sort flips. Contest entries are INCLUDED here: since the contest moved to
  // its own page nothing else on Discover lists them, and leaving them out would hide public
  // binders from the one page that is meant to show every public binder. `others` is cleared to
  // null by the PRESS that changes the sort, so this effect only fetches and never sets state
  // synchronously.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    fetchDiscoverBinders(sort, { excludeAuthor: OFFICIAL_AUTHOR })
      .then((rows) => alive && setOthers(rows))
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
              {/* 1. Every public binder, in the order the reader chooses. */}
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

              {/* 3. The contest, LAST and as one card: the boards and the entry feed live on
                  /contest-binders since 2026-09-15. */}
              {contestOn ? (
                <Pressable
                  onPress={() => router.push('/contest-binders' as Href)}
                  style={({ pressed }) => [styles.contestBox, pressed && styles.dim]}>
                  <View style={styles.contestHead}>
                    <ThemedText type="smallBold">🏆 {CONTEST.name}</ThemedText>
                    <ThemedText type="small" style={styles.contestLink}>
                      See the entries ›
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.contestSub}>
                    {CONTEST.headline}
                  </ThemedText>
                  <Pressable onPress={() => router.push('/contest' as Href)} hitSlop={6}>
                    <ThemedText type="small" style={styles.contestLink}>
                      Prizes & rules ›
                    </ThemedText>
                  </Pressable>
                </Pressable>
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
  dim: { opacity: 0.7 },
});
