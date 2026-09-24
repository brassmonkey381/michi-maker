/**
 * THE NUDGE ON THE HOME PAGE: today's puzzle, when this person has not seen it yet.
 *
 * WHY IT LIVES ON HOME AND NOT ONLY AT SIGN-IN. Somebody already signed in when a new puzzle lands
 * never signs in again that day, so a sign-in hook would skip them entirely. "Have they seen
 * today's" is the existence of a puzzle_plays row, so reaching the home page is enough: the card
 * appears, opening it records the row, and it stops appearing. That is the behaviour the owner
 * asked for, and it falls out of the row rather than out of a timestamp comparison.
 *
 * IT ASKS ONCE. A reader who says "not for me" has `dailyPuzzle: 'declined'` written to their
 * preferences and is never shown it again, on the pattern profiles already uses for the avatar
 * offer. Guests are not asked at all (src/data/prompts.ts): they have no account to record it on.
 */
import { useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
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
        .select('preferences')
        .eq('id', userId)
        .maybeSingle();
      const choice = dailyPuzzleChoice(profile?.preferences);
      if (choice === 'declined') return;

      const p = await todaysPuzzle();
      if (!p) return;
      // Seen already means played, dismissed, or simply opened. Either way it is not news.
      if (await myPlay(p.id)) return;

      setPuzzle(p);
      setAsking(choice === null);
      setPhase('ready');
    })();
  }, [phase, userId, isGuest]);

  const record = async (choice: 'on' | 'declined') => {
    setPhase('hidden');
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
            if (asking) void record('on');
            router.push('/daily' as Href);
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
