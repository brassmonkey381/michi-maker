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

import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
                <AuthForm onClose={onClose} isGuest={auth.isGuest} />
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

function AuthForm({ onClose, isGuest }: { onClose: () => void; isGuest: boolean }) {
  const auth = useAuth();
  const theme = useTheme();

  const [method, setMethod] = useState<Method>('password');
  const [isCreate, setIsCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Creating an account *as a guest* links to the current id to keep binders, and email codes
  // switch users (losing them) — so hide the code method only in that one case. Signing in
  // (existing account) always allows the code method.
  const allowCode = !(isCreate && isGuest);

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
    if (!isCreate) {
      return run(() => auth.signInWithPassword(email, password)); // sign in to an existing account
    }
    // Creating an account requires a permanent @username.
    const uname = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
      setError('Pick a username: 3–20 characters, lowercase letters, numbers, or underscores.');
      return;
    }
    void createWithUsername(uname);
  };

  // Create the account (guests link to keep binders; signed-out users make a fresh one), then claim
  // the username. If the username turns out to be taken, the account still exists, so we close and
  // let the app-wide UsernameGate prompt for a different one rather than stranding a half-made state.
  const createWithUsername = async (uname: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (isGuest) {
        const r = await auth.linkEmailPassword(email, password);
        if (r.error) {
          setError(r.error);
          return;
        }
      } else {
        const r = await auth.signUpWithPassword(email, password);
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.needsEmailConfirmation) {
          setInfo(`Check ${email.trim()} to confirm your account. You’ll set @${uname} right after.`);
          return; // no session yet; the gate claims the username once they confirm + sign in
        }
      }
      // A session exists now → claim the username, then close (gate re-prompts if it was taken).
      const c = await auth.claimUsername(uname);
      if (c.error) setError(c.error);
      onClose();
    } finally {
      setBusy(false);
    }
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
    run(() => (isCreate && isGuest ? auth.linkOAuth(provider) : auth.signInWithOAuth(provider)));

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];
  const placeholder = theme.textSecondary;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
      <View style={styles.headerRow}>
        <ThemedText type="subtitle" style={styles.heading}>
          {isCreate ? 'Create account' : 'Welcome back'}
        </ThemedText>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <ThemedText type="small" themeColor="textSecondary">
            Close
          </ThemedText>
        </Pressable>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
        {isCreate
          ? isGuest
            ? 'The binders you’ve made come with you.'
            : 'Create an account to sync your binders across devices.'
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
            autoComplete={isCreate ? 'new-password' : 'current-password'}
            value={password}
            onChangeText={setPassword}
          />
          {isCreate && (
            <TextInput
              style={inputStyle}
              placeholder="username (permanent)"
              placeholderTextColor={placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              value={username}
              onChangeText={setUsername}
            />
          )}
          <PrimaryButton
            label={isCreate ? 'Create account' : 'Sign in'}
            busy={busy}
            onPress={submitPassword}
          />
          <Pressable onPress={() => setIsCreate((v) => !v)} style={styles.switchRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {isCreate ? 'Already have an account? ' : 'New here? '}
              <ThemedText type="smallBold" style={{ color: Palette.accent }}>
                {isCreate ? 'Sign in' : 'Create one'}
              </ThemedText>
            </ThemedText>
          </Pressable>
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

      {/* When there's no session at all (signed out), let the user keep building without an
          account. Guests are already in a session, so they don't need this. */}
      {!isGuest && (
        <Pressable
          onPress={() =>
            run(async () => {
              const r = await auth.continueAsGuest();
              return r;
            })
          }
          style={styles.switchRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Just exploring?{' '}
            <ThemedText type="smallBold" style={{ color: Palette.accent }}>
              Continue as a guest
            </ThemedText>
          </ThemedText>
        </Pressable>
      )}

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
  const router = useRouter();
  const theme = useTheme();
  // Optimistic mirror of the profile's public flag so the switch responds instantly.
  const [publicProfile, setPublicProfile] = useState<boolean | null>(null);
  const profilePublic = publicProfile ?? auth.profile?.is_public ?? true;
  const toggleProfilePublic = (v: boolean) => {
    setPublicProfile(v);
    void auth.updateProfile({ is_public: v }).then((r) => {
      if (r.error) setPublicProfile(!v); // revert on failure
    });
  };

  const email = auth.user?.email ?? '';
  const username = auth.profile?.username ?? null;
  const initial = (username || email || '?').trim().charAt(0).toUpperCase();

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
            {username ? `@${username}` : 'Collector'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {email || 'Signed in'}
          </ThemedText>
        </View>
      </View>

      {username && auth.user ? (
        <Pressable
          onPress={() => {
            onClose();
            router.push(`/u/${auth.user!.id}` as Href);
          }}
          style={({ pressed }) => [styles.profileLink, pressed && styles.pressed]}>
          <ThemedText type="small">View public profile</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            ›
          </ThemedText>
        </Pressable>
      ) : null}

      <View style={styles.privacyRow}>
        <View style={styles.privacyText}>
          <ThemedText type="smallBold">Public profile</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {profilePublic
              ? 'Your public binders can be shared and featured.'
              : 'Private: every one of your binders is hidden from everyone but you.'}
          </ThemedText>
        </View>
        <Switch
          value={profilePublic}
          onValueChange={toggleProfilePublic}
          trackColor={{ true: Palette.accent, false: theme.backgroundSelected }}
        />
      </View>

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
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  privacyText: { flex: 1, gap: 2 },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
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
  readonlyField: { gap: 2 },
  signOut: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  signOutText: { color: Palette.danger },
});
