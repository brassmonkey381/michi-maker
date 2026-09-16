/**
 * Contest binders — every entry in the running contest, and the category leaderboards.
 *
 * Split out of /discover on 2026-09-15 (owner call). Discover was carrying three jobs: search, the
 * contest strip with its category boards, and the shelves of public binders. The contest half is the
 * one with its own audience — people who came to see the field or to vote — and on Discover it sat
 * above the search box, so everyone else scrolled past it. Here it gets the whole page, and Discover
 * keeps one card at the bottom pointing at it.
 *
 * Two views:
 *   • NO CATEGORY (the default) — every entry, newest entry first. In the Final this becomes the
 *     finalists, all categories together, ranked by stage-2 votes.
 *   • A CATEGORY CHIP — that category's entries ranked by votes, or its finalists in the Final.
 *
 * Both render the shared BinderThumb in a plain responsive grid (no carousel): this page IS the
 * field, so it runs as long as it needs to. Vote state lives here rather than per tile, so a binder
 * that appears on two views agrees with itself and a vote cast on one updates the other.
 *
 * The rules, prizes and Hall of Fame stay on /contest.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinderThumb } from '@/components/binder/BinderThumb';
import { FinalsVoteButton } from '@/components/contest/FinalsVoteButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  BottomTabInset,
  Breakpoints,
  MaxContentWidthWide,
  Palette,
  Radius,
  Spacing,
} from '@/constants/theme';
import { CATEGORIES, CONTEST, contestPhase, type ContestCategory } from '@/data/contest';
import {
  fetchContestEntryFeed,
  fetchContestLeaderboard,
  fetchFinalsLeaderboard,
  fetchMyFinalsVotes,
  type FeedEntry,
} from '@/data/contestRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { isSupabaseConfigured } from '@/lib/env';
import { useImageManifest } from '@/lib/catalogConfig';
import { useAuth } from '@/store/auth';

const GRID_GAP = Spacing.four;
const MIN_TILE = 220;

/** Category slug to label, so a feed tile can say which category it was entered in. */
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.label]),
);

export default function ContestBindersScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const openBinder = (id: string) => router.push(`/binder/${id}`);

  const { isSignedIn, profile } = useAuth();
  const myUsername = profile?.username?.toLowerCase();

  // The page runs through BOTH rounds; what it lists changes. In the Final the boards are the frozen
  // finalists ranked by stage-2 votes, not the open field ranked by likes.
  const phase = contestPhase();
  const isFinals = phase === 'finals';
  const contestOn = (phase === 'open' || isFinals) && isSupabaseConfigured;

  const [contestCat, setContestCat] = useState<ContestCategory | null>(null);
  const [board, setBoard] = useState<DemoBinder[] | null>(null);
  const boardReq = useRef(0);
  // The board is reset to null (spinner) where contestCat is SET (the chip press), so this effect
  // only fetches — no synchronous setState in the effect body.
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

  // Every entry, newest first; in the Final, the finalists ranked by stage-2 votes.
  const [feed, setFeed] = useState<FeedEntry[] | null>(null);
  useEffect(() => {
    if (!contestOn) return;
    let alive = true;
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

  // WHICH FINALISTS THIS ACCOUNT HAS VOTED FOR. Held here rather than per tile so a binder on both
  // the category board and the all-categories feed agrees with itself.
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

  // Covers resolve straight from card ids, so hydrate the lite image manifest for hashed URLs.
  useImageManifest();

  // Responsive grid: cap the content column, then fit as many ≥MIN_TILE tiles as the width allows.
  const contentW = Math.min(width, MaxContentWidthWide) - Spacing.four * 2;
  const cols = Math.max(2, Math.floor((contentW + GRID_GAP) / (MIN_TILE + GRID_GAP)));
  const tileW = Math.max(120, Math.floor((contentW - GRID_GAP * (cols - 1)) / cols));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {railHidden ? (
            <View style={styles.backRow}>
              <Pressable onPress={() => router.push('/discover' as Href)} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ‹ Discover
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          <ThemedText type="title" style={styles.h1}>
            🏆 {isFinals ? 'The Final' : 'Contest binders'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            {isFinals
              ? `The top ${CONTEST.finalistsPerCategory} of each category, locked as they qualified and back to zero votes. Tap a category to see its finalists.`
              : `${CONTEST.headline} Tap a category to see its entries, ranked by votes.`}
          </ThemedText>
          <Pressable onPress={() => router.push('/contest' as Href)} hitSlop={6} style={styles.rulesLink}>
            <ThemedText type="small" style={styles.rulesLinkText}>
              Prizes & rules ›
            </ThemedText>
          </Pressable>

          {voteError ? (
            <ThemedText type="small" style={styles.voteError}>
              {voteError}
            </ThemedText>
          ) : null}

          {!contestOn ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              {phase === 'ended'
                ? 'This contest has ended. The winners are on the contest page.'
                : phase === 'upcoming'
                  ? 'Entries are not open yet. The contest page has the dates.'
                  : 'Contest binders are not available in this build.'}
            </ThemedText>
          ) : (
            <>
              <View style={styles.chips}>
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
                      style={[styles.chip, active && styles.chipActive]}
                      hitSlop={2}>
                      <ThemedText type="small" style={[styles.chipText, active && styles.chipTextActive]}>
                        {c.flagship ? '★ ' : ''}
                        {c.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.sectionHead}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
                  {contestCat
                    ? `${CATEGORY_LABEL[contestCat] ?? contestCat}${isFinals ? ' finalists' : ''}`
                    : isFinals
                      ? 'All finalists'
                      : 'All entries, newest first'}
                </ThemedText>
                {!contestCat && feed ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {isFinals ? `${feed.length} finalists` : `${feed.length} entered`}
                  </ThemedText>
                ) : null}
              </View>

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
              ) : feed === null ? (
                <View style={styles.center}>
                  <ActivityIndicator />
                </View>
              ) : feed.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  No entries yet, yours could be first! Make a binder public, then enter it from the
                  Share sheet.
                </ThemedText>
              ) : (
                <View style={[styles.grid, { gap: GRID_GAP }]}>
                  {feed.map((e) => (
                    <BinderThumb
                      key={e.binder.id}
                      binder={e.binder}
                      width={tileW}
                      onPress={() => openBinder(e.binder.id)}
                      accessory={
                        isFinals ? (
                          finalsAccessory(e.binder)
                        ) : (
                          <ThemedText type="small" themeColor="textSecondary">
                            {CATEGORY_LABEL[e.category] ?? e.category} · ♥ {e.binder.likeCount ?? 0}
                          </ThemedText>
                        )
                      }
                    />
                  ))}
                </View>
              )}
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
  sub: { marginBottom: Spacing.two, lineHeight: 20 },
  rulesLink: { alignSelf: 'flex-start', marginBottom: Spacing.four },
  rulesLinkText: { color: Palette.accent, fontWeight: '600' },
  voteError: { color: Palette.dangerAlt, marginBottom: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.four },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.surface,
  },
  chipActive: { borderColor: Palette.accent, backgroundColor: Palette.accent },
  chipText: { fontSize: 12 },
  chipTextActive: { color: Palette.accentText },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  note: { paddingVertical: Spacing.three },
});
