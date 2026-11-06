/**
 * The account entry point shown in the page header (home, my binders). Renders an avatar when signed in, or a
 * "Sign in" pill for guests / signed-out users, and opens the AuthSheet on press. Hidden
 * entirely in local mode (no Supabase configured).
 */

import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

/**
 * `compact`: the phone home page (owner, 2026-11-06) keeps the pill on one row with People and
 * Settings, so a guest's door is the two-word call to action; the sheet still opens on Create
 * account with Sign in a tap away.
 */
export function AccountButton({ compact = false }: { compact?: boolean } = {}) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);

  if (!isSupabaseConfigured) return null;
  // Wait for auth to settle so a signed-in visitor never sees a "Sign in" flash. After that the
  // pill is always there for anyone without an account (no session, or a guest session), even
  // where the home guest banner also offers one: the top right is where people look for it.
  if (!auth.ready) return null;

  const initial = (auth.profile?.username || auth.user?.email || '?')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Account"
        style={({ pressed }) => pressed && styles.pressed}>
        {auth.isSignedIn ? (
          auth.profile?.avatar_url ? (
            <Image
              source={{ uri: auth.profile.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: Palette.accent }]}>
              <ThemedText style={styles.avatarText}>{initial}</ThemedText>
            </View>
          )
        ) : (
          // A guest's pill is the page's main call to action (owner, 2026-10-29), so it is sized
          // like one; a signed-out visitor's Sign in stays the quiet chip it was.
          <View style={[styles.pill, auth.isGuest && !compact && styles.pillBig]}>
            <ThemedText type="smallBold" style={[styles.pillText, auth.isGuest && !compact && styles.pillTextBig]}>
              {/* Both doors in one pill (owner, 2026-11-02): a returning member who landed as a
                  guest was reading "Create account" and not finding their way in. */}
              {auth.isGuest ? (compact ? 'Sign up' : 'Create account or sign in') : 'Sign in'}
            </ThemedText>
          </View>
        )}
      </Pressable>

      <AuthSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.md },
  pill: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  pillBig: { paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.four },
  pillText: { color: Palette.accentText },
  pillTextBig: { fontSize: FontSize.control },
});
