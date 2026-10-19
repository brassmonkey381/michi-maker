/**
 * Where sessions end, in `/studio`: for every session in the window, the last event it recorded,
 * grouped and ranked. The question it answers is "what were people doing when they left?", which
 * is the question that picks what to build next.
 *
 * Reading it honestly:
 *   - "session.start" as the last event is an open with nothing after it: a bounce.
 *   - A session that ended on a finishing step (placed a card, printed, paid) is not a drop-off,
 *     it is a done. The list does not pretend to know which is which; the median event count
 *     beside each row is the tell: a high median on a last step is people finishing there.
 *   - Guests are not here (owner, 2026-10-19): a session is counted only when it belongs to a
 *     signed-in account. A guest who signs in mid-session is a person and stays in.
 * Test and admin accounts are excluded server-side, the same way.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchDropoffs, type DropoffRow, type StudioApp } from '@/data/studioOps';

const WINDOWS = [1, 7, 30] as const;

function labelOf(r: DropoffRow): string {
  if (r.lastEvent === 'session.start') return 'opened, nothing else';
  if (r.lastEvent === 'page.view') return `viewing ${r.lastRoute ?? 'a page'}`;
  return r.lastEvent.replace(/[._]/g, ' ');
}

export function DropoffsPanel({ app }: { app: StudioApp }) {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(7);
  // The result remembers which app and window it answers, so switching either shows the spinner
  // (a stale answer is never shown for a new question) without resetting state inside the effect.
  const key = `${app}|${days}`;
  const [result, setResult] = useState<{ key: string; rows?: DropoffRow[]; error?: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetchDropoffs(app, days)
      .then((r) => active && setResult({ key, rows: r }))
      .catch((e: Error) => active && setResult({ key, error: e.message }));
    return () => {
      active = false;
    };
  }, [app, days, key]);

  const current = result?.key === key ? result : null;
  const rows = current?.rows ?? null;
  const error = current?.error ?? null;

  const total = rows?.reduce((n, r) => n + r.sessions, 0) ?? 0;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Where sessions ended</ThemedText>
        <View style={styles.toggle}>
          {WINDOWS.map((w) => (
            <Pressable key={w} onPress={() => setDays(w)} style={[styles.toggleBtn, days === w && styles.toggleOn]} hitSlop={4}>
              <ThemedText type="small" style={[styles.toggleText, days === w && styles.toggleTextOn]}>
                {w === 1 ? '24h' : `${w}d`}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>
      {error ? (
        <ThemedText type="small" themeColor="textSecondary">
          Unavailable: {error}
        </ThemedText>
      ) : !rows ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Palette.accent} />
        </View>
      ) : rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No sessions with events in this window.
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {total} signed-in session{total === 1 ? '' : 's'} · last event per session, most common first
          </ThemedText>
          {rows.map((r) => {
            const share = total ? Math.round((r.sessions / total) * 100) : 0;
            return (
              <View key={`${r.lastEvent}|${r.lastRoute ?? ''}`} style={styles.row}>
                <View style={styles.bar}>
                  <View style={[styles.fill, { width: `${Math.max(2, share)}%` }]} />
                </View>
                <ThemedText type="small" style={styles.num}>
                  {r.sessions}
                </ThemedText>
                <ThemedText type="small" style={styles.label}>
                  {labelOf(r)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
                  median {r.medianEvents} event{r.medianEvents === 1 ? '' : 's'}
                </ThemedText>
              </View>
            );
          })}
          <ThemedText type="small" themeColor="textSecondary">
            A last step with a high median is people finishing there, not leaving. Guest sessions and sessions with no events are not here.
          </ThemedText>
        </>
      )}
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  toggle: { flexDirection: 'row', gap: 4 },
  toggleBtn: { paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.hairlineStrong },
  toggleOn: { borderColor: Palette.accent },
  toggleText: { fontWeight: Weight.semibold, fontSize: FontSize.sm },
  toggleTextOn: { color: Palette.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bar: { width: 64, height: 6, borderRadius: 3, backgroundColor: Palette.hairlineStrong, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: Palette.accent },
  num: { minWidth: 28, textAlign: 'right', fontWeight: Weight.semibold },
  label: { flex: 1 },
  meta: { minWidth: 96, textAlign: 'right' },
});
