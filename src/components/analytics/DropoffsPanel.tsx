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
 *   - Guests are counted inside the number and shown beside it, never dropped.
 * Test and admin accounts are excluded server-side.
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
  const [rows, setRows] = useState<DropoffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(null);
    fetchDropoffs(app, days)
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [app, days]);

  const total = rows?.reduce((n, r) => n + r.sessions, 0) ?? 0;
  const guests = rows?.reduce((n, r) => n + r.guestSessions, 0) ?? 0;

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
            {total} session{total === 1 ? '' : 's'} · {guests} as a guest · last event per session, most common first
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
                  {r.guestSessions ? `${r.guestSessions} guest · ` : ''}median {r.medianEvents} event{r.medianEvents === 1 ? '' : 's'}
                </ThemedText>
              </View>
            );
          })}
          <ThemedText type="small" themeColor="textSecondary">
            A last step with a high median is people finishing there, not leaving. Sessions with no events are not here.
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
  meta: { minWidth: 120, textAlign: 'right' },
});
