/**
 * The stage-2 ballot, as one pill on a finalist's tile.
 *
 * A SEPARATE ACT FROM LIKING. Round 1 was voted with the heart people already use everywhere, and
 * the Final deliberately is not: liking a binder here would raise the count that decided round 1
 * and make the two rounds one continuous vote. This writes `contest_finals_votes` instead, which
 * is why the label says Vote and not ♥ — the two numbers on this screen mean different things and
 * must not be cast by the same gesture.
 *
 * OPTIMISTIC, THEN CORRECTED. The count and the pill flip on the tap and roll back if the server
 * refuses, because the refusals are real and specific — the window has closed, it is your own
 * binder, you are signed out, you already voted from another tab — and the message that comes back
 * is more useful than a spinner. The server owns all four rules; this only reports them.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { castFinalsVote, withdrawFinalsVote } from '@/data/contestRepo';

export function FinalsVoteButton({
  binderId,
  voted,
  votes,
  disabled,
  onChange,
  onError,
}: {
  binderId: string;
  voted: boolean;
  votes: number;
  /** Voting is closed, or this is the viewer's own binder. */
  disabled?: boolean;
  onChange: (binderId: string, voted: boolean) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy || disabled) return;
    const next = !voted;
    setBusy(true);
    onChange(binderId, next); // optimistic
    try {
      if (next) await castFinalsVote(binderId);
      else await withdrawFinalsVote(binderId);
    } catch (e) {
      onChange(binderId, !next); // roll back
      onError(e instanceof Error ? e.message : 'Vote failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ selected: voted, disabled: !!disabled }}
      accessibilityLabel={voted ? 'Take back your vote' : 'Vote for this binder'}
      style={({ pressed }) => [
        styles.pill,
        voted && styles.pillOn,
        (disabled || busy) && styles.dim,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.text, voted && styles.textOn]}>
        {voted ? '✓ Voted' : 'Vote'} · {votes}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.accent,
    backgroundColor: Palette.selectionSoft,
  },
  pillOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  dim: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  text: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.link },
  textOn: { color: Palette.accentText },
});
