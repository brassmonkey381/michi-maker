/**
 * The heart Like control shown on a public binder (the `/binder/[id]` viewer, where the viewer
 * is never the owner). Displays the total like count and — for a signed-in real account — lets
 * them like / unlike, optimistically. Anonymous guests can see the count but tapping asks them to
 * sign in first (likes are real-account-only; see the binder_likes RLS). No-op UI in local mode.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchLikeCount, hasLiked, likeBinder, unlikeBinder } from '@/data/binderRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

export function LikeButton({
  binderId,
  onNeedsAccount,
}: {
  binderId: string;
  /** Called when a guest / signed-out visitor taps like — prompt them to sign in. */
  onNeedsAccount?: () => void;
}) {
  const { user, isSignedIn } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load the current count + (for a signed-in user) whether they've already liked.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    (async () => {
      try {
        const [c, mine] = await Promise.all([
          fetchLikeCount(binderId),
          user ? hasLiked(binderId, user.id) : Promise.resolve(false),
        ]);
        if (active) {
          setCount(c);
          setLiked(mine);
        }
      } catch {
        // Likes are decoration — a failed count just leaves the control blank.
      }
    })();
    return () => {
      active = false;
    };
  }, [binderId, user]);

  if (!isSupabaseConfigured) return null;

  const toggle = async () => {
    if (busy) return;
    if (!isSignedIn || !user) {
      onNeedsAccount?.();
      return;
    }
    // Optimistic flip; revert on failure.
    const next = !liked;
    setLiked(next);
    setCount((c) => Math.max(0, (c ?? 0) + (next ? 1 : -1)));
    setBusy(true);
    try {
      if (next) await likeBinder(binderId);
      else await unlikeBinder(binderId, user.id);
    } catch {
      if (mounted.current) {
        setLiked(!next);
        setCount((c) => Math.max(0, (c ?? 0) + (next ? -1 : 1)));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={toggle}
      accessibilityLabel={liked ? 'Unlike this binder' : 'Like this binder'}
      style={({ pressed }) => [styles.btn, liked && styles.btnLiked, pressed && styles.pressed]}>
      <Text style={[styles.heart, liked && styles.heartLiked]}>{liked ? '♥' : '♡'}</Text>
      <ThemedText type="smallBold" style={liked ? styles.countLiked : undefined}>
        {count ?? '–'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  btnLiked: { borderColor: Palette.accent },
  pressed: { opacity: 0.7 },
  heart: { fontSize: FontSize.md, lineHeight: 20, color: Palette.muted },
  heartLiked: { color: Palette.accent },
  countLiked: { color: Palette.accent, fontWeight: Weight.bold },
});
