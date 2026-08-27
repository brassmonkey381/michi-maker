/**
 * "Start free 14-day PRO trial" — shown wherever a Free user hits the PRO wall, when they're
 * eligible (never trialed, never paid) and trials are open (CHECKOUT_OPEN, so an expiring trial
 * always has a subscribe path). No card; the grant lands immediately via the start_pro_trial RPC.
 *
 * Renders nothing when the user isn't trial-eligible — callers pair it with their existing
 * UpgradePerk, which covers the used/ineligible cases.
 */
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { CHECKOUT_OPEN } from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';
import { useTrial, type UseTrial } from '@/hooks/use-trial';

/**
 * Exactly the condition TrialCta draws under, as a pure predicate.
 *
 * Exported because a caller that needs a FALLBACK when there is no offer (a cap gate, which must
 * still say something to the used/ineligible/subscribed) cannot otherwise tell whether this
 * component rendered — it returns null on its own. Re-deriving the rule at the call site is how
 * the two quietly disagree, so there is one copy and both read it.
 */
export const trialOfferVisible = (trial: Pick<UseTrial, 'loading' | 'state'>): boolean =>
  CHECKOUT_OPEN && !trial.loading && trial.state === 'eligible';

export function TrialCta({
  /** One line above the button, e.g. "Want more binders? Try PRO free." */
  message,
  /** Runs before the trial starts (e.g. close a covering modal so the result is visible). */
  onBeforeStart,
  /** Where this offer is shown, for impression attribution ('plans' | 'print_gate' | ...). Required
   *  so pro.offer_shown / trial.start can be attributed to the surface that produced them. */
  surface,
  /** Called once when the offer is actually shown (pro.offer_shown fired), so a dismissible surface
   *  can pair a decline to a real impression. */
  onImpression,
}: {
  message?: string;
  onBeforeStart?: () => void;
  surface: string;
  onImpression?: () => void;
}) {
  const trial = useTrial();
  const { refresh: refreshTier } = useTier();
  const shown = useRef(false);

  // Only the eligible-and-open case renders. Everything else (used, ineligible, checkout closed,
  // loading) defers to the caller's UpgradePerk.
  const eligible = trialOfferVisible(trial);

  // Impression: fire pro.offer_shown exactly once, only when the button actually renders — never on
  // the return-null path below, which is the ABSENCE of an offer (recording it would inflate
  // awareness). Ref-guarded so a re-render or tab switch back doesn't re-emit.
  useEffect(() => {
    if (!eligible || shown.current) return;
    shown.current = true;
    track('pro.offer_shown', { surface });
    onImpression?.();
  }, [eligible, surface, onImpression]);

  if (!eligible) return null;

  const start = async () => {
    onBeforeStart?.();
    try {
      // surface is forwarded so start_pro_trial emits `trial.start` server-side, in the same
      // transaction as the grant — un-droppable, unlike the old client track() that this replaces
      // (see ../ANALYTICS-TRIAL-START-DROPPED.md).
      await trial.start(surface);
      // Reflect PRO immediately. refreshTier() now invalidates EVERY useTier instance (see
      // use-tier), so the plans screen / print sheet re-poll too — not just this CTA, which is
      // about to unmount itself (it returns null once the user is no longer `eligible`).
      refreshTier();
    } catch {
      // trial.error is set and shown below. Record the failure too — a fixed reason, NEVER the
      // caught message (which can carry URLs/emails).
      track('trial.start_failed', { reason: 'rpc_error' });
    }
  };

  return (
    <View style={styles.wrap}>
      {message ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.msg}>
          {message}
        </ThemedText>
      ) : null}
      <Pressable
        onPress={start}
        disabled={trial.starting}
        style={({ pressed }) => [styles.btn, (pressed || trial.starting) && styles.dim]}>
        {trial.starting ? (
          <ActivityIndicator color={Palette.accentText} />
        ) : (
          <Text style={styles.btnText}>Start free 14-day PRO trial</Text>
        )}
      </Pressable>
      {/* "No card" was too terse to do its job. The trial creates a `tier_pro` entitlement with an
          expires_at and no Stripe subscription, so there is genuinely nothing to charge and
          nothing to cancel — but a reader who has been burned by other trials assumes otherwise
          and does not start one. Say all three parts plainly. */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.fine}>
        No credit card required. Full PRO for 14 days, starting now, then back to Free on its own.
        Nothing to cancel, and you are never charged.
      </ThemedText>
      {trial.error ? (
        <ThemedText type="small" style={styles.error}>
          {trial.error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one, maxWidth: 460 },
  msg: { lineHeight: 18 },
  btn: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.md, fontWeight: Weight.semibold },
  fine: { fontSize: FontSize.sm, textAlign: 'center' },
  error: { color: Palette.danger, lineHeight: 18 },
  dim: { opacity: 0.6 },
});
