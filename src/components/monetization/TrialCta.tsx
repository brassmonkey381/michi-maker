/**
 * "Start free 14-day PRO trial" — shown wherever a Free user hits the PRO wall, when they're
 * eligible (never trialed, never paid) and trials are open (CHECKOUT_OPEN, so an expiring trial
 * always has a subscribe path). No card; the grant lands immediately via the start_pro_trial RPC.
 *
 * Renders nothing when the user isn't trial-eligible — callers pair it with their existing
 * UpgradePerk, which covers the used/ineligible cases.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { CHECKOUT_OPEN } from '@/data/subscriptions';
import { useTier } from '@/hooks/use-tier';
import { useTrial } from '@/hooks/use-trial';

export function TrialCta({
  /** One line above the button, e.g. "Want more binders? Try PRO free." */
  message,
  /** Runs before the trial starts (e.g. close a covering modal so the result is visible). */
  onBeforeStart,
}: {
  message?: string;
  onBeforeStart?: () => void;
}) {
  const trial = useTrial();
  const { refresh: refreshTier } = useTier();

  // Only the eligible-and-open case renders. Everything else (used, ineligible, checkout closed,
  // loading) defers to the caller's UpgradePerk.
  if (!CHECKOUT_OPEN || trial.loading || trial.state !== 'eligible') return null;

  const start = async () => {
    onBeforeStart?.();
    try {
      await trial.start();
      refreshTier(); // the new tier_pro row is readable immediately (no webhook lag)
    } catch {
      // trial.error is set; shown below
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
      <ThemedText type="small" themeColor="textSecondary" style={styles.fine}>
        No card. Full PRO for 14 days, then back to Free.
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
