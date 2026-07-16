/**
 * Tier usage meters — "how much of my plan am I using". Two layers:
 *
 * - `TierUsage`: a presentational meter row (label, used of limit, thin progress bar).
 *   Infinity-safe: unlimited caps render as "N · Unlimited" with no bar. Deliberately never
 *   turns red — at-limit messaging is UpgradePerk's job, the meter just informs.
 * - `PlanUsageSection`: the data-wired block used by Settings and /pricing. While
 *   LIMITS_ENFORCED is false it reads the PLANNED caps from TIER_LIMITS directly (useTier's
 *   limits resolve to unlimited when the flag is off) and frames them as what the plan
 *   includes. FLAG-FLIP NOTE: when LIMITS_ENFORCED goes true, switch the `caps` line to
 *   `useTier().limits` so live enforcement and the meters can never disagree.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { TIER_LIMITS, type Tier } from '@/data/tiers';
import { useTier } from '@/hooks/use-tier';
import { useBinders } from '@/store/binders';

const TIER_NAMES: Record<Tier, string> = {
  guest: 'Guest',
  free: 'Free',
  pro: 'PRO',
  vip: 'VIP',
};

export function TierUsage({
  label,
  used,
  limit,
  note,
}: {
  label: string;
  used: number;
  limit: number;
  note?: string;
}) {
  const unlimited = !Number.isFinite(limit);
  return (
    <View style={styles.meter}>
      <View style={styles.meterHead}>
        <ThemedText type="smallBold" style={styles.meterLabel}>
          {label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.meterValue}>
          {unlimited ? `${used} · Unlimited` : `${used} of ${limit}`}
        </ThemedText>
      </View>
      {!unlimited ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(used / limit, 1) * 100}%` }]} />
        </View>
      ) : null}
      {note ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** The current plan + usage block (Settings PLAN section, /pricing YOUR PLAN section). */
export function PlanUsageSection({ onManagePlan }: { onManagePlan?: () => void }) {
  const { tier } = useTier();
  const { binderCount } = useBinders();
  // Planned caps, not live limits — see the header comment for the LIMITS_ENFORCED flip note.
  const caps = TIER_LIMITS[tier];

  return (
    <View style={styles.section}>
      <View style={styles.planRow}>
        <ThemedText type="small" themeColor="textSecondary">
          Current plan
        </ThemedText>
        <View style={styles.planChip}>
          <ThemedText type="smallBold" style={styles.planChipText}>
            {TIER_NAMES[tier]}
          </ThemedText>
        </View>
      </View>

      {tier === 'guest' ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          Sign in (free) to keep your binders long-term and unlock the full plan.
        </ThemedText>
      ) : (
        <>
          <TierUsage label="Binders" used={binderCount} limit={caps.binders} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.included}>
            Your plan includes{' '}
            {Number.isFinite(caps.composerPagesPerMonth)
              ? `${caps.composerPagesPerMonth} Composer pages a month`
              : 'unlimited Composer pages'}{' '}
            and{' '}
            {Number.isFinite(caps.artUploads)
              ? `${caps.artUploads} kept art uploads`
              : 'unlimited art uploads'}
            .
          </ThemedText>
        </>
      )}

      {onManagePlan ? (
        <ThemedText type="linkPrimary" style={styles.manage} onPress={onManagePlan}>
          View plans ›
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  planChip: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
  },
  planChipText: { fontSize: FontSize.sm },
  meter: { gap: 4 },
  meterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meterLabel: { fontSize: FontSize.label },
  meterValue: { fontSize: FontSize.sm, fontVariant: ['tabular-nums'] },
  track: { height: 4, borderRadius: Radius.pill, backgroundColor: Palette.panel, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill, backgroundColor: Palette.accent },
  note: { lineHeight: 18 },
  included: { lineHeight: 18 },
  manage: { fontSize: FontSize.label, marginTop: 2 },
});
