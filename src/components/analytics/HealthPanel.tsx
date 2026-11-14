/**
 * The health row in `/studio`: when each thing that should keep happening last happened.
 *
 * This exists because the user list on this page sat empty for two weeks (2026-10-04..18) and
 * nothing said so. A row of "x hours ago" with a colour past a threshold is the cheapest alarm
 * there is. The thresholds live here, not in the database: how long is too long is a reading
 * decision, and it differs per signal (a webhook can be quiet for a week; the event stream
 * cannot be quiet for a day).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { toneOf } from '@/data/healthTone';
import { fetchHealth, type HealthRow } from '@/data/studioOps';

const HOUR = 3_600_000;

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  if (ms < 0) {
    const d = Math.ceil(-ms / (24 * HOUR));
    return `in ${d} day${d === 1 ? '' : 's'}`;
  }
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))} min ago`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)}h ago`;
  return `${Math.round(ms / (24 * HOUR))} days ago`;
}

export function HealthPanel() {
  const [rows, setRows] = useState<HealthRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchHealth()
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.panel}>
        <ThemedText type="small" style={styles.bad}>
          Health unavailable: {error}
        </ThemedText>
      </View>
    );
  }
  if (!rows) {
    return (
      <View style={[styles.panel, styles.loading]}>
        <ActivityIndicator color={Palette.accent} />
      </View>
    );
  }

  const worst = rows.map(toneOf).includes('bad') ? 'bad' : rows.map(toneOf).includes('warn') ? 'warn' : 'ok';

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Health</ThemedText>
        <ThemedText type="small" style={styles[worst]}>
          {worst === 'ok' ? 'everything recent' : worst === 'warn' ? 'something is quiet' : 'something has stopped'}
        </ThemedText>
      </View>
      <View style={styles.grid}>
        {rows.map((r) => {
          const tone = toneOf(r);
          return (
            <View key={r.signal} style={styles.cell}>
              <ThemedText type="small" themeColor="textSecondary">
                {r.signal}
              </ThemedText>
              <ThemedText type="small" style={[styles.value, styles[tone]]}>
                {ago(r.at)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {r.detail}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  loading: { alignItems: 'center', paddingVertical: Spacing.three },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: { minWidth: 150, flexGrow: 1, flexBasis: '22%', gap: 1 },
  value: { fontWeight: Weight.semibold },
  ok: { color: Palette.success },
  warn: { color: Palette.warning },
  bad: { color: Palette.danger },
});
