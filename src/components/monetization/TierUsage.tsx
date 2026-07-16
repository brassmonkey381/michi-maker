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
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { fetchEntitlementDetails } from '@/data/entitlementRepo';
import { countPrintsThisMonth } from '@/data/printRepo';
import { countLiveSavedSlices } from '@/data/sliceRepo';
import { CHECKOUT_OPEN } from '@/data/subscriptions';
import { isActive, PRODUCTS, TIER_LIMITS, type Tier } from '@/data/tiers';
import { useTier } from '@/hooks/use-tier';
import { useAuth } from '@/store/auth';
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

/** One label · value line of the subscription details list. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

/** Everything the details block shows — computed once per fetch (dates resolved in the effect,
 *  never during render, per the react-hooks purity rule). */
interface PlanDetails {
  memberSince?: string;
  /** "PRO member since" — the active subscription row's granted_at. */
  planSince?: string;
  /** Term end of the active subscription row (manual grants lapse; webhooks will extend). */
  termEnds?: string;
  daysLeft?: number;
  /** The grant came from a manual SQL grant, not a checkout. */
  manualGrant?: boolean;
  /** Display lines for active lifetime unlocks (e.g. the grandfathered full-print unlock). */
  unlocks: string[];
}

/** The current plan + usage block (Settings PLAN section, /subscriptions YOUR PLAN section). */
export function PlanUsageSection({ onManagePlan }: { onManagePlan?: () => void }) {
  const { tier } = useTier();
  const { user } = useAuth();
  const { binderCount } = useBinders();
  // Planned caps, not live limits — see the header comment for the LIMITS_ENFORCED flip note.
  const caps = TIER_LIMITS[tier];

  // Server-counted usage: artworks kept (live saved slices) + this month's fill-sheet prints.
  // Meters appear once counted; a failed count just leaves that meter off (never a spinner).
  const [artCount, setArtCount] = useState<number | null>(null);
  const [printCount, setPrintCount] = useState<number | null>(null);
  const [details, setDetails] = useState<PlanDetails | null>(null);
  const isGuest = tier === 'guest';
  const memberSinceIso = user?.created_at;
  useEffect(() => {
    if (isGuest) return;
    let live = true;
    const fmt = (iso?: string | null) =>
      iso
        ? new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : undefined;
    fetchEntitlementDetails()
      .then((rows) => {
        if (!live) return;
        const now = Date.now();
        const activeRows = rows.filter((r) =>
          isActive({ product: r.product, expires_at: r.expiresAt }, now),
        );
        const subProduct =
          tier === 'vip' ? PRODUCTS.tierVip : tier === 'pro' ? PRODUCTS.tierPro : null;
        const sub = subProduct ? activeRows.find((r) => r.product === subProduct) : undefined;
        setDetails({
          memberSince: fmt(memberSinceIso),
          planSince: fmt(sub?.grantedAt),
          termEnds: fmt(sub?.expiresAt),
          daysLeft: sub?.expiresAt
            ? Math.max(0, Math.ceil((Date.parse(sub.expiresAt) - now) / 86400000))
            : undefined,
          manualGrant: sub?.source === 'manual',
          unlocks: activeRows
            .filter((r) => r.product === PRODUCTS.pdfPrint)
            .map((r) =>
              r.grantedAt
                ? `Full-print unlock · lifetime, since ${fmt(r.grantedAt)}`
                : 'Full-print unlock · lifetime',
            ),
        });
      })
      .catch(() => {});
    countLiveSavedSlices()
      .then((n) => {
        if (live) setArtCount(n);
      })
      .catch(() => {});
    countPrintsThisMonth()
      .then((n) => {
        if (live) setPrintCount(n);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isGuest, tier, memberSinceIso]);

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
          {details ? (
            <View style={styles.detailList}>
              {details.memberSince ? (
                <DetailRow label="Member since" value={details.memberSince} />
              ) : null}
              {details.planSince ? (
                <DetailRow label={`${TIER_NAMES[tier]} member since`} value={details.planSince} />
              ) : null}
              {details.termEnds ? (
                <DetailRow
                  label={CHECKOUT_OPEN ? 'Renews' : 'Current term ends'}
                  value={
                    details.daysLeft != null
                      ? `${details.termEnds} · ${details.daysLeft} day${details.daysLeft === 1 ? '' : 's'} left`
                      : details.termEnds
                  }
                />
              ) : tier === 'free' ? (
                <DetailRow label="Billing" value="None — Free is free forever" />
              ) : null}
              {details.unlocks.map((u) => (
                <DetailRow key={u} label="One-time unlock" value={u} />
              ))}
              {details.termEnds && details.manualGrant && !CHECKOUT_OPEN ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  Plans don’t auto-renew during the beta — your term was granted directly and is
                  extended the same way. Automatic renewal arrives with checkout.
                </ThemedText>
              ) : null}
            </View>
          ) : null}
          <TierUsage label="Binders" used={binderCount} limit={caps.binders} />
          {artCount != null ? (
            <TierUsage label="Artworks kept" used={artCount} limit={caps.artUploads} />
          ) : null}
          {printCount != null && caps.includedPrintsPerMonth > 0 ? (
            <TierUsage
              label="Included prints used this month"
              used={printCount}
              limit={caps.includedPrintsPerMonth}
              note={
                Number.isFinite(caps.includedPrintsPerMonth)
                  ? 'Full-binder fill-sheet PDFs included with your plan each month.'
                  : undefined
              }
            />
          ) : null}
          <ThemedText type="small" themeColor="textSecondary" style={styles.included}>
            Your plan includes similarity matching and every composer method
            {caps.includedPrintsPerMonth > 0 && Number.isFinite(caps.includedPrintsPerMonth)
              ? `, plus ${caps.includedPrintsPerMonth} full-binder print${caps.includedPrintsPerMonth === 1 ? '' : 's'} a month`
              : ''}
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
  detailList: {
    gap: Spacing.one,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.panelAlt,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.one,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  detailLabel: { fontSize: FontSize.sm },
  detailValue: { fontSize: FontSize.sm, fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 },
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
