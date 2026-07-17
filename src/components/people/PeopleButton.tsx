/**
 * Home-header entry point for finding people. A person icon that opens the People search window.
 * Hidden in local mode (no Supabase → no profiles to search). Owns the window's open state.
 */
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { PeopleSearch } from '@/components/people/PeopleSearch';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Spacing } from '@/constants/theme';
import { isSupabaseConfigured } from '@/lib/env';

export function PeopleButton() {
  const [open, setOpen] = useState(false);
  if (!isSupabaseConfigured) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Find people"
        hitSlop={8}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
        <ThemedText style={styles.icon}>People</ThemedText>
      </Pressable>
      <PeopleSearch visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  btn: { padding: Spacing.one },
  pressed: { opacity: 0.7 },
  icon: { fontSize: FontSize.control, fontWeight: '600', lineHeight: 28 },
});
