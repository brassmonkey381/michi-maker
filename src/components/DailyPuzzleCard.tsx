/**
 * THE NUDGE ON THE HOME PAGE: today's puzzle, when this person has not seen it yet.
 *
 * WHY IT LIVES ON HOME AND NOT ONLY AT SIGN-IN. Somebody already signed in when a new puzzle lands
 * never signs in again that day, so a sign-in hook would skip them entirely. "Have they seen
 * today's" is the existence of a puzzle_plays row, so reaching the home page is enough: the card
 * appears, opening it records the row, and it stops appearing. That is the behaviour the owner
 * asked for, and it falls out of the row rather than out of a timestamp comparison.
 *
 * IT ASKS ONCE, AND ONCE MEANS ONCE (owner, 2026-09-25). The first sighting stamps
 * `daily_puzzle_prompt_at` and that stamp is what closes the question - not the answer. Saying
 * "not for me" writes `dailyPuzzle: 'declined'`; saying yes writes 'on'; and IGNORING IT is also
 * an answer, recorded by the stamp alone. All three mean the card never asks again.
 *
 * WHY THE STAMP AND NOT THE PREFERENCE. Until this change the question stayed open until somebody
 * answered it, so a reader who ignored the card got it again on every home page load: two people
 * were asked five times each in one day and never replied. Asking a sixth time is not a second
 * chance, it is the same question shouted louder, and the fifth impression made the opt-in rate
 * read as a fifth of what it was.
 *
 * AFTER AN IGNORE THE CARD STOPS ENTIRELY, rather than staying on without its question. They were
 * offered it once and said nothing, which is closer to "no" than to "yes"; the puzzle stays in the
 * nav for anyone who wants to find it. Only an explicit 'on' keeps the card coming back.
 *
 * Guests are not asked at all (src/data/prompts.ts): they have no account to record it on.
 */
import { useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { trackPuzzleChoice, trackPuzzleOffered } from '@/lib/analytics';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  dailyPuzzleChoice, myPlay, todaysPuzzle, withDailyPuzzleChoice, type DailyPuzzle,
} from '@/data/dailyPuzzle';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';
import { useAuth } from '@/store/auth';

type Phase = 'idle' | 'hidden' | 'ready';

export function DailyPuzzleCard() {
  const router = useRouter();
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const isGuest = !!auth.user?.is_anonymous;

  const [phase, setPhase] = useState<Phase>('idle');
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [asking, setAsking] = useState(false);

  /**
   * A callback ref rather than an effect, for the reason the daily screen gives: setState inside an
   * effect is what the React Compiler rules here forbid. This fires when the placeholder mounts.
   */
  const onMount = useCallback((node: View | null) => {
    if (!node || phase !== 'idle' || !userId || isGuest || !supabase) return;
    setPhase('hidden');
    void (async () => {
      const { data: profile } = await supabase!
        .from('profiles')
        .select('preferences, daily_puzzle_prompt_at')
        .eq('id', userId)
        .maybeSingle();
      const choice = dailyPuzzleChoice(profile?.preferences);
      if (choice === 'declined') return;
      // Asked before and never answered. That silence is the answer; do not ask
      // again, and do not show the card either - see the header.
      const askedBefore = !!profile?.daily_puzzle_prompt_at;
      if (choice === null && askedBefore) return;

      const p = await todaysPuzzle();
      if (!p) return;
      // Seen already means played, dismissed, or simply opened. Either way it is not news.
      if (await myPlay(p.id)) return;

      const asking = choice === null;
      setPuzzle(p);
      setAsking(asking);
      setPhase('ready');
      // Here, not at render: this runs once when the card is resolved, whereas a
      // render can repeat. `asking` marks the one offer that can produce a choice.
      trackPuzzleOffered(p.id, asking);
      // The stamp goes down the moment the question is PUT, not when it is
      // answered - otherwise an ignored card asks again tomorrow, which is the
      // whole behaviour this replaces. record() stamps it again on an explicit
      // answer, which is harmless: the column only ever needs to be non-null.
      if (asking) {
        void supabase!
          .from('profiles')
          .update({ daily_puzzle_prompt_at: new Date().toISOString() })
          .eq('id', userId);
      }
    })();
  }, [phase, userId, isGuest]);

  const record = async (choice: 'on' | 'declined') => {
    setPhase('hidden');
    // Before the write, and outside the guard below: a choice the user made is a
    // fact whether or not the preference row saves, and a failed save is exactly
    // when you want to know they chose.
    if (puzzle) trackPuzzleChoice(choice, puzzle.id);
    if (!supabase || !userId) return;
    const { data } = await supabase.from('profiles').select('preferences').eq('id', userId).maybeSingle();
    await supabase
      .from('profiles')
      .update({
        // The column is jsonb; the helper returns a plain object, which IS valid Json but is not
        // narrowed to it by the generated type.
        preferences: withDailyPuzzleChoice(data?.preferences, choice) as Json,
        daily_puzzle_prompt_at: new Date().toISOString(),
      })
      .eq('id', userId);
  };

  if (phase !== 'ready' || !puzzle) return <View ref={onMount} />;

  return (
    <View style={styles.card} testID="daily-puzzle-card">
      <View style={styles.flex}>
        <ThemedText type="smallBold">Today&apos;s puzzle is up</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {`${puzzle.cardIds.length} cards, ${puzzle.themeCount === 1 ? 'one idea' : `${puzzle.themeCount} ideas`} in common. Can you name ${puzzle.themeCount === 1 ? 'it' : 'them'}?`}
        </ThemedText>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            // Pressing Play IS the opt-in when the question is still open - it is
            // recorded as a choice, not just a navigation, or the opt-in rate
            // would only ever count people who pressed the quieter button.
            if (asking) void record('on');
            router.push('/daily?from=card' as Href);
          }}
          style={styles.primary}
          testID="daily-card-play"
        >
          <ThemedText type="smallBold" style={styles.primaryText}>Play</ThemedText>
        </Pressable>
        {asking ? (
          <Pressable onPress={() => void record('declined')} hitSlop={6} testID="daily-card-decline">
            <ThemedText type="small" themeColor="textSecondary">Not for me</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: Palette.accent,
    borderRadius: Radius.control,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  primary: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  primaryText: { color: Palette.accentText, fontSize: FontSize.label, fontWeight: Weight.semibold },
});
