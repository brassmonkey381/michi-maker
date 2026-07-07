/**
 * The account entry point shown in the home header. Renders an avatar when signed in, or a
 * "Sign in" pill for guests / signed-out users, and opens the AuthSheet on press. Hidden
 * entirely in local mode (no Supabase configured).
 */

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

  const initial = (auth.profile?.display_name || auth.user?.email || '?')
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
          <View style={[styles.avatar, { backgroundColor: Palette.accent }]}>
            <ThemedText style={styles.avatarText}>{initial}</ThemedText>
          </View>
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
  avatarText: { color: Palette.white, fontWeight: Weight.bold, fontSize: FontSize.md },
  pill: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  pillText: { color: Palette.white },
});
