/**
 * The content-report queue in `/studio`, the operational half of the DMCA posture.
 *
 * WHY THIS EXISTS. Reports have landed in `content_reports` since 20260717170000, but reading
 * them took the service role and acting on one took hand-written SQL. A takedown process that
 * slow is not "expeditious", and expeditious removal is what keeps 512(c) safe harbor. This
 * panel is the whole workflow: see the report, open the binder, take it down (or put it back),
 * or dismiss the report, each one tap against the admin RPCs from 20260826120000.
 *
 * The strikes list below the queue is the repeat-infringer ledger the DMCA page's suspension
 * sentence promises. Counting actioned copyright reports per content owner is deliberately the
 * whole mechanism: a number an admin looks at, not an automatic ban.
 *
 * Renders nothing for non-admins beyond an error state; RLS returns zero rows regardless, so
 * the gate here is UX, not security.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  adminClearProfile,
  adminCopyrightStrikes,
  adminListReports,
  adminRemoveBinder,
  adminRestoreBinder,
  adminRestoreBinderPrivate,
  adminSetReportStatus,
  type AdminReport,
  type CopyrightStrike,
} from '@/data/reportRepo';

function shortId(id: string): string {
  return id.slice(0, 8);
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ReportsPanel() {
  const router = useRouter();
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [strikes, setStrikes] = useState<CopyrightStrike[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The result of the last button pressed, shown under its row (MIC-029: a press always answers). */
  const [notice, setNotice] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  /** The report an action is in flight for, so its buttons go quiet instead of double-firing. */
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    adminListReports()
      .then(setReports)
      .catch((e) => setError((e as Error).message));
    adminCopyrightStrikes()
      .then(setStrikes)
      .catch(() => setStrikes([]));
  }, []);

  useEffect(load, [load]);

  const act = useCallback(
    (report: AdminReport, action: 'remove' | 'restore' | 'restorePrivate' | 'dismiss' | 'reopen' | 'clearProfile') => {
      if (busy) return;
      setBusy(report.id);
      setNotice(null);
      const run =
        action === 'remove' && report.binderId
          ? adminRemoveBinder(report.binderId)
          : action === 'clearProfile' && report.profileId
            ? adminClearProfile(report.profileId)
            : action === 'restore' && report.binderId
              ? adminRestoreBinder(report.binderId).then(() => adminSetReportStatus(report.id, 'open'))
              : action === 'restorePrivate' && report.binderId
                // Back for the owner only; the report stays actioned (the public page stays gone).
                ? adminRestoreBinderPrivate(report.binderId).then((r) =>
                    setNotice({
                      id: report.id,
                      ok: r !== 'not found',
                      text:
                        r === 'restored'
                          ? 'Restored as private: back for its owner, hidden from everyone else.'
                          : r === 'already private'
                            ? 'Already private: the owner has it and visitors cannot see it. Nothing changed.'
                            : r === 'not found'
                              ? 'Binder not found: it may have been deleted.'
                              : 'Done.',
                    }),
                  )
              : adminSetReportStatus(report.id, action === 'dismiss' ? 'dismissed' : 'open');
      // A failed ACTION says so on its own row; it used to replace the whole panel with
      // "Reports unavailable", which reads like a loading problem, not a refused button.
      run
        .then(load)
        .catch((e) => setNotice({ id: report.id, ok: false, text: (e as Error).message }))
        .finally(() => setBusy(null));
    },
    [busy, load],
  );

  if (error) {
    return (
      <View style={styles.panel}>
        <ThemedText type="small" themeColor="textSecondary">
          Reports unavailable: {error}
        </ThemedText>
      </View>
    );
  }
  if (!reports) {
    return (
      <View style={[styles.panel, styles.loading]}>
        <ActivityIndicator color={Palette.accent} />
      </View>
    );
  }

  const open = reports.filter((r) => r.status === 'open');
  const closed = reports.filter((r) => r.status !== 'open');
  const struck = (strikes ?? []).filter((s) => s.strikes > 0);

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Content reports</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {open.length} open · {closed.length} resolved
        </ThemedText>
      </View>

      {notice ? (
        <ThemedText
          type="small"
          accessibilityRole="alert"
          testID="reports-notice"
          style={{ color: notice.ok ? Palette.success : Palette.danger }}>
          {notice.text}
        </ThemedText>
      ) : null}

      {open.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No open reports. New ones appear here (and ping Discord when the alert job is on).
        </ThemedText>
      ) : (
        open.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">
                {r.reason}
                {r.binderId ? ` · binder ${shortId(r.binderId)}` : ''}
                {r.profileId ? ` · profile ${shortId(r.profileId)}` : ''}
                {`  ·  ${when(r.createdAt)}`}
              </ThemedText>
              {r.details ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                  {r.details}
                </ThemedText>
              ) : null}
            </View>
            <View style={styles.actions}>
              {r.binderId || r.profileId ? (
                <Pressable
                  onPress={() =>
                    router.push(r.binderId ? `/binder/${r.binderId}` : `/u/${r.profileId}`)
                  }
                  style={styles.quietBtn}
                  hitSlop={4}>
                  <ThemedText type="small" style={styles.quietText}>
                    View
                  </ThemedText>
                </Pressable>
              ) : null}
              {r.binderId ? (
                <Pressable
                  onPress={() => act(r, 'remove')}
                  disabled={busy === r.id}
                  style={[styles.dangerBtn, busy === r.id && styles.dim]}
                  hitSlop={4}>
                  <ThemedText type="small" style={styles.dangerText}>
                    Take down
                  </ThemedText>
                </Pressable>
              ) : null}
              {r.profileId ? (
                <Pressable
                  onPress={() => act(r, 'clearProfile')}
                  disabled={busy === r.id}
                  style={[styles.dangerBtn, busy === r.id && styles.dim]}
                  hitSlop={4}>
                  <ThemedText type="small" style={styles.dangerText}>
                    Clear content
                  </ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => act(r, 'dismiss')}
                disabled={busy === r.id}
                style={[styles.quietBtn, busy === r.id && styles.dim]}
                hitSlop={4}>
                <ThemedText type="small" style={styles.quietText}>
                  Dismiss
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {closed.length > 0 ? (
        <View style={styles.closedBlock}>
          {closed.slice(0, 8).map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={styles.rowText}>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.status} · {r.reason}
                  {r.binderId ? ` · binder ${shortId(r.binderId)}` : ''}
                  {r.profileId ? ` · profile ${shortId(r.profileId)}` : ''}
                  {`  ·  ${when(r.createdAt)}`}
                </ThemedText>
              </View>
              {r.status === 'actioned' && r.binderId ? (
                <Pressable
                  onPress={() => act(r, 'restore')}
                  disabled={busy === r.id}
                  style={[styles.quietBtn, busy === r.id && styles.dim]}
                  hitSlop={4}>
                  <ThemedText type="small" style={styles.quietText}>
                    Restore
                  </ThemedText>
                </Pressable>
              ) : null}
              {r.status === 'actioned' && r.binderId ? (
                <Pressable
                  onPress={() => act(r, 'restorePrivate')}
                  disabled={busy === r.id}
                  style={[styles.quietBtn, busy === r.id && styles.dim]}
                  accessibilityLabel="Restore as a private binder: back for its owner, hidden from everyone else"
                  hitSlop={4}>
                  <ThemedText type="small" style={styles.quietText}>
                    Restore as private
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {struck.length > 0 ? (
        <View style={styles.strikesBlock}>
          <ThemedText type="smallBold">Copyright strikes</ThemedText>
          {struck.map((s) => (
            <ThemedText key={s.ownerId} type="small" themeColor="textSecondary">
              {s.username ? `@${s.username}` : shortId(s.ownerId)} · {s.strikes} actioned ·{' '}
              last {when(s.lastAt)}
            </ThemedText>
          ))}
        </View>
      ) : null}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  rowText: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  quietBtn: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  quietText: { fontWeight: Weight.semibold, fontSize: FontSize.sm },
  dangerBtn: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.danger,
  },
  dangerText: { color: Palette.danger, fontWeight: Weight.semibold, fontSize: FontSize.sm },
  dim: { opacity: 0.5 },
  closedBlock: { gap: 4, paddingTop: Spacing.one },
  strikesBlock: { gap: 4, paddingTop: Spacing.two },
});
