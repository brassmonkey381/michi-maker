/**
 * The auth modal: sign in, create an account, or upgrade a guest — and, once signed in, a
 * small profile view. Renders every method the app offers (email + password, a 6-digit email
 * code, and Google) and adapts its copy to the current state:
 *
 *  - signed in            → profile card (edit display name, sign out)
 *  - anonymous guest      → "save your binders" upgrade (email+password or link Google,
 *                           both keep the guest's binders by preserving the user id)
 *  - signed out / fresh   → full sign-in / create-account with all methods
 *
 * All Supabase calls go through the auth store (src/store/auth.tsx); this file is only UI.
 */

import { Image } from 'expo-image';
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
import { providerAvatarUrl, withAvatarOfferAccepted } from '@/data/avatarConsent';
import { pruneAvatars, uploadAvatarImage } from '@/lib/uploadAvatar';
import { useAuth, type OAuthProvider } from '@/store/auth';
import type { Profile } from '@/types/domain';

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
      onClose(); // session established, onAuthStateChange updates the app
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
        const r = await auth.linkEmailPassword(email, password, uname);
        if (r.error) {
          setError(r.error);
          return;
        }
      } else {
        const r = await auth.signUpWithPassword(email, password, uname);
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.needsEmailConfirmation) {
          setInfo(`Check ${email.trim()} to confirm your account — @${uname} is set up the moment you do.`);
          return; // no session yet; the gate claims the name from the account's metadata on first load
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
  // Product email. Opt-OUT since 2026-08-24: accounts are enrolled by default and this is how
  // someone leaves without waiting for a message to arrive. Writing 'settings' as the source is
  // what separates a real yes from an enrolment, and that distinction is the only defensible
  // audience for an EU send. The privacy policy promises this switch by name.
  const [emailOptIn, setEmailOptIn] = useState<boolean | null>(null);
  const marketingOn = emailOptIn ?? auth.profile?.marketing_consent ?? false;
  const toggleMarketing = (v: boolean) => {
    setEmailOptIn(v);
    void auth
      .updateProfile({
        marketing_consent: v,
        marketing_consent_source: v ? 'settings' : 'settings_off',
      })
      .then((r) => {
        if (r.error) setEmailOptIn(!v);
      });
  };

  const email = auth.user?.email ?? '';
  const username = auth.profile?.username ?? null;
  const initial = (username || email || '?').trim().charAt(0).toUpperCase();
  const avatarUrl = auth.profile?.avatar_url ?? null;
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // Web-only picker, built imperatively so this shared file needs no .web variant: the app ships
  // web-only, and on native the control simply does not render (same posture as ArtUploadButton).
  const pickAvatar = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || avatarBusy) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setAvatarBusy(true);
      setAvatarError(null);
      uploadAvatarImage(file, file.name)
        .then(async (url) => {
          const r = await auth.updateProfile({
            avatar_url: url,
            // Picking a file IS the consent, and the audit of who has a photo reads this column.
            avatar_consented_at: new Date().toISOString(),
            preferences: withAvatarOfferAccepted(auth.profile?.preferences) as Profile['preferences'],
          });
          if (r.error) setAvatarError(r.error);
          // Old files go only after the row points at the new one.
          else void pruneAvatars(url);
        })
        .catch((e) => setAvatarError((e as Error).message))
        .finally(() => setAvatarBusy(false));
    };
    input.click();
  };
  // The photo the account signed in with, still sitting in the auth session where the provider
  // put it. Offered here as a one-tap alternative to picking a file, which is also the way back
  // for anyone who declined the consent prompt: a permanent "no thanks" has to be reversible by
  // the person who said it, or it is a trap rather than a choice.
  const providerPhoto = providerAvatarUrl(auth.user?.user_metadata);
  const useProviderPhoto = () => {
    if (!providerPhoto || avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError(null);
    // Re-hosted rather than linked: profiles.avatar_url is CHECK-constrained to our own bucket,
    // and a provider URL in a public column is a hotlink to bytes we do not hold.
    fetch(providerPhoto)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("That photo could not be loaded."))))
      .then((blob) => uploadAvatarImage(blob, 'profile-photo'))
      .then(async (url) => {
        const r = await auth.updateProfile({
          avatar_url: url,
          avatar_consented_at: new Date().toISOString(),
          preferences: withAvatarOfferAccepted(auth.profile?.preferences) as Profile['preferences'],
        });
        if (r.error) setAvatarError(r.error);
        else void pruneAvatars(url);
      })
      .catch((e) => setAvatarError((e as Error).message))
      .finally(() => setAvatarBusy(false));
  };
  // The bio. Draft-then-save rather than save-per-keystroke: a 280-char field written live would
  // hammer the profiles row and flash half-sentences to anyone on the public page.
  const [bioDraft, setBioDraft] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const savedBio = auth.profile?.bio ?? '';
  const bio = bioDraft ?? savedBio;
  const bioDirty = bio !== savedBio;
  const saveBio = () => {
    if (!bioDirty || bioBusy) return;
    setBioBusy(true);
    const saving = bio;
    void auth
      .updateProfile({ bio: saving.trim() || null })
      .then((r) => {
        // Only settle the draft if nothing was typed while the save was in flight; a newer
        // draft stays dirty and saveable rather than being silently thrown away.
        if (!r.error) setBioDraft((cur) => (cur === saving ? null : cur));
      })
      .finally(() => setBioBusy(false));
  };
  // Sharing default. The account-level rights attestation lives here for anyone who said "not
  // now" to the RightsPrompt: same checkbox, same effect (new binders start public). There is no
  // un-accept, because the attestation is a statement of fact about rights, not a preference;
  // individual binders go private from Share.
  const attestedAt = auth.profile?.rights_attested_at ?? null;
  const [shareChecked, setShareChecked] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const acceptSharing = () => {
    if (!shareChecked || shareBusy || !auth.profile?.username) return;
    setShareBusy(true);
    void auth
      .updateProfile({ rights_attested_at: new Date().toISOString() })
      .finally(() => setShareBusy(false));
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
        <Pressable
          onPress={pickAvatar}
          disabled={Platform.OS !== 'web' || avatarBusy}
          accessibilityRole="button"
          accessibilityLabel="Change avatar">
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: Palette.accent }]}>
              <ThemedText style={styles.avatarText}>{initial}</ThemedText>
            </View>
          )}
        </Pressable>
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {username ? `@${username}` : 'Collector'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {email || 'Signed in'}
          </ThemedText>
        </View>
        {Platform.OS === 'web' ? (
          <Pressable onPress={pickAvatar} disabled={avatarBusy} hitSlop={6}>
            <ThemedText type="small" style={styles.avatarChange}>
              {avatarBusy ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add photo'}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {avatarError ? (
        <ThemedText type="small" style={styles.error}>
          {avatarError}
        </ThemedText>
      ) : null}
      {/* Only when there is nothing on the profile: with a photo already set, "Change photo"
          covers it and this would just be a second button doing nearly the same thing. */}
      {Platform.OS === 'web' && providerPhoto && !avatarUrl ? (
        <Pressable onPress={useProviderPhoto} disabled={avatarBusy} hitSlop={6}>
          <ThemedText type="small" style={styles.avatarChange}>
            Use the photo from my sign-in account
          </ThemedText>
        </Pressable>
      ) : null}

      {/* The bio: the profile page's one block of self-description. Shown on /u/[id] when the
          profile is public, and reportable there like any other user content. */}
      <View style={styles.bioBlock}>
        <View style={styles.bioHead}>
          <ThemedText type="smallBold">About you</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {bio.length}/280
          </ThemedText>
        </View>
        <TextInput
          value={bio}
          onChangeText={(t) => setBioDraft(t.slice(0, 280))}
          placeholder="Tell collectors what you collect, trade, or build."
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={280}
          style={[styles.bioInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        {bioDirty ? (
          <Pressable
            onPress={saveBio}
            disabled={bioBusy}
            style={({ pressed }) => [styles.bioSave, (bioBusy || pressed) && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.bioSaveText}>
              {bioBusy ? 'Saving…' : 'Save bio'}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {username && auth.user ? (
        <Pressable
          onPress={() => {
            onClose();
            // The username, not the id: this link only renders when one exists, and it is what
            // the address bar should show when the owner previews their own page.
            router.push(`/u/${username}` as Href);
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

      <View style={styles.privacyBlock}>
        <ThemedText type="smallBold">Sharing</ThemedText>
        {attestedAt ? (
          <ThemedText type="small" themeColor="textSecondary">
            On. New binders start out public; make any binder private from Share. Accepted{' '}
            {new Date(attestedAt).toLocaleDateString()}.
          </ThemedText>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Turn sharing on and new binders start out public, so they can be discovered, liked,
              and entered in contests. You can make any binder private from Share.
            </ThemedText>
            <Pressable
              onPress={() => setShareChecked((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: shareChecked }}
              style={styles.attestRow}
              hitSlop={4}>
              <View style={[styles.attestBox, shareChecked && styles.attestBoxOn]}>
                {shareChecked ? <ThemedText style={styles.attestTick}>✓</ThemedText> : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.attestLabel}>
                I own, created, or have the rights to the art I put in binders I share, and I
                agree to the Terms of Service. I understand I am responsible for what I share.
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={acceptSharing}
              disabled={!shareChecked || shareBusy}
              style={({ pressed }) => [
                styles.bioSave,
                (!shareChecked || shareBusy || pressed) && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={styles.bioSaveText}>
                {shareBusy ? 'Turning on…' : 'Turn on sharing'}
              </ThemedText>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.privacyRow}>
        <View style={styles.privacyText}>
          <ThemedText type="smallBold">Product email</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {marketingOn
              ? 'Occasional email about new features and your plan. Account email always arrives.'
              : 'Off. You will only get account email: sign-in, receipts, and plan notices.'}
          </ThemedText>
        </View>
        <Switch
          value={marketingOn}
          onValueChange={toggleMarketing}
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
    overflow: 'hidden',
  },
  avatarChange: { color: Palette.accent, fontWeight: Weight.semibold },
  bioBlock: { gap: Spacing.two },
  bioHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  bioInput: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: Radius.control,
    padding: Spacing.two,
    fontSize: FontSize.sm,
    textAlignVertical: 'top',
  },
  bioSave: {
    alignSelf: 'flex-end',
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  bioSaveText: { color: Palette.accentText },
  privacyBlock: { gap: Spacing.two },
  attestRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  attestBox: {
    width: 18,
    height: 18,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  attestBoxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  attestTick: { color: Palette.accentText, fontSize: 12, fontWeight: Weight.bold, lineHeight: 14 },
  attestLabel: { flex: 1, lineHeight: 18 },
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
