/**
 * The one-time, account-level rights attestation, offered where sharing starts mattering.
 *
 * WHY ACCOUNT-LEVEL. Binders default public for attested, signed-in accounts (guests never).
 * The old per-binder checkbox asked the same legal question on every share and recorded the
 * answer nowhere; this asks once, early, and persists the acceptance on the profile
 * (rights_attested_at, migration 20260826120000), which is also what makes it usable as
 * evidence that the user affirmed rights before anything of theirs went public.
 *
 * CADENCE, so it never becomes a nag: shown when the user opens an editable binder with no
 * attestation on file, at most once every 7 days, with the last showing persisted on the
 * profile (rights_prompt_at) so a second device does not re-ask what the first just asked.
 * The first binder a new account creates therefore triggers the first showing. Declining is
 * a real answer: binders stay private-by-default and Settings carries the same acceptance
 * for whenever they change their mind.
 *
 * ACCEPTING also makes the binder IN HAND public (when nothing in it is private art), because
 * the prompt rides on a binder the user is looking at, and "sharing is on, but the binder you
 * accepted it over stays hidden" reads as the switch not working. Existing OTHER binders are
 * untouched: acceptance changes the default going forward, never the past.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { privateArtInBinder } from '@/data/artAttributionCheck';
import type { DemoBinder } from '@/data/binderTypes';
import { rightsPromptDue } from '@/data/sharingDefaults';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

export function RightsPrompt({ binder }: { binder: DemoBinder }) {
  const auth = useAuth();
  const store = useBinders();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  // One showing per mount, whatever the profile row does afterwards: writing rights_prompt_at
  // re-renders the profile, and without this the effect would immediately re-evaluate a state
  // it just changed.
  const shownRef = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- open-once-on-conditions, same as u/[id] */
  useEffect(() => {
    if (shownRef.current || open) return;
    if (!auth.ready || !auth.isSignedIn) return; // guests are never asked
    if (binder.isDemo || binder.isExample) return;
    if (!rightsPromptDue(auth.profile)) return;
    shownRef.current = true;
    setOpen(true);
    // Record the showing whether or not they accept, so every surface honours the 7-day gap.
    void auth.updateProfile({ rights_prompt_at: new Date().toISOString() });
  }, [auth, binder.isDemo, binder.isExample, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const accept = () => {
    if (!checked || busy) return;
    setBusy(true);
    void auth
      .updateProfile({ rights_attested_at: new Date().toISOString() })
      .then((r) => {
        if (r.error) return;
        // The binder they accepted over goes public too, unless something in it is private art
        // (copied from another binder). New binders default public from here on.
        if (!binder.isPublic && privateArtInBinder(binder).length === 0) {
          store.updateBinder(binder.id, { isPublic: true });
        }
        setOpen(false);
      })
      .finally(() => setBusy(false));
  };

  return (
    <DialogCard visible title="Share your binders" onClose={() => setOpen(false)} maxWidth={420}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        michi-maker is better when binders are shared: they can be discovered, liked, and entered
        in contests. Turn sharing on and new binders start out public
        {!binder.isPublic && privateArtInBinder(binder).length === 0 ? ', this one included' : ''}.
        You can make any binder private from Share, any time.
      </ThemedText>
      <Pressable
        onPress={() => setChecked((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={styles.attestRow}
        hitSlop={4}>
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked ? <Text style={styles.checkTick}>✓</Text> : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.attestText}>
          I own, created, or have the rights to the art I put in binders I share, and I agree to
          the Terms of Service. I understand I am responsible for what I share.
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={accept}
        disabled={!checked || busy}
        style={({ pressed }) => [styles.acceptBtn, (!checked || busy || pressed) && styles.dim]}>
        <ThemedText type="smallBold" style={styles.acceptText}>
          {busy ? 'Turning on…' : 'Turn on sharing'}
        </ThemedText>
      </Pressable>
      <Pressable onPress={() => setOpen(false)} hitSlop={6} style={styles.later}>
        <ThemedText type="small" themeColor="textSecondary">
          Not now. Binders stay private; you can turn this on in Account settings.
        </ThemedText>
      </Pressable>
    </DialogCard>
  );
}

const styles = StyleSheet.create({
  body: { lineHeight: 20 },
  attestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: Radius.xs,
    borderWidth: 1.5,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  checkTick: { color: Palette.accentText, fontSize: 12, fontWeight: Weight.bold, lineHeight: 14 },
  attestText: { flex: 1, lineHeight: 18 },
  acceptBtn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    marginTop: Spacing.three,
  },
  acceptText: { color: Palette.accentText },
  dim: { opacity: 0.5 },
  later: { alignSelf: 'center', marginTop: Spacing.two },
});
