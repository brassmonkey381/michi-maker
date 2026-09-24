/**
 * `/daily` — the daily theme-search puzzle, for whoever is playing it.
 *
 * ONE PUZZLE A DAY, the same one worldwide, keyed on the UTC date. The page shows the cards and
 * asks for the words that pull them together. It never receives the answer: the guess goes to
 * `grade_puzzle_guess`, which replies with how many were right and never which, and yesterday's
 * words are readable only once the puzzle is yesterday's.
 *
 * WHY THE GUESS BOX SUGGESTS. A free-text answer makes "lake" versus "pond" a support complaint
 * rather than a decision, and the suggestions come from a curated list rather than the tag corpus,
 * so playing the game teaches the vocabulary without handing it over. That vocabulary IS the
 * product's paid feature, which is the point: a player who learns the words has a reason to type
 * one into the search box.
 *
 * SEEN IS RECORDED ON ARRIVAL, so the home page stops offering a puzzle this person has opened.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  BottomTabInset, Breakpoints, FontSize, MaxContentWidthDoc, Palette, Radius, Spacing, Weight,
} from '@/constants/theme';
import {
  gradeGuess, markSeen, myPlay, myStreak, revealedAnswer, suggestWords, todaysPuzzle,
  verdictText, vocabulary,
  type DailyPuzzle, type GradeResult, type MyPlay,
} from '@/data/dailyPuzzle';
import { cardThumbUrl } from '@/lib/catalogConfig';
import {
  trackPuzzleGuess, trackPuzzleGuessFailed, trackPuzzleOpened, trackPuzzleSolved,
} from '@/lib/analytics';
import { useAuth } from '@/store/auth';

export default function DailyScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const auth = useAuth();
  // Hoisted out of the dependency list: an optional chain in there defeats the React Compiler's
  // memoization check ("existing memoization could not be preserved") for no benefit.
  const userId = auth.user?.id ?? null;
  // How they arrived. The home card appends ?from=card; the rail appends ?from=nav.
  // Anything else is a direct hit - a bookmark, a share, or a typed URL.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const phone = width < Breakpoints.phone;

  const [loaded, setLoaded] = useState(false);
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [play, setPlay] = useState<MyPlay | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [answer, setAnswer] = useState<string[] | null>(null);

  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<GradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  /** Guesses made in this visit, for the attempt number on each one. */
  const attempts = useRef(0);

  /**
   * LOADED AT THE TAP OR ON MOUNT VIA A CALLBACK REF, never in an effect: the React Compiler rules
   * here forbid setState inside one. The ref fires once when the scroll view first mounts, which is
   * the moment the screen genuinely appears.
   */
  const load = useCallback(async () => {
    setLoaded(true);
    const p = await todaysPuzzle();
    setPuzzle(p);
    setWords(await vocabulary());
    if (!p) return;
    const mine = await myPlay(p.id);
    setPlay(mine);
    if (mine?.correct !== null && mine?.correct !== undefined) {
      setResult({ correct: !!mine.correct, matched: Number(mine.matched ?? 0), of: p.themeCount });
    }
    setStreak(await myStreak());
    setAnswer(await revealedAnswer(p.id));
    if (userId) await markSeen(p.id, userId);
    // After the play is known, so `state` can say what they actually arrived at.
    // A visit to a puzzle already solved is a different visit from a first look,
    // and one "opened" count would hide the difference.
    trackPuzzleOpened(
      p.id,
      from === 'card' ? 'card' : from === 'nav' ? 'nav' : 'direct',
      mine?.correct ? 'solved' : mine ? 'played' : 'fresh',
    );
  }, [userId, from]);

  /**
   * A CALLBACK REF, not an effect. The React Compiler rules here forbid setState inside an effect,
   * and a screen has to fetch on arrival; the ref fires once when the list first mounts, which is
   * that moment. It must return void, so the promise is deliberately not returned.
   */
  const onMount = useCallback((node: ScrollView | null) => {
    if (node && !loaded) void load();
  }, [loaded, load]);

  const suggestions = useMemo(() => suggestWords(words, typed, picked), [words, typed, picked]);
  const solved = result?.correct === true;
  const canSubmit = picked.length > 0 && !busy && !solved;

  const add = (word: string) => {
    if (picked.length >= (puzzle?.themeCount ?? 1)) return;
    setPicked((p) => (p.includes(word) ? p : [...p, word]));
    setTyped('');
  };

  const submit = async () => {
    if (!puzzle || !canSubmit) return;
    setBusy(true);
    // Counted in a ref rather than state: it must be correct inside this same
    // call, and a state update would not be readable until the next render.
    attempts.current += 1;
    const attempt = attempts.current;
    try {
      const r = await gradeGuess(puzzle.id, picked);
      setResult(r);
      trackPuzzleGuess(puzzle.id, attempt, picked, r);
      if (r.correct) {
        const next = await myStreak();
        setStreak(next);
        // Separate from the guess: solving is the outcome the puzzle exists for,
        // and it carries how many tries and the run it extends, neither of which
        // belongs on every wrong answer.
        trackPuzzleSolved(puzzle.id, attempt, next);
      }
    } catch {
      setResult(null);
      // The RPC failed. NOT a wrong answer - pooling the two would put our
      // outage in the same bucket as a player getting it wrong.
      trackPuzzleGuessFailed(puzzle.id, attempt);
    } finally {
      setBusy(false);
    }
  };

  const cell = phone ? Math.min(110, (width - Spacing.four * 2) / 3 - Spacing.one) : 132;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView ref={onMount} contentContainerStyle={styles.scroll}>
          <View style={styles.head}>
            <ThemedText type="title">Daily puzzle</ThemedText>
            {streak > 0 ? (
              <ThemedText type="smallBold" style={styles.streak}>{`${streak} day streak`}</ThemedText>
            ) : null}
          </View>

          {!loaded ? (
            <ActivityIndicator style={styles.loading} />
          ) : !puzzle ? (
            <View style={styles.card}>
              <ThemedText type="small">
                There is no puzzle today. A new one goes up every morning.
              </ThemedText>
              <Pressable onPress={() => router.push('/browse' as Href)} style={styles.secondary}>
                <ThemedText type="smallBold">Browse cards instead</ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
                {`Every card below matches the same ${puzzle.themeCount === 1 ? 'idea' : `${puzzle.themeCount} ideas`}. Name ${puzzle.themeCount === 1 ? 'it' : 'them'}.`}
              </ThemedText>

              <View style={[styles.grid, { maxWidth: (cell + Spacing.one) * puzzle.cols }]}>
                {puzzle.cardIds.map((id, i) => (
                  <Image
                    key={`${id}-${i}`}
                    source={{ uri: cardThumbUrl(id, 245) }}
                    style={{ width: cell, height: cell * 1.4, borderRadius: Radius.control }}
                    contentFit="cover"
                    transition={120}
                    accessibilityLabel="A card in today's puzzle"
                  />
                ))}
              </View>

              {/* THE ANSWER AREA -------------------------------------------------------- */}
              {solved || (play?.correct && !result) ? (
                <View style={styles.card}>
                  <ThemedText type="smallBold" style={styles.good}>
                    {verdictText(puzzle.themeCount, puzzle.themeCount)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Come back tomorrow for the next one.
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.card}>
                  <View style={styles.pickedRow}>
                    {picked.map((w) => (
                      <Pressable
                        key={w}
                        onPress={() => setPicked((p) => p.filter((x) => x !== w))}
                        style={styles.pickedChip}
                      >
                        <ThemedText type="small" style={styles.pickedText}>{`${w}  ×`}</ThemedText>
                      </Pressable>
                    ))}
                    {picked.length < puzzle.themeCount ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {`${puzzle.themeCount - picked.length} to go`}
                      </ThemedText>
                    ) : null}
                  </View>

                  <TextInput
                    value={typed}
                    onChangeText={setTyped}
                    placeholder="Start typing a word about the pictures"
                    placeholderTextColor={Palette.muted}
                    style={styles.input}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={picked.length < puzzle.themeCount}
                    testID="daily-guess"
                  />

                  {suggestions.length ? (
                    <View style={styles.suggestRow}>
                      {suggestions.map((w) => (
                        <Pressable key={w} onPress={() => add(w)} style={styles.suggestChip} testID={`suggest-${w}`}>
                          <ThemedText type="small">{w}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {/* The count is feedback, and deliberately never says WHICH word was right. */}
                  {result && !result.correct ? (
                    <ThemedText type="smallBold" style={styles.near} testID="daily-verdict">
                      {verdictText(result.matched, result.of)}
                    </ThemedText>
                  ) : null}

                  <Pressable
                    onPress={submit}
                    disabled={!canSubmit}
                    style={[styles.primary, !canSubmit && styles.primaryOff]}
                    testID="daily-submit"
                  >
                    <ThemedText type="smallBold" style={styles.primaryText}>
                      {busy ? 'Checking…' : 'Check my answer'}
                    </ThemedText>
                  </Pressable>

                  {puzzle.hint ? (
                    showHint ? (
                      <ThemedText type="small" themeColor="textSecondary">{puzzle.hint}</ThemedText>
                    ) : (
                      <Pressable onPress={() => setShowHint(true)} hitSlop={6}>
                        <ThemedText type="small" themeColor="textSecondary">Show the hint</ThemedText>
                      </Pressable>
                    )
                  ) : null}
                </View>
              )}

              {answer?.length ? (
                <View style={styles.card}>
                  <ThemedText type="smallBold">Yesterday</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`The words were ${answer.join(' and ')}. Try searching one.`}
                  </ThemedText>
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
    paddingBottom: BottomTabInset + Spacing.four,
    maxWidth: MaxContentWidthDoc,
    width: '100%',
    alignSelf: 'center',
    gap: Spacing.three,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  streak: { color: Palette.accent },
  lead: { marginTop: -Spacing.two },
  loading: { alignSelf: 'center', marginTop: Spacing.four },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, alignSelf: 'center' },
  card: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  pickedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
  pickedChip: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
  },
  pickedText: { color: Palette.accentText, fontWeight: Weight.semibold },
  input: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    color: Palette.ink,
    fontSize: FontSize.body,
  },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  suggestChip: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
  },
  primary: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  primaryOff: { opacity: 0.45 },
  primaryText: { color: Palette.accentText },
  secondary: { paddingVertical: Spacing.one },
  good: { color: Palette.accent },
  near: { color: Palette.muted },
});
