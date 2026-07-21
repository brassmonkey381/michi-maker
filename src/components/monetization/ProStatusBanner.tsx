/**
 * The app-wide PRO status strip: nudges an ending trial, warns before over-cap binders are
 * archived after a downgrade, surfaces the "locked" count, and quietly restores archived binders
 * once the user is paid again. Renders null whenever there's nothing to say (the common case), so
 * it's safe to mount above every screen. See docs/PRO-TRIALS.md.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { fetchArchivedBinderCount } from '@/data/binderRepo';
import { restoreArchivedBinders } from '@/data/trial';
import { useTrial } from '@/hooks/use-trial';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysUntil = (iso: string | null) =>
  iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / DAY_MS)) : 0;

export function ProStatusBanner() {
  const router = useRouter();
  const { user, isSignedIn } = useAuth();
  const { binderCount, limits, tier } = useBinders();
  const trial = useTrial();
  const isPaid = tier === 'pro' || tier === 'vip';

  // Stale count from a prior session is gated by the `!isSignedIn` return below, so there's no
  // sync reset here (which would be a set-state-in-effect).
  const [archived, setArchived] = useState(0);
  useEffect(() => {
    if (!isSignedIn || !user) return;
    let live = true;
    fetchArchivedBinderCount(user.id).then((n) => {
      if (live) setArchived(n);
    });
    return () => {
      live = false;
    };
  }, [isSignedIn, user]);

  // Back in a paid tier with binders still archived → restore up to the new cap, then reload so
  // they reappear in the grid (the store loads binders on identity change, not on demand). A ref
  // (not state) guards against re-running so the effect never sets state synchronously.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isPaid || archived <= 0 || restoredRef.current) return;
    restoredRef.current = true;
    restoreArchivedBinders(limits.binders).then((n) => {
      if (n > 0 && Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
    });
  }, [isPaid, archived, limits.binders]);

  if (!isSignedIn) return null;

  const cap = limits.binders;
  const liveExcess = Number.isFinite(cap) ? Math.max(0, binderCount - cap) : 0;
  const inGrace = trial.isDowngraded && daysUntil(trial.graceEndsAt) > 0;

  // Priority: reclaim warning (time-critical) → locked note → trial countdown.
  let body: { text: string; cta: string } | null = null;

  if (trial.isDowngraded && liveExcess > 0) {
    // Over cap after a downgrade — excess will be archived at grace end.
    const d = daysUntil(trial.graceEndsAt);
    body = inGrace
      ? {
          text: `Your PRO access ended. Free keeps ${cap} binders — you have ${binderCount}. In ${d} day${d === 1 ? '' : 's'}, ${liveExcess} will be locked unless you subscribe.`,
          cta: 'Keep them — subscribe',
        }
      : {
          text: `You're over the Free limit of ${cap} binders (${binderCount}). ${liveExcess} will be locked soon; we keep your ${cap} most recent. Subscribe to keep them all.`,
          cta: 'Keep them — subscribe',
        };
  } else if (archived > 0 && !isPaid) {
    body = {
      text: `${archived} binder${archived === 1 ? ' is' : 's are'} locked (over the Free limit). Subscribe to unlock ${archived === 1 ? 'it' : 'them'} again.`,
      cta: 'Unlock — subscribe',
    };
  } else if (trial.state === 'active' && trial.daysLeft != null && trial.daysLeft <= 3) {
    const d = trial.daysLeft;
    body = {
      text:
        liveExcess > 0
          ? `${d} day${d === 1 ? '' : 's'} of PRO left. You have ${binderCount} binders — subscribe before it ends or ${liveExcess} will be locked.`
          : `${d} day${d === 1 ? '' : 's'} of your PRO trial left. Keep your binders and prints with a plan.`,
      cta: 'See plans',
    };
  }

  if (!body) return null;

  return (
    <View style={styles.wrap}>
      <ThemedText type="small" style={styles.text}>
        {body.text}
      </ThemedText>
      <Pressable
        onPress={() => router.push('/plans')}
        hitSlop={6}
        style={({ pressed }) => [styles.btn, pressed && styles.dim]}>
        <ThemedText type="smallBold" style={styles.btnText}>
          {body.cta}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    backgroundColor: Palette.selectionSoft,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairlineStrong,
  },
  text: { flex: 1, lineHeight: 18 },
  btn: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.label },
  dim: { opacity: 0.7 },
});
