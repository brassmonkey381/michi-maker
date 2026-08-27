/**
 * "This is the photo we had. Do you want it on your profile?"
 *
 * WHY THIS EXISTS. Signing in with Google used to copy the provider's photo into
 * public.profiles.avatar_url. For a year nothing rendered it; when profile pages started to, that
 * dormant column became publication of a personal photograph nobody had been asked about. Twelve
 * accounts. Migration 20260826140000 withdrew all of them the same day, which stopped the
 * publication but also left twelve people with a face-shaped hole and no say in it. This is the
 * say: shown on the next sign-in, once, with the actual photo visible so the answer is informed.
 *
 * IT SHOWS THE PHOTO. Rendering it here is not publishing it: the image is fetched by the owner's
 * own browser from the provider that already holds it, exactly as their Google account page does.
 * Consenting to something you cannot see is not consent.
 *
 * ACCEPTING RE-HOSTS IT. profiles.avatar_url is CHECK-constrained to our own avatars bucket, so
 * the bytes are fetched and uploaded before the row is written. Same rule as binder art: we do not
 * serve bytes we do not hold, and a provider URL in a public column is a hotlink to a third party
 * that can change or vanish under us.
 *
 * GENERATED MONOGRAMS ARE NEVER OFFERED. Four of the twelve were Google's coloured-circle initial,
 * not a photograph; asking permission to publish a letter in a circle we already draw ourselves is
 * a dialog for nothing. Those are detected from the fetched bytes and skipped silently, without
 * being recorded as a showing.
 *
 * TWO KINDS OF NO. "No thanks" is an answer, recorded for good (Account settings keeps offering
 * the photo for anyone who changes their mind). Closing the dialog is not an answer, and it comes
 * back after seven days. avatarConsent.ts holds both rules, with tests.
 */
import { Image } from 'expo-image';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  avatarOfferDue,
  isGeneratedAvatar,
  providerAvatarUrl,
  withAvatarOfferAccepted,
  withAvatarOfferDeclined,
} from '@/data/avatarConsent';
import { isSupabaseConfigured } from '@/lib/env';
import { endTurn, takeTurn } from '@/lib/promptQueue';
import { pruneAvatars, uploadAvatarImage } from '@/lib/uploadAvatar';
import { useAuth } from '@/store/auth';
import type { Profile } from '@/types/domain';

const SLOT = 'avatar-consent';

export function AvatarConsentPrompt() {
  const auth = useAuth();
  const [photo, setPhoto] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One offer per mount. The first thing showing the dialog does is stamp avatar_prompt_at, which
  // re-renders the profile; without this the effect would re-evaluate the state it just changed.
  const offeredRef = useRef(false);

  const providerUrl = providerAvatarUrl(auth.user?.user_metadata);
  /** The conditions for offering, shared by the claim below and the fetch that follows it. */
  const due = isSupabaseConfigured && auth.ready && auth.isSignedIn && !!providerUrl
    && avatarOfferDue(auth.profile, providerUrl);

  // THE TURN IS TAKEN IN A LAYOUT EFFECT, deliberately. Both uninvited dialogs become due in the
  // same commit (both wait on the same profile load), so whichever effect React happened to run
  // first was winning, and a browser run could go either way. Layout effects for the WHOLE tree
  // flush before any passive effect, so claiming here settles the order without depending on
  // where each prompt sits in the tree. The photo question goes first because it is a privacy
  // remediation we owe these accounts; the sharing question has its own seven-day cadence and
  // loses nothing by waiting for this dialog to close.
  useLayoutEffect(() => {
    if (offeredRef.current || photo || !due) return;
    takeTurn(SLOT);
  }, [due, photo]);

  useEffect(() => {
    if (offeredRef.current || photo || !due || !providerUrl) return;
    // Re-claiming our own turn from the layout effect above; false here means the rights
    // attestation got there first (it became due in an earlier commit) and this waits for it to
    // close, not for the next visit.
    if (!takeTurn(SLOT)) return;
    offeredRef.current = true;

    let alive = true;
    // Fetch before showing: the bytes tell us whether this is a real photograph or the provider's
    // generated monogram, and accepting needs them anyway. A failed fetch shows nothing and
    // records nothing, so the offer is simply made again next launch.
    void fetch(providerUrl)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (!alive) return;
        if (isGeneratedAvatar(blob)) {
          endTurn(SLOT);
          return;
        }
        // On screen now, so the rights attestation waits for this to CLOSE rather than for the
        // next visit: both prompts are allowed in one visit, just never at the same time.
        setPhoto({ url: providerUrl, blob });
        // Recorded whatever they answer, so a second device honours the same seven-day gap.
        void auth.updateProfile({ avatar_prompt_at: new Date().toISOString() });
      })
      .catch(() => {
        offeredRef.current = false;
        endTurn(SLOT);
      });
    return () => {
      alive = false;
    };
  }, [auth, due, providerUrl, photo]);

  // Give the turn back on unmount, or a navigation away mid-dialog would strand it and silence
  // the rights prompt for the rest of the session.
  useEffect(() => () => endTurn(SLOT), []);

  if (!photo) return null;

  const close = () => {
    endTurn(SLOT);
    setPhoto(null);
  };

  const accept = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    uploadAvatarImage(photo.blob, 'profile-photo')
      .then(async (hosted) => {
        const r = await auth.updateProfile({
          avatar_url: hosted,
          avatar_consented_at: new Date().toISOString(),
          // Lift any earlier "no thanks", so the record matches the answer that stands.
          preferences: withAvatarOfferAccepted(auth.profile?.preferences) as Profile['preferences'],
        });
        if (r.error) {
          setError(r.error);
          return;
        }
        void pruneAvatars(hosted); // only after the row points at the new file
        close();
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  };

  const decline = () => {
    if (busy) return;
    setBusy(true);
    // Written before closing so the answer survives a reload that beats the request home; the
    // dialog closes either way, because re-asking someone who just said no is the failure mode.
    void auth
      .updateProfile({
        preferences: withAvatarOfferDeclined(
          auth.profile?.preferences,
          new Date().toISOString(),
        ) as Profile['preferences'],
      })
      .finally(() => {
        setBusy(false);
        close();
      });
  };

  return (
    <DialogCard visible title="Your profile photo" onClose={close} maxWidth={420}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        When you signed in with Google we copied your account photo across, and for a while it was
        showing on your public profile. We have taken it down, because we never asked you. Here it
        is: put it back on your profile, or leave it off.
      </ThemedText>
      <View style={styles.photoRow}>
        <Image source={{ uri: photo.url }} style={styles.photo} contentFit="cover" />
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          Shown next to your binders and on your public profile. You can change or remove it any
          time in Account settings.
        </ThemedText>
      </View>
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
      <Pressable
        onPress={accept}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.acceptBtn, (busy || pressed) && styles.dim]}>
        {busy ? (
          <ActivityIndicator color={Palette.accentText} />
        ) : (
          <ThemedText type="smallBold" style={styles.acceptText}>
            Use this photo
          </ThemedText>
        )}
      </Pressable>
      <Pressable onPress={decline} disabled={busy} hitSlop={6} style={styles.later}>
        <ThemedText type="small" themeColor="textSecondary">
          No thanks. Keep my profile without a photo.
        </ThemedText>
      </Pressable>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  body: { lineHeight: 20 },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  photo: { width: 72, height: 72, borderRadius: Radius.pill, overflow: 'hidden' },
  caption: { flex: 1, lineHeight: 18 },
  error: { color: Palette.danger, lineHeight: 20, marginTop: Spacing.two },
  acceptBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    marginTop: Spacing.three,
  },
  acceptText: { color: Palette.accentText, fontSize: FontSize.sm, fontWeight: Weight.bold },
  dim: { opacity: 0.5 },
  later: { alignSelf: 'center', marginTop: Spacing.two },
});
