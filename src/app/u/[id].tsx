/**
 * Public profile route (`/u/[id]`) — a person's page: their name, an upvote control, and the
 * public binders they've shared. Reached from the People search window or a shared profile link.
 * A private profile (or one that doesn't exist) shows a friendly "not available" state, except to
 * its owner. Card images resolve from ids, so the page paints without the catalog.
 */
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinderCarousel } from '@/components/binder/BinderCarousel';
import { UpvoteButton } from '@/components/people/UpvoteButton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchPublicBinders } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { fetchProfile, type PublicProfile } from '@/data/profileRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

type State =
  | { status: 'loading' }
  | { status: 'ok'; profile: PublicProfile; binders: DemoBinder[] }
  | { status: 'private' }
  | { status: 'missing' };

export default function ProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [needAccount, setNeedAccount] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-id-change: reset to loading, then resolve. */
  useEffect(() => {
    if (!isSupabaseConfigured || !id) {
      setState({ status: 'missing' });
      return;
    }
    let active = true;
    setState({ status: 'loading' });
    (async () => {
      try {
        const profile = await fetchProfile(id);
        if (!active) return;
        if (!profile) {
          setState({ status: 'missing' });
          return;
        }
        const isSelf = user?.id === profile.id;
        if (!profile.isPublic && !isSelf) {
          setState({ status: 'private' });
          return;
        }
        const binders = await fetchPublicBinders(profile.id);
        if (active) setState({ status: 'ok', profile, binders });
      } catch {
        if (active) setState({ status: 'missing' });
      }
    })();
    return () => {
      active = false;
    };
  }, [id, user]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const name =
    state.status === 'ok'
      ? state.profile.username
        ? `@${state.profile.username}`
        : 'Unnamed collector'
      : '';

  // Nice browser-tab title on web.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = name ? `${name} · michi-maker` : 'michi-maker';
    }
  }, [name]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.topbar}>
          <Link href="/" asChild>
            <Pressable hitSlop={8}>
              <ThemedText type="link" themeColor="textSecondary">
                ‹ michi-maker
              </ThemedText>
            </Pressable>
          </Link>
        </View>

        {state.status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : state.status === 'missing' || state.status === 'private' ? (
          <View style={styles.center}>
            <ThemedText type="subtitle" style={styles.missTitle}>
              {state.status === 'private' ? 'This profile is private' : 'Profile not available'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.missText}>
              {state.status === 'private'
                ? 'This collector has made their profile private.'
                : 'This profile doesn’t exist or is no longer available.'}
            </ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.avatar}>
              <ThemedText style={styles.avatarText}>
                {(state.profile.username || '?').trim().charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText type="subtitle" style={styles.name}>
              {name}
            </ThemedText>

            <View style={styles.upvoteRow}>
              <UpvoteButton profileId={state.profile.id} onNeedsAccount={() => setNeedAccount(true)} />
            </View>
            {needAccount ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Sign in with an account to upvote this person.
              </ThemedText>
            ) : null}

            <View style={styles.section}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Public binders
              </ThemedText>
              {state.binders.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No public binders yet.
                </ThemedText>
              ) : (
                <BinderCarousel
                  binders={state.binders}
                  onOpen={(bid) => router.push(`/binder/${bid}`)}
                />
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  topbar: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  missTitle: { fontSize: FontSize.title, lineHeight: 30, textAlign: 'center' },
  missText: { textAlign: 'center' },
  scroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    // Wide shell — the public-binders carousel adds columns on desktop to showcase the art.
    maxWidth: MaxContentWidthWide,
    alignSelf: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.display },
  name: { marginTop: Spacing.two, textAlign: 'center' },
  upvoteRow: { marginTop: Spacing.three, alignItems: 'center' },
  hint: { marginTop: Spacing.two, textAlign: 'center' },
  section: { width: '100%', marginTop: Spacing.five, gap: Spacing.three },
  sectionTitle: { fontSize: FontSize.md },
});
