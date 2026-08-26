/**
 * `/studio` — admin-only analytics console (per-user journeys).
 *
 * Gated on the caller being an admin: it reads the current profile's `is_admin`, and confirms via
 * the security-definer `is_admin()` RPC. Non-admins see a plain "Not authorized" state and no
 * data is fetched. Everything reads through the admin_* RPCs (guarded server-side by is_admin()),
 * so there is no broad table read from the client.
 *
 * Layout: an app switcher (michi / tcgscan) filters everything; a user list (admin_recent_users)
 * on the left/top; the selected user's event timeline (admin_user_journey) as the main view,
 * grouped by session with signup / trial / demo milestones called out.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GrowthPanel } from '@/components/analytics/GrowthPanel';
import { ReportsPanel } from '@/components/analytics/ReportsPanel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Breakpoints, FontSize, MaxContentWidthWide, Palette, Radius, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import type { Json } from '@/types/database';

type AnalyticsApp = 'michi' | 'tcgscan';

interface RecentUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  event_count: number;
  session_count: number;
  first_seen: string;
  last_seen: string;
}

interface JourneyEvent {
  id: string;
  name: string;
  props: Json;
  session_id: string | null;
  ts: string;
}

// Human labels for the events this app emits. Unknown names fall back to the raw name.
const EVENT_LABELS: Record<string, string> = {
  'session.start': 'Session started',
  'auth.login': 'Signed in',
  'account.created': 'Account created',
  'binder.add': 'Created a binder',
  'card.add': 'Added cards to a binder',
  'page.view': 'Viewed a page',
  'card.search': 'Searched cards',
  'csv.import': 'Imported a CSV',
  'demo.csv_import': 'Tried the example import',
  'demo.tricolor_search': 'Tried tri-color search',
  'demo.curation': 'Tried collection curation',
  'demo.print': 'Tried the print example',
  'trial.start': 'Started a PRO trial',
};

/** Milestones worth calling out visually in the timeline. */
function isMilestone(name: string): boolean {
  return name === 'account.created' || name === 'trial.start' || name.startsWith('demo.');
}

function labelFor(name: string): string {
  return EVENT_LABELS[name] ?? name;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function userLabel(u: RecentUser): string {
  if (u.username) return `@${u.username}`;
  if (u.display_name) return u.display_name;
  return shortId(u.user_id);
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function fmtRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Compact one-line summary of an event's props (ids and counts only, never PII by contract). */
function propsSummary(props: Json): string {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return '';
  const entries = Object.entries(props as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join('  ·  ');
}

export default function StudioScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= Breakpoints.rail;

  // Admin gate: fast path from the loaded profile, confirmed by the is_admin() RPC.
  const [adminOk, setAdminOk] = useState<boolean | null>(null);
  const [app, setApp] = useState<AnalyticsApp>('michi');
  const [users, setUsers] = useState<RecentUser[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [journey, setJourney] = useState<JourneyEvent[] | null>(null);
  const [loadingJourney, setLoadingJourney] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (profile?.is_admin) {
        if (active) setAdminOk(true);
        return;
      }
      if (!supabase) {
        if (active) setAdminOk(false);
        return;
      }
      try {
        const { data } = await supabase.rpc('is_admin');
        if (active) setAdminOk(data === true);
      } catch {
        if (active) setAdminOk(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.is_admin]);

  // User list for the active app. Newest-active first (the RPC orders it). Resets selection.
  useEffect(() => {
    if (!adminOk || !supabase) return;
    let active = true;
    (async () => {
      setUsers(null);
      setSelected(null);
      setJourney(null);
      try {
        const { data } = await supabase!.rpc('admin_recent_users', { p_app: app, p_limit: 200 });
        if (active) setUsers((data as RecentUser[] | null) ?? []);
      } catch {
        if (active) setUsers([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [adminOk, app]);

  // Selected user's journey for the active app.
  useEffect(() => {
    if (!adminOk || !supabase || !selected) return;
    let active = true;
    (async () => {
      setLoadingJourney(true);
      setJourney(null);
      try {
        const { data } = await supabase!.rpc('admin_user_journey', { target_user: selected, p_app: app });
        if (active) setJourney((data as JourneyEvent[] | null) ?? []);
      } catch {
        if (active) setJourney([]);
      } finally {
        if (active) setLoadingJourney(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [adminOk, selected, app]);

  const selectUser = useCallback((id: string) => setSelected(id), []);

  if (adminOk === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centerFill} edges={['top']}>
          <ActivityIndicator color={Palette.accent} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!adminOk) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centerFill} edges={['top']}>
          <ThemedText type="subtitle">Not authorized</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.notAuthedText}>
            This area is for administrators.
          </ThemedText>
          <Pressable onPress={() => router.push('/')} hitSlop={8} style={styles.homeLink}>
            <ThemedText type="link" themeColor="textSecondary">
              Back to home
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const selectedUser = users?.find((u) => u.user_id === selected) ?? null;
  const showList = wide || !selected;
  const showJourney = wide || !!selected;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <ThemedText type="subtitle" style={styles.title}>
              Studio
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Per-user activity
            </ThemedText>
          </View>
          <AppSwitcher app={app} onChange={setApp} />
        </View>

        {/*
          Community growth. michi-only: these totals count binders, pages and slots, which
          tcgscan does not have — the app switcher must not appear to filter them.
        */}
        {app === 'michi' ? <GrowthPanel /> : null}

        {/* The takedown queue. michi-only: reports are filed on binders and profiles, which
            tcgscan does not have. */}
        {app === 'michi' ? <ReportsPanel /> : null}

        <View style={[styles.body, wide && styles.bodyWide]}>
          {showList ? (
            <View style={[styles.listCol, wide && styles.listColWide]}>
              <UserList users={users} selected={selected} onSelect={selectUser} />
            </View>
          ) : null}

          {showJourney ? (
            <View style={styles.journeyCol}>
              {!wide && selected ? (
                <Pressable onPress={() => setSelected(null)} hitSlop={8} style={styles.backRow}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    ‹ All users
                  </ThemedText>
                </Pressable>
              ) : null}
              <JourneyView
                user={selectedUser}
                events={journey}
                loading={loadingJourney}
                hasSelection={!!selected}
              />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function AppSwitcher({ app, onChange }: { app: AnalyticsApp; onChange: (a: AnalyticsApp) => void }) {
  const options: AnalyticsApp[] = ['michi', 'tcgscan'];
  return (
    <View style={styles.switcher}>
      {options.map((opt) => {
        const active = app === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.switchBtn, active && styles.switchBtnActive]}>
            <ThemedText
              type={active ? 'smallBold' : 'small'}
              themeColor={active ? undefined : 'textSecondary'}
              style={styles.switchText}>
              {opt}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function UserList({
  users,
  selected,
  onSelect,
}: {
  users: RecentUser[] | null;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (users === null) {
    return (
      <View style={styles.centerPad}>
        <ActivityIndicator color={Palette.accent} />
      </View>
    );
  }
  if (users.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
        No activity recorded for this app yet.
      </ThemedText>
    );
  }
  return (
    <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
      {users.map((u) => {
        const active = u.user_id === selected;
        return (
          <Pressable
            key={u.user_id}
            onPress={() => onSelect(u.user_id)}
            style={[styles.userRow, active && styles.userRowActive]}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {userLabel(u)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.userMeta}>
              {u.event_count} event{u.event_count === 1 ? '' : 's'} · {u.session_count} session
              {u.session_count === 1 ? '' : 's'} · {fmtRelative(u.last_seen)}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function JourneyView({
  user,
  events,
  loading,
  hasSelection,
}: {
  user: RecentUser | null;
  events: JourneyEvent[] | null;
  loading: boolean;
  hasSelection: boolean;
}) {
  if (!hasSelection) {
    return (
      <View style={styles.centerPad}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
          Select a user to see their journey.
        </ThemedText>
      </View>
    );
  }
  if (loading || events === null) {
    return (
      <View style={styles.centerPad}>
        <ActivityIndicator color={Palette.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.journeyScroll} contentContainerStyle={styles.journeyContent}>
      {user ? (
        <View style={styles.journeyHeader}>
          <ThemedText type="smallBold">{userLabel(user)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {shortId(user.user_id)} · first seen {fmtTime(user.first_seen)}
          </ThemedText>
        </View>
      ) : null}

      {events.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
          No events for this user in the selected app.
        </ThemedText>
      ) : (
        events.map((ev, i) => {
          const newSession = i === 0 || ev.session_id !== events[i - 1].session_id;
          return (
            <View key={ev.id}>
              {newSession ? (
                <View style={styles.sessionDivider}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.sessionLabel}>
                    Session {ev.session_id ? shortId(ev.session_id) : 'unknown'}
                  </ThemedText>
                </View>
              ) : null}
              <EventRow event={ev} />
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function EventRow({ event }: { event: JourneyEvent }) {
  const milestone = isMilestone(event.name);
  const summary = propsSummary(event.props);
  return (
    <View style={styles.eventRow}>
      <View style={[styles.dot, milestone && styles.dotMilestone]} />
      <View style={styles.eventBody}>
        <ThemedText type={milestone ? 'smallBold' : 'small'} style={milestone ? styles.milestoneText : undefined}>
          {labelFor(event.name)}
        </ThemedText>
        {summary ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.eventProps}>
            {summary}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary" style={styles.eventTime}>
          {fmtTime(event.ts)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1, width: '100%', maxWidth: MaxContentWidthWide, alignSelf: 'center' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  centerPad: { padding: Spacing.four, alignItems: 'center' },
  notAuthedText: { textAlign: 'center' },
  homeLink: { marginTop: Spacing.two },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.four,
    gap: Spacing.three,
    flexWrap: 'wrap',
  },
  titleWrap: { gap: 2 },
  title: { fontSize: FontSize.title },
  switcher: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.pill,
    padding: 2,
    gap: 2,
  },
  switchBtn: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.three, borderRadius: Radius.pill },
  switchBtnActive: { backgroundColor: Palette.panel },
  switchText: { textTransform: 'capitalize' },
  body: { flex: 1 },
  bodyWide: { flexDirection: 'row' },
  listCol: { flex: 1 },
  listColWide: {
    flex: 0,
    width: 320,
    borderRightWidth: 1,
    borderRightColor: Palette.hairline,
  },
  journeyCol: { flex: 1 },
  backRow: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  listScroll: { flex: 1 },
  listContent: { padding: Spacing.three, gap: Spacing.one },
  userRow: {
    padding: Spacing.three,
    borderRadius: Radius.control,
    gap: 2,
  },
  userRowActive: { backgroundColor: Palette.panel },
  userMeta: { fontSize: FontSize.sm },
  emptyText: { padding: Spacing.four, lineHeight: 20 },
  journeyScroll: { flex: 1 },
  journeyContent: { padding: Spacing.four, gap: Spacing.two },
  journeyHeader: {
    gap: 2,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
    marginBottom: Spacing.two,
  },
  sessionDivider: { marginTop: Spacing.three, marginBottom: Spacing.one },
  sessionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, fontSize: FontSize.sm },
  eventRow: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.one },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Palette.hairlineStrong,
    marginTop: 5,
  },
  dotMilestone: { backgroundColor: Palette.accent },
  eventBody: { flex: 1, gap: 1 },
  milestoneText: { color: Palette.accent },
  eventProps: { fontSize: FontSize.sm, lineHeight: 17 },
  eventTime: { fontSize: FontSize.sm },
});
