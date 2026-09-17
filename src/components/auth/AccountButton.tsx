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

export function AccountButton() {
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
          <View style={styles.pill}>
            <ThemedText type="smallBold" style={styles.pillText}>
              Sign in
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
  pillText: { color: Palette.accentText },
});
