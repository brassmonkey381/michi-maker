/**
 * Username gate. A real (non-guest) account MUST have a permanent @username. Any signed-in account
 * that doesn't yet have one gets this blocking, non-dismissible prompt before it can use the app —
 * so a username is required at sign-up across every method (password, email code, Google/Apple).
 * Usernames are immutable once set (enforced in the DB), so this is shown exactly once per account.
 * Guests and signed-out users never see it. No-op in local mode.
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { isSupabaseConfigured } from '@/lib/env';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth';

const RULE = /^[a-z0-9_]{3,20}$/;

export function UsernameGate() {
  const { isSignedIn, profile, claimUsername } = useAuth();
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only a real account that has no username yet. (profile null while it loads → don't flash.)
  const needsUsername = isSupabaseConfigured && isSignedIn && !!profile && !profile.username;
  if (!needsUsername) return null;

  const normalized = value.trim().toLowerCase();
  const valid = RULE.test(normalized);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await claimUsername(normalized);
    setBusy(false);
    if (r.error) setError(r.error);
    // On success the profile now has a username → this gate unmounts itself.
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.cardWrap}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle" style={styles.title}>
              Pick your username
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
              This is your permanent @handle — how other collectors find you. It can’t be changed
              later, so choose carefully.
            </ThemedText>

            <View style={[styles.inputRow, { borderColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.at}>
                @
              </ThemedText>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="username"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={20}
                value={value}
                onChangeText={(t) => {
                  setValue(t);
                  setError(null);
                }}
                onSubmitEditing={submit}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              3–20 characters: lowercase letters, numbers, or underscores.
            </ThemedText>

            <Pressable
              onPress={submit}
              disabled={!valid || busy}
              style={({ pressed }) => [
                styles.btn,
                (!valid || busy) && styles.btnDisabled,
                pressed && styles.pressed,
              ]}>
              {busy ? (
                <ActivityIndicator color={Palette.accentText} />
              ) : (
                <ThemedText style={styles.btnText}>Claim username</ThemedText>
              )}
            </Pressable>

            {error ? (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}
          </ThemedView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  cardWrap: { width: '100%', maxWidth: 400 },
  card: { borderRadius: Radii.page, padding: Spacing.four, gap: Spacing.three },
  title: { fontSize: FontSize.h2, lineHeight: 26 },
  sub: { lineHeight: 20 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.slot,
    paddingHorizontal: Spacing.three,
  },
  at: { fontSize: FontSize.md },
  input: { flex: 1, paddingVertical: Spacing.two + 2, paddingLeft: 2, fontSize: FontSize.md },
  hint: {},
  btn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.md },
  pressed: { opacity: 0.7 },
  error: { color: Palette.danger, lineHeight: 20 },
});
