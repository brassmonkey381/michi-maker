/**
 * The community-growth strip at the top of `/studio` — cumulative totals plus a per-day
 * activity sparkline for each of the five metrics the landing band shows.
 *
 * Plotted as plain Views, not a chart library. Five sparklines on one admin page do not
 * justify a dependency, and bar heights from flex are exact and work identically on web,
 * iOS and Android.
 *
 * Bars are DAILY DELTAS, not the running total. The cumulative curve for a young product is
 * a nearly straight line that hides every interesting day; the deltas show which days people
 * actually built things.
 *
 * Reconstructed days (`backfilled`) are drawn muted. That boundary matters: those days were
 * derived from surviving rows' `created_at`, so they cannot show a deletion and can never dip
 * (see migration 20260819130000). Captured days are real observations and can. Do not restyle
 * them to match without reading that comment first.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  fetchCommunityGrowth,
  growthOverWindow,
  GROWTH_METRICS,
  type GrowthDay,
} from '@/data/communityGrowth';

const WINDOW_DAYS = 30;
const CHART_HEIGHT = 44;

function fmt(n: number): string {
  return n.toLocaleString();
}

/** "Aug 19" — the sparkline's endpoints are labelled so the window is legible without a hover. */
function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function GrowthPanel() {
  const [series, setSeries] = useState<GrowthDay[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCommunityGrowth(WINDOW_DAYS)
      .then((rows) => {
        if (alive) setSeries(rows);
      })
      .catch(() => {
        if (alive) setSeries([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (series === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Palette.accent} />
      </View>
    );
  }
  // No history yet (migration not applied, or a non-admin caller). Say nothing rather than
  // showing an empty chart frame.
  if (series.length === 0) return null;

  const latest = series[series.length - 1];
  const reconstructed = series.filter((d) => d.backfilled).length;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Community growth</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {shortDay(series[0].day)} to {shortDay(latest.day)} · bars are per-day
        </ThemedText>
      </View>

      <View style={styles.cards}>
        {GROWTH_METRICS.map((metric) => {
          const total = latest[metric.key];
          const added = growthOverWindow(series, metric.key);
          const deltas = series.map((d) => {
            const v = d[metric.delta];
            return typeof v === 'number' ? v : 0;
          });
          const peak = Math.max(1, ...deltas);

          return (
            <View key={metric.key} style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                {metric.label}
              </ThemedText>
              <View style={styles.valueRow}>
                <ThemedText style={styles.value}>
                  {typeof total === 'number' ? fmt(total) : '—'}
                </ThemedText>
                <ThemedText type="small" style={styles.added}>
                  +{fmt(added)} in {WINDOW_DAYS}d
                </ThemedText>
              </View>

              <View style={styles.chart} accessibilityLabel={`${metric.label} per day`}>
                {series.map((d, i) => (
                  <View
                    key={d.day}
                    style={[
                      styles.bar,
                      // A zero day still gets a hairline so the axis reads as continuous.
                      { height: Math.max(1, (deltas[i] / peak) * CHART_HEIGHT) },
                      d.backfilled ? styles.barBackfilled : styles.barCaptured,
                    ]}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </View>

      {reconstructed > 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          {reconstructed} of {series.length} days are reconstructed from creation timestamps
          (the paler bars). Those days cannot reflect anything deleted since, so treat them as
          a floor. Days captured by the daily snapshot are exact.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: Spacing.four, alignItems: 'center' },
  panel: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  card: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 160,
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.panel,
    backgroundColor: Palette.panel,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, flexWrap: 'wrap' },
  value: { fontSize: FontSize.title, fontWeight: Weight.bold },
  added: { color: Palette.accent },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    gap: 1,
    marginTop: Spacing.one,
  },
  bar: { flex: 1, borderRadius: 1, minWidth: 2 },
  barCaptured: { backgroundColor: Palette.accent },
  barBackfilled: { backgroundColor: Palette.hairlineStrong },
  footnote: { lineHeight: 17 },
});
