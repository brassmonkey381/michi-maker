/**
 * Upvote control for a person's profile. Shows the count and — for a signed-in real account — lets
 * them upvote / remove it, optimistically. Anonymous guests see the count but are asked to sign in.
 * You can't upvote yourself (the button is hidden when the profile is your own).
 *
 * Pass `initialCount` / `initialUpvoted` when the parent already knows them (e.g. a search list) to
 * skip the per-item fetch; omit them on a standalone profile page and the button loads its own.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchUpvoteCount, hasUpvoted, removeUpvote, upvoteProfile } from '@/data/profileRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

export function UpvoteButton({
  profileId,
  initialCount,
  initialUpvoted,
  onNeedsAccount,
}: {
  profileId: string;
  initialCount?: number;
  initialUpvoted?: boolean;
  onNeedsAccount?: () => void;
}) {
  const { user, isSignedIn } = useAuth();
  const [count, setCount] = useState<number | null>(initialCount ?? null);
  const [voted, setVoted] = useState(!!initialUpvoted);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const isSelf = user?.id === profileId;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load count + my-vote when the parent didn't seed them (standalone use).
  useEffect(() => {
    if (!isSupabaseConfigured || isSelf) return;
    if (initialCount !== undefined && initialUpvoted !== undefined) return;
    let active = true;
    (async () => {
      try {
        const [c, mine] = await Promise.all([
          fetchUpvoteCount(profileId),
          user ? hasUpvoted(profileId, user.id) : Promise.resolve(false),
        ]);
        if (active) {
          setCount(c);
          setVoted(mine);
        }
      } catch {
        // Upvotes are decoration — a failed count just leaves the control blank.
      }
    })();
    return () => {
      active = false;
    };
  }, [profileId, user, isSelf, initialCount, initialUpvoted]);

  if (!isSupabaseConfigured || isSelf) return null;

  const toggle = async () => {
    if (busy) return;
    if (!isSignedIn || !user) {
      onNeedsAccount?.();
      return;
    }
    const next = !voted;
    setVoted(next);
    setCount((c) => Math.max(0, (c ?? 0) + (next ? 1 : -1)));
    setBusy(true);
    try {
      if (next) await upvoteProfile(profileId);
      else await removeUpvote(profileId, user.id);
    } catch {
      if (mounted.current) {
        setVoted(!next);
        setCount((c) => Math.max(0, (c ?? 0) + (next ? -1 : 1)));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={toggle}
      accessibilityLabel={voted ? 'Remove upvote' : 'Upvote this person'}
      style={({ pressed }) => [styles.btn, voted && styles.btnVoted, pressed && styles.pressed]}>
      <Text style={[styles.arrow, voted && styles.arrowVoted]}>▲</Text>
      <ThemedText type="smallBold" style={voted ? styles.countVoted : undefined}>
        {count ?? '–'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  btnVoted: { borderColor: Palette.accent },
  pressed: { opacity: 0.7 },
  arrow: { fontSize: FontSize.control, color: Palette.muted },
  arrowVoted: { color: Palette.accent },
  countVoted: { color: Palette.accent, fontWeight: Weight.bold },
});
