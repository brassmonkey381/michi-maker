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
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtWindow, StockCard } from '@/components/binder/ArtViewCard';
import { Seg } from '@/components/binder/inspector/controls';
import { Confetti, makeConfetti, type ConfettiPiece } from '@/components/Confetti';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  BottomTabInset, Breakpoints, FontSize, MaxContentWidthDoc, Palette, Radius, Spacing, Weight,
} from '@/constants/theme';
import {
  countdownText, guessWord, markSeen, myPlay, myStreak, nextRollover,
  PUZZLE_BACKDROP_FALLBACK, canReveal, revealCountdownText, revealPuzzleAnswer, revealedAnswer, todaysPuzzle,
  type DailyPuzzle, type GuessResult,
} from '@/data/dailyPuzzle';
import { ART_FULL_GAP_OVER_W, ART_VIEWS, connectedCellAspect, connectedCut, isFullArtCard, type ArtView } from '@/data/artView';
import { resolveCatalogCardWith } from '@/data/cardResolver';
import { useCatalog } from '@/hooks/use-catalog';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import {
  trackPuzzleGuess, trackPuzzleGuessFailed, trackPuzzleOpened, trackPuzzleRevealed, trackPuzzleSolved,
} from '@/lib/analytics';
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
  /** Today's words, once they asked for them (REVEAL_AFTER guesses in). Ends the day, not a win. */
  const [revealed, setRevealed] = useState<string[] | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [streak, setStreak] = useState(0);
  const [yesterday, setYesterday] = useState<string[] | null>(null);

  const [typed, setTyped] = useState('');
  const [last, setLast] = useState<{ word: string; result: GuessResult } | null>(null);
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  // HOW THE CARDS SHOW (owner, 2026-10-24): the full card, the art window on a stock card, or the
  // art edge to edge, the binder's art views (data/artView.ts) on today's page. The two art views
  // read card metadata, so choosing one is what loads the catalogue.
  const [artView, setArtView] = useState<ArtView | 'card'>('card');
  const { catalog } = useCatalog(artView !== 'card');
  /** A burst for every right word, a bigger one for the last (owner, 2026-10-22). */
  const [confetti, setConfetti] = useState<ConfettiPiece[] | null>(null);

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
      // The server's count, so a reload after five guesses still offers the reveal.
      setTries(mine.attempts);
      if (mine.revealedAt && !mine.correct) {
        setRevealed(await revealPuzzleAnswer(id).catch(() => null));
      }
    }
    setStreak(await myStreak());
    if (userId) await markSeen(id, userId);
    // After myPlay, so `state` says what they actually arrived at rather than
    // just that they arrived. This call site was lost when the page was rewritten
    // on 2026-09-24 and the puzzle went dark in the stream while real people were
    // solving it - three answers landed with nothing recorded.
    trackPuzzleOpened(id, 'direct', mine?.correct ? 'solved' : mine ? 'played' : 'fresh');
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

  /** Words guessed in this visit, for the attempt number on each one. */
  const attempts = useRef(0);

  const reveal = async () => {
    if (!puzzle || revealing || solved || revealed) return;
    setRevealing(true);
    try {
      const words = await revealPuzzleAnswer(puzzle.id);
      setRevealed(words);
      trackPuzzleRevealed(puzzle.id, tries, found.length);
    } catch {
      // The server said no (fewer than five guesses on its count, or the RPC failed): the link
      // simply stays, and the next press asks again.
    } finally {
      setRevealing(false);
    }
  };

  const submit = async () => {
    const word = typed.trim();
    if (!puzzle || !word || busy || solved || revealed) return;
    setBusy(true);
    // Read from the ref, not `tries`: state is a render behind, and the attempt
    // number has to be right inside this same call.
    attempts.current += 1;
    const attempt = attempts.current;
    try {
      const r = await guessWord(puzzle.id, word);
      setLast({ word, result: r });
      setTries((n) => n + 1);
      if (r.hit && r.matchedWord) {
        const hitWord = r.matchedWord;
        setFound((f) => (f.includes(hitWord) ? f : [...f, hitWord]));
        setConfetti(makeConfetti(r.solved ? 90 : 36));
      }
      trackPuzzleGuess(puzzle.id, attempt, r);
      if (r.solved) {
        setSolved(true);
        const next = await myStreak();
        setStreak(next);
        // The outcome the puzzle exists for, with how many words it took and the
        // run it extends - neither belongs on every individual guess.
        trackPuzzleSolved(puzzle.id, attempt, next);
      }
      setTyped('');
    } catch {
      // The RPC failed. NOT a wrong word: our outage and their miss must not
      // share a bucket.
      trackPuzzleGuessFailed(puzzle.id, attempt);
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
  const seeMatches = (words: string[]) => {
    sendBrowseCommand({ type: 'search', query: words.map((w) => `theme:${w}`).join(' ') });
    router.push('/browse' as Href);
  };
  const runTheSearch = () => seeMatches(found);

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
  const puzzleCards = puzzle ? puzzle.cardIds.map((id) => resolveCatalogCardWith(catalog, id)) : [];
  const cut = connectedCut(puzzleCards);
  const connected = artView === 'connected';
  // Between the cards: the pocket gap, nothing on a connected sheet, or the silver bands a sheet
  // of full arts lost (artView.ts ART_FULL_GAP_OVER_W), so the art meets as it was drawn to.
  const sheetGap = connected ? (cut === 'full' ? cell * ART_FULL_GAP_OVER_W : 0) : Spacing.two;
  // RED OR GREEN (owner, 2026-10-22): the last verdict colours the box and the line under it, so
  // a right word reads as right without reading. The tint lifts as soon as they type again.
  const verdict = last && !typed ? (last.result.hit ? 'yes' : 'no') : null;
  // AS LITTLE UNDER THE CARDS AS POSSIBLE (owner, 2026-10-16). The cards keep their size and the
  // guess box stays under them (a side panel was tried and turned down), so everything else is
  // compact: the lead and the countdown share a row, the found chips sit in the guess row, and
  // the spelling tip shares a line with the hint link.

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
            <ThemedText type="subtitle" style={styles.h1}>What do these share?</ThemedText>
            <View style={styles.pills}>
              {puzzle ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
                  {`Every card matches the same ${puzzle.themeCount === 1 ? 'idea' : `${puzzle.themeCount} ideas`}. Tap a card to look closer.`}
                </ThemedText>
              ) : null}
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
            <View style={styles.stacked}>
              <View style={styles.viewRow} testID="daily-art-view">
                <Seg options={ART_VIEWS} value={artView} onChange={setArtView} />
              </View>
              <View style={[styles.grid, connected && styles.gridConnected, { gap: sheetGap, maxWidth: (cell + sheetGap) * cols }]}>
                {puzzle.cardIds.map((id, i) => {
                  const uri = puzzle.cardImageUrls?.[i] || cardThumbUrl(id, 640);
                  const card = puzzleCards[i];
                  const renderImage = () => <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={140} />;
                  return (
                    <Pressable
                      key={`${id}-${i}`}
                      onPress={() => setZoom(id)}
                      accessibilityLabel="Look closer at this card"
                    >
                      {connected ? (
                        <View style={{ width: cell, height: cell * connectedCellAspect(cut) }}>
                          <ArtWindow cut={cut} renderImage={renderImage} />
                        </View>
                      ) : artView === 'window' && !isFullArtCard(card) ? (
                        <View style={[styles.card, { width: cell, height: cell * 1.396 }]}>
                          <StockCard card={card} radius={Radius.control} small={cell < 170} renderImage={renderImage} />
                        </View>
                      ) : (
                        <Image
                          source={{ uri }}
                          style={[styles.card, { width: cell, height: cell * 1.396 }]}
                          contentFit="contain"
                          transition={140}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.side}>
              {revealed && !solved ? (
                <View style={styles.panel} testID="daily-revealed">
                  <ThemedText type="smallBold">
                    {revealed.length === 1 ? `The word was ${revealed[0]}.` : `The words were ${revealed.join(' and ')}.`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {found.length > 0 ? `You had ${found.join(' and ')}. ` : ''}
                    {`The next one lands in ${countdownText(left)}.`}
                  </ThemedText>
                  <Pressable onPress={() => seeMatches(revealed)}>
                    <ThemedText type="smallBold" style={styles.link}>See every card that matches</ThemedText>
                  </Pressable>
                </View>
              ) : solved ? (
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
                  <View style={styles.guessRow}>
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
                    <TextInput
                      value={typed}
                      onChangeText={setTyped}
                      onSubmitEditing={submit}
                      placeholder="One word at a time"
                      placeholderTextColor={Palette.muted}
                      style={[styles.input, verdict === 'yes' && styles.inputYes, verdict === 'no' && styles.inputNo]}
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

                  <View style={styles.noteRow}>
                    {last ? (
                      <View style={[styles.verdict, last.result.hit ? styles.verdictYes : styles.verdictNo]}>
                        <ThemedText
                          type="smallBold"
                          style={[styles.note, last.result.hit ? styles.yes : styles.no]}
                          testID="daily-verdict"
                        >
                          {last.result.hit
                            ? `Yes, "${last.word}" is one of them.`
                            : `No, "${last.word}" is not one of them.`}
                        </ThemedText>
                      </View>
                    ) : (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                        Close spellings, plurals, and synonyms count.
                      </ThemedText>
                    )}
                    {puzzle.hint && !showHint ? (
                      <Pressable onPress={() => setShowHint(true)} hitSlop={6}>
                        <ThemedText type="smallBold" style={styles.link}>Show the hint</ThemedText>
                      </Pressable>
                    ) : null}
                    {/* THE WAY OUT (owner, 2026-10-16): after REVEAL_AFTER guesses the words can be
                        asked for. The server holds the same rule, so a reload cannot get them early. */}
                    {canReveal(tries, solved) ? (
                      <Pressable onPress={() => void reveal()} hitSlop={6} disabled={revealing} testID="daily-reveal">
                        <ThemedText type="smallBold" style={styles.link}>{revealing ? 'One moment…' : 'Reveal the answer'}</ThemedText>
                      </Pressable>
                    ) : last ? (
                      // From the first guess on (owner, 2026-10-16): how far away the way out is.
                      <ThemedText type="small" themeColor="textSecondary" testID="daily-reveal-countdown">
                        {revealCountdownText(tries)}
                      </ThemedText>
                    ) : null}
                  </View>
                  {puzzle.hint && showHint ? (
                    <ThemedText type="small" themeColor="textSecondary">{puzzle.hint}</ThemedText>
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
              </View>
            </View>
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
      <Confetti pieces={confetti} />
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
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.four,
    maxWidth: MaxContentWidthDoc,
    width: '100%',
    alignSelf: 'center',
    gap: Spacing.two,
  },
  hero: { gap: Spacing.one, alignItems: 'center' },
  eyebrow: { letterSpacing: 2, color: Palette.accent, fontWeight: Weight.bold },
  h1: { textAlign: 'center' },
  lead: { textAlign: 'center', maxWidth: 420 },
  stacked: { gap: Spacing.two },
  side: { gap: Spacing.two, width: '100%', maxWidth: 520, alignSelf: 'center' },
  noteRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three, rowGap: Spacing.one, alignItems: 'center' },
  note: { flexShrink: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center', alignItems: 'center' },
  clockPill: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: Spacing.three,
  },
  streakPill: {
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
  /** The art edge to edge: no gap, no rounding, the cells a sheet. */
  gridConnected: { backgroundColor: '#000' },
  viewRow: { alignSelf: 'center', marginBottom: Spacing.two },
  card: { borderRadius: Radius.control, backgroundColor: Palette.panel },
  panel: {
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.control,
    padding: Spacing.two,
    gap: Spacing.two,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  won: { borderColor: Palette.accent, backgroundColor: Palette.accentSoft },
  wonText: { color: Palette.accent, fontSize: FontSize.md },
  foundRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, alignItems: 'center', maxWidth: '45%' },
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
  guessRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
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
  inputYes: { borderColor: Palette.success, borderWidth: 2, backgroundColor: `${Palette.success}1F` },
  inputNo: { borderColor: Palette.danger, borderWidth: 2, backgroundColor: Palette.dangerBg },
  verdict: { borderRadius: Radius.pill, paddingVertical: 4, paddingHorizontal: Spacing.three, flexShrink: 1 },
  verdictYes: { backgroundColor: `${Palette.success}1F` },
  verdictNo: { backgroundColor: Palette.dangerBg },
  yes: { color: Palette.success },
  no: { color: Palette.danger },
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
