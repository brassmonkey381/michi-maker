/**
 * `/daily` — the daily theme-search puzzle, for whoever is playing it.
 *
 * ONE PUZZLE A DAY, the same one worldwide, keyed on the UTC date. The page shows the cards and
 * asks for the words that pull them together.
 *
 * ONE WORD AT A TIME (owner, 2026-09-24), and no autocomplete. The earlier design took every word
 * at once from a suggesting box and answered "how many were right, never which", which protected
 * the answer perfectly and played badly: the reader committed blind and the autocomplete did most
 * of the work. Now a word is submitted, the server says whether it landed, and found words stack up.
 *
 * THE CARDS ARE BIG AND TAPPABLE, because the puzzle IS looking at them: the shared idea is often a
 * detail in a corner, and a 245px thumbnail hides exactly the thing being asked about. They load at
 * 640 and open full size.
 *
 * NEAR MISSES COUNT, decided on the server (puzzle_words_match): plurals and typos land. Exact-only
 * spelling turns a game about noticing pictures into a spelling test, and fails silently when it does.
 *
 * SEEN IS RECORDED ON ARRIVAL, so the home page stops offering a puzzle this person has opened.
 */
import { useRouter, type Href } from 'expo-router';
import { sendBrowseCommand } from 'tcgscan-browse';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  BottomTabInset, Breakpoints, FontSize, MaxContentWidthDoc, Palette, Radius, Spacing, Weight,
} from '@/constants/theme';
import {
  countdownText, guessWord, markSeen, myPlay, myStreak, nextRollover,
  PUZZLE_BACKDROP_FALLBACK, revealedAnswer, todaysPuzzle,
  type DailyPuzzle, type GuessResult,
} from '@/data/dailyPuzzle';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import { useAuth } from '@/store/auth';

export default function DailyScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  /**
   * WHY THIS HOOK IS STILL HERE even though a published puzzle carries its own picture addresses.
   * It is the fallback path's repaint. `cardThumbUrl` correctly returns '' until the image manifest
   * has hydrated, and a component that reads it once in render never paints again when it lands,
   * which is exactly the blank pockets a hard refresh used to show. The kit's own note on
   * useImageManifest describes this. An older puzzle, published before the column existed, still
   * goes down that path.
   */
  useImageManifest();

  const [loaded, setLoaded] = useState(false);
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [found, setFound] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const [streak, setStreak] = useState(0);
  const [yesterday, setYesterday] = useState<string[] | null>(null);

  const [typed, setTyped] = useState('');
  const [last, setLast] = useState<{ word: string; result: GuessResult } | null>(null);
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  /**
   * THE COUNTDOWN. Held as state and re-armed by a timeout after each render rather than driven by
   * an interval in an effect, because the React Compiler rules here forbid setState inside an
   * effect. `left` is recomputed from the clock each tick, so a sleeping tab that misses ticks
   * still shows the right number when it wakes rather than a drifted one.
   */
  const [tick, setTick] = useState(() => Date.now());
  const rollover = nextRollover(new Date(tick));
  const left = rollover.getTime() - tick;
  const armTick = useCallback((node: View | null) => {
    if (!node) return;
    // A minute is enough above an hour; a second only matters at the end.
    const every = left > 3600_000 ? 30_000 : 1000;
    const t = setTimeout(() => setTick(Date.now()), every);
    return () => clearTimeout(t);
  }, [left]);

  /**
   * THE PUZZLE NEEDS NO SESSION. A published puzzle is readable by `anon`, so a visitor arriving
   * cold from a link sees the cards on the first paint rather than after the app has minted them a
   * guest session. Before that policy existed this query ran as `anon`, was correctly handed an
   * empty list, and the page confidently announced there was no puzzle while one was live.
   */
  const load = useCallback(async () => {
    setLoaded(true);
    const p = await todaysPuzzle();
    setPuzzle(p);
    if (p) setYesterday(await revealedAnswer(p.id));
  }, []);

  /**
   * WHAT DOES need the session: this reader's own play, their streak, and recording that they have
   * been shown it. It runs separately and later, because waiting for auth before drawing anything
   * is what made the page wrong in the first place.
   */
  const loadMine = useCallback(async (id: string) => {
    const mine = await myPlay(id);
    if (mine) {
      setFound(mine.guess ?? []);
      setSolved(!!mine.correct);
    }
    setStreak(await myStreak());
    if (userId) await markSeen(id, userId);
  }, [userId]);

  /** A callback ref, not an effect: the React Compiler rules here forbid setState inside one. */
  const onMount = useCallback((node: ScrollView | null) => {
    if (node && !loaded) void load();
  }, [loaded, load]);

  /**
   * FIRED BY A REMOUNT, not by an effect. The marker below is keyed on the session and the puzzle,
   * so React tears it down and builds it again whenever either arrives, and a callback ref runs on
   * mount. That is how this re-runs when the guest session lands a moment after the first paint,
   * without a `useEffect` those rules forbid.
   */
  const onMine = useCallback((node: View | null) => {
    if (node && userId && puzzle) void loadMine(puzzle.id);
  }, [userId, puzzle, loadMine]);

  const submit = async () => {
    const word = typed.trim();
    if (!puzzle || !word || busy || solved) return;
    setBusy(true);
    try {
      const r = await guessWord(puzzle.id, word);
      setLast({ word, result: r });
      setTries((n) => n + 1);
      if (r.hit && r.matchedWord) {
        const hitWord = r.matchedWord;
        setFound((f) => (f.includes(hitWord) ? f : [...f, hitWord]));
      }
      if (r.solved) {
        setSolved(true);
        setStreak(await myStreak());
      }
      setTyped('');
    } catch {
      setLast({
        word,
        result: { hit: false, matchedWord: null, foundCount: found.length, total: puzzle.themeCount, solved: false },
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * THROUGH THE COMMAND BUS, not a query string. /browse reads no `?q=` parameter; every other
   * surface that drives it (home's recent feed, my collection) sends a command and then navigates,
   * and the bus HOLDS one command for the next subscriber, so it cannot race the browser mounting.
   *
   * The first version of this link passed `?q=`, which nothing consumes. It looked like it worked
   * intermittently because the browser keeps the last search it ran, so arriving with the box
   * already holding something was mistaken for the link having filled it.
   */
  const runTheSearch = () => {
    sendBrowseCommand({ type: 'search', query: found.map((w) => `theme:${w}`).join(' ') });
    router.push('/browse' as Href);
  };

  // Big enough to read the illustration, and laid out in the page's own column count so the shape
  // a reader sees is the shape it was curated in.
  const wide = width >= Breakpoints.phone;
  const cols = puzzle ? Math.min(puzzle.cols, wide ? puzzle.cols : 3) : 3;
  const gutter = Spacing.four * 2;
  const cell = Math.min(
    wide ? 210 : 150,
    (Math.min(width, MaxContentWidthDoc) - gutter - Spacing.two * (cols - 1)) / cols,
  );
  const remaining = puzzle ? puzzle.themeCount - found.length : 0;

  /**
   * THE BACKDROP IS THE PAGE'S OWN, when it has one: a published puzzle carries the background of
   * the binder page it came from, so the screen looks like the page it is. Held at a low opacity
   * rather than behind a scrim, because a scrim has to be got right twice (once per theme) and an
   * opacity works on either ground.
   */
  const backdrop = puzzle?.backdropUrl ?? PUZZLE_BACKDROP_FALLBACK;
  const zoomIndex = zoom ? puzzle?.cardIds.indexOf(zoom) ?? -1 : -1;
  const zoomFallback = zoomIndex >= 0 ? (puzzle?.cardImageUrls?.[zoomIndex] ?? '') : '';

  return (
    <ThemedView style={styles.container}>
      <Image
        source={{ uri: backdrop }}
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        contentFit="cover"
        transition={200}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView ref={onMount} contentContainerStyle={styles.scroll}>
          <View key={`${userId ?? 'anon'}:${puzzle?.id ?? ''}`} ref={onMine} />

          <View style={styles.hero}>
            <ThemedText type="small" style={styles.eyebrow}>DAILY PUZZLE</ThemedText>
            <ThemedText type="title" style={styles.h1}>What do these share?</ThemedText>
            {puzzle ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
                {`Every card matches the same ${puzzle.themeCount === 1 ? 'idea' : `${puzzle.themeCount} ideas`}. Tap a card to look closer.`}
              </ThemedText>
            ) : null}
            <View style={styles.pills}>
              {streak > 0 ? (
                <View style={styles.streakPill}>
                  <ThemedText type="smallBold" style={styles.streakText}>{`${streak} day streak`}</ThemedText>
                </View>
              ) : null}
              <View ref={armTick} style={styles.clockPill}>
                <ThemedText type="small" themeColor="textSecondary" testID="daily-countdown">
                  {puzzle
                    ? `Next puzzle in ${countdownText(left)}`
                    : `Tomorrow's puzzle in ${countdownText(left)}`}
                </ThemedText>
              </View>
            </View>
          </View>

          {!loaded ? (
            <ActivityIndicator style={styles.loading} />
          ) : !puzzle ? (
            <View style={styles.panel}>
              <ThemedText type="small">There is no puzzle today. A new one goes up every morning.</ThemedText>
              <Pressable onPress={() => router.push('/browse' as Href)}>
                <ThemedText type="smallBold" style={styles.link}>Browse cards instead</ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.grid, { maxWidth: (cell + Spacing.two) * cols }]}>
                {puzzle.cardIds.map((id, i) => (
                  <Pressable
                    key={`${id}-${i}`}
                    onPress={() => setZoom(id)}
                    accessibilityLabel="Look closer at this card"
                  >
                    <Image
                      source={{ uri: puzzle.cardImageUrls?.[i] || cardThumbUrl(id, 640) }}
                      style={[styles.card, { width: cell, height: cell * 1.396 }]}
                      contentFit="contain"
                      transition={140}
                    />
                  </Pressable>
                ))}
              </View>

              {solved ? (
                <View style={[styles.panel, styles.won]}>
                  <ThemedText type="smallBold" style={styles.wonText}>
                    {found.length === 1 ? `Got it. ${found[0]}.` : `Got them. ${found.join(' and ')}.`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {tries > 0 ? `${tries} ${tries === 1 ? 'guess' : 'guesses'}. ` : ''}
                    {`The next one lands in ${countdownText(left)}.`}
                  </ThemedText>
                  <Pressable onPress={runTheSearch}>
                    <ThemedText type="smallBold" style={styles.link}>See every card that matches</ThemedText>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.panel}>
                  <View style={styles.foundRow}>
                    {found.map((w) => (
                      <View key={w} style={styles.foundChip}>
                        <ThemedText type="small" style={styles.foundText}>{w}</ThemedText>
                      </View>
                    ))}
                    {Array.from({ length: Math.max(0, remaining) }, (_, i) => (
                      <View key={`blank-${i}`} style={styles.blankChip}>
                        <ThemedText type="small" themeColor="textSecondary">?</ThemedText>
                      </View>
                    ))}
                  </View>

                  <View style={styles.guessRow}>
                    <TextInput
                      value={typed}
                      onChangeText={setTyped}
                      onSubmitEditing={submit}
                      placeholder="One word at a time"
                      placeholderTextColor={Palette.muted}
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="send"
                      editable={!busy}
                      testID="daily-guess"
                    />
                    <Pressable
                      onPress={submit}
                      disabled={!typed.trim() || busy}
                      style={[styles.go, (!typed.trim() || busy) && styles.goOff]}
                      testID="daily-submit"
                    >
                      <ThemedText type="smallBold" style={styles.goText}>{busy ? '…' : 'Guess'}</ThemedText>
                    </Pressable>
                  </View>

                  {last ? (
                    <ThemedText
                      type="smallBold"
                      style={last.result.hit ? styles.yes : styles.no}
                      testID="daily-verdict"
                    >
                      {last.result.hit
                        ? `Yes, "${last.word}" is one of them.`
                        : `"${last.word}" is not one of them.`}
                    </ThemedText>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      Close spellings and plurals count.
                    </ThemedText>
                  )}

                  {puzzle.hint ? (
                    showHint ? (
                      <ThemedText type="small" themeColor="textSecondary">{puzzle.hint}</ThemedText>
                    ) : (
                      <Pressable onPress={() => setShowHint(true)} hitSlop={6}>
                        <ThemedText type="smallBold" style={styles.link}>Show the hint</ThemedText>
                      </Pressable>
                    )
                  ) : null}
                </View>
              )}

              {yesterday?.length ? (
                <View style={styles.panel}>
                  <ThemedText type="smallBold">Yesterday</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`The words were ${yesterday.join(' and ')}.`}
                  </ThemedText>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* Full size, for the detail the puzzle is actually about. */}
        <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
          <Pressable style={styles.zoomBack} onPress={() => setZoom(null)}>
            {zoom ? (
              <Image
                // The full picture when the manifest can give one, otherwise the stored address,
                // which is a 640 and still worth opening.
                source={{ uri: cardThumbUrl(zoom, 'full') || zoomFallback }}
                style={styles.zoomImage}
                contentFit="contain"
                transition={120}
              />
            ) : null}
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // A watermark, not a picture: the cards are the thing to look at.
  backdrop: { opacity: 0.14 },
  flex: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    maxWidth: MaxContentWidthDoc,
    width: '100%',
    alignSelf: 'center',
    gap: Spacing.three,
  },
  hero: { gap: Spacing.one, alignItems: 'center', paddingVertical: Spacing.three },
  eyebrow: { letterSpacing: 2, color: Palette.accent, fontWeight: Weight.bold },
  h1: { textAlign: 'center' },
  lead: { textAlign: 'center', maxWidth: 420 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, justifyContent: 'center', alignItems: 'center' },
  clockPill: {
    marginTop: Spacing.one,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: Spacing.three,
  },
  streakPill: {
    marginTop: Spacing.one,
    backgroundColor: Palette.accentSoft,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: Spacing.three,
  },
  streakText: { color: Palette.accent },
  loading: { alignSelf: 'center', marginTop: Spacing.four },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  card: { borderRadius: Radius.control, backgroundColor: Palette.panel },
  panel: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  won: { borderColor: Palette.accent, backgroundColor: Palette.accentSoft },
  wonText: { color: Palette.accent, fontSize: FontSize.md },
  foundRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, justifyContent: 'center' },
  foundChip: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: 5,
    paddingHorizontal: Spacing.three,
  },
  foundText: { color: Palette.accentText, fontWeight: Weight.semibold },
  blankChip: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Palette.hairline,
    borderRadius: Radius.pill,
    paddingVertical: 5,
    paddingHorizontal: Spacing.three,
  },
  guessRow: { flexDirection: 'row', gap: Spacing.two },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    color: Palette.ink,
    fontSize: FontSize.body,
  },
  go: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
  },
  goOff: { opacity: 0.45 },
  goText: { color: Palette.accentText },
  yes: { color: Palette.accent },
  no: { color: Palette.muted },
  link: { color: Palette.accent },
  zoomBack: {
    flex: 1,
    backgroundColor: Palette.scrim30,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  zoomImage: { width: '100%', height: '100%', maxWidth: 640 },
});
