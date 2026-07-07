/**
 * The auth modal: sign in, create an account, or upgrade a guest — and, once signed in, a
 * small profile view. Renders every method the app offers (email + password, a 6-digit email
 * code, and Google / Apple) and adapts its copy to the current state:
 *
 *  - signed in            → profile card (edit display name, sign out)
 *  - anonymous guest      → "save your binders" upgrade (email+password or link Google/Apple,
 *                           both keep the guest's binders by preserving the user id)
 *  - signed out / fresh   → full sign-in / create-account with all methods
 *
 * All Supabase calls go through the auth store (src/store/auth.tsx); this file is only UI.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radii, Radius, Spacing, Weight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth, type OAuthProvider } from '@/store/auth';

export function AuthSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const auth = useAuth();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}>
          {/* Stop backdrop taps from closing when interacting with the card. */}
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardWrap}>
            <ThemedView type="backgroundElement" style={styles.card}>
              {auth.isSignedIn ? (
                <ProfileView onClose={onClose} />
              ) : (
                <AuthForm onClose={onClose} upgrade={auth.isGuest} />
              )}
            </ThemedView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sign-in / create-account / upgrade form
// ---------------------------------------------------------------------------

type Method = 'password' | 'code';

function AuthForm({ onClose, upgrade }: { onClose: () => void; upgrade: boolean }) {
  const auth = useAuth();
  const theme = useTheme();

  const [method, setMethod] = useState<Method>('password');
  const [isCreate, setIsCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // A guest upgrade must preserve the user id, so email codes (which switch users) aren't
  // offered there — only password + OAuth linking, which keep binders.
  const allowCode = !upgrade;

  const run = async (fn: () => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.needsEmailConfirmation) {
        setInfo(`Check ${email.trim()} for a link to confirm your account.`);
        return;
      }
      onClose(); // session established — onAuthStateChange updates the app
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = () => {
    if (!email.trim() || !password) {
      setError('Enter your email and a password.');
      return;
    }
    if (upgrade) return run(() => auth.linkEmailPassword(email, password));
    if (isCreate) return run(() => auth.signUpWithPassword(email, password, displayName || undefined));
    return run(() => auth.signInWithPassword(email, password));
  };

  const submitCode = () => {
    if (!codeSent) {
      if (!email.trim()) {
        setError('Enter your email.');
        return;
      }
      return run(async () => {
        const r = await auth.sendEmailCode(email);
        if (!r.error) setCodeSent(true);
        return r;
      });
    }
    if (!code.trim()) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    return run(() => auth.verifyEmailCode(email, code));
  };

  const oauth = (provider: OAuthProvider) =>
    run(() => (upgrade ? auth.linkOAuth(provider) : auth.signInWithOAuth(provider)));

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];
  const placeholder = theme.textSecondary;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
      <View style={styles.headerRow}>
        <ThemedText type="subtitle" style={styles.heading}>
          {upgrade ? 'Save your binders' : isCreate ? 'Create account' : 'Welcome back'}
        </ThemedText>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <ThemedText type="small" themeColor="textSecondary">
            Close
          </ThemedText>
        </Pressable>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
        {upgrade
          ? 'Add a way to sign back in — your current binders come with you.'
          : 'Sign in to sync your michi binders across devices.'}
      </ThemedText>

      {/* Method switch */}
      {allowCode && (
        <View style={[styles.segment, { borderColor: theme.backgroundSelected }]}>
          {(['password', 'code'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setMethod(m);
                setError(null);
                setInfo(null);
              }}
              style={[styles.segmentBtn, method === m && { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold" themeColor={method === m ? 'text' : 'textSecondary'}>
                {m === 'password' ? 'Password' : 'Email code'}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {method === 'password' || !allowCode ? (
        <>
          <TextInput
            style={inputStyle}
            placeholder="you@example.com"
            placeholderTextColor={placeholder}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={inputStyle}
            placeholder="Password"
            placeholderTextColor={placeholder}
            secureTextEntry
            autoComplete={isCreate || upgrade ? 'new-password' : 'current-password'}
            value={password}
            onChangeText={setPassword}
          />
          {(isCreate || upgrade) && (
            <TextInput
              style={inputStyle}
              placeholder="Display name (optional)"
              placeholderTextColor={placeholder}
              value={displayName}
              onChangeText={setDisplayName}
            />
          )}
          <PrimaryButton
            label={upgrade ? 'Create account' : isCreate ? 'Create account' : 'Sign in'}
            busy={busy}
            onPress={submitPassword}
          />
          {!upgrade && (
            <Pressable onPress={() => setIsCreate((v) => !v)} style={styles.switchRow}>
              <ThemedText type="small" themeColor="textSecondary">
                {isCreate ? 'Already have an account? ' : "New here? "}
                <ThemedText type="smallBold" style={{ color: Palette.accent }}>
                  {isCreate ? 'Sign in' : 'Create one'}
                </ThemedText>
              </ThemedText>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <TextInput
            style={inputStyle}
            placeholder="you@example.com"
            placeholderTextColor={placeholder}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!codeSent}
            value={email}
            onChangeText={setEmail}
          />
          {codeSent && (
            <TextInput
              style={[inputStyle, styles.codeInput]}
              placeholder="123456"
              placeholderTextColor={placeholder}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
          )}
          <PrimaryButton
            label={codeSent ? 'Verify code' : 'Email me a code'}
            busy={busy}
            onPress={submitCode}
          />
          {codeSent && (
            <Pressable onPress={() => setCodeSent(false)} style={styles.switchRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Use a different email
              </ThemedText>
            </Pressable>
          )}
        </>
      )}

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
        <ThemedText type="small" themeColor="textSecondary">
          or
        </ThemedText>
        <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
      </View>

      <OAuthButton label="Continue with Google" onPress={() => oauth('google')} disabled={busy} />
      <OAuthButton label="Continue with Apple" onPress={() => oauth('apple')} disabled={busy} />

      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
      {info && (
        <ThemedText type="small" style={styles.info}>
          {info}
        </ThemedText>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Profile (signed in)
// ---------------------------------------------------------------------------

function ProfileView({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const theme = useTheme();
  const [displayName, setDisplayName] = useState(auth.profile?.display_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const email = auth.user?.email ?? '';
  const initial = (auth.profile?.display_name || email || '?').trim().charAt(0).toUpperCase();

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const r = await auth.updateProfile({ display_name: displayName.trim() || null });
    setBusy(false);
    if (r.error) setError(r.error);
    else setSaved(true);
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
      <View style={styles.headerRow}>
        <ThemedText type="subtitle" style={styles.heading}>
          Account
        </ThemedText>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <ThemedText type="small" themeColor="textSecondary">
            Close
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.profileRow}>
        <View style={[styles.avatar, { backgroundColor: Palette.accent }]}>
          <ThemedText style={styles.avatarText}>{initial}</ThemedText>
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {auth.profile?.display_name || 'Collector'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {email || 'Signed in'}
          </ThemedText>
        </View>
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        Display name
      </ThemedText>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        placeholder="Your name"
        placeholderTextColor={theme.textSecondary}
        value={displayName}
        onChangeText={(t) => {
          setDisplayName(t);
          setSaved(false);
        }}
      />
      <PrimaryButton label={saved ? 'Saved' : 'Save'} busy={busy} onPress={save} />

      <Pressable
        onPress={async () => {
          await auth.signOut();
          onClose();
        }}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <ThemedText type="smallBold" style={styles.signOutText}>
          Sign out
        </ThemedText>
      </Pressable>

      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

function PrimaryButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && styles.pressed]}>
      {busy ? (
        <ActivityIndicator color={Palette.accentText} />
      ) : (
        <ThemedText style={styles.primaryBtnText}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

function OAuthButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.oauthBtn,
        { borderColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Palette.scrim45,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 420,
  },
  card: {
    borderRadius: Radii.page,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  form: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: { fontSize: 24, lineHeight: 30 },
  sub: { marginTop: -Spacing.two },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Radii.slot,
    padding: 2,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    borderRadius: Radii.slotSmall + 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.slot,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: FontSize.md,
  },
  codeInput: {
    letterSpacing: 6,
    fontSize: FontSize.title,
    textAlign: 'center',
  },
  switchRow: { alignItems: 'center', paddingVertical: Spacing.one },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.one,
  },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  primaryBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.md },
  oauthBtn: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  error: { color: Palette.danger, lineHeight: 20 },
  info: { color: Palette.success, lineHeight: 20 },
  flex: { flex: 1 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.lg },
  label: { marginBottom: -Spacing.two },
  signOut: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  signOutText: { color: Palette.danger },
});
