/**
 * Public profile route (`/u/[id]`): a person's page: avatar, name, bio, and the public binders
 * they've shared. Reached from the People search window or a shared profile link.
 *
 * A private profile and one that doesn't exist are THE SAME state to a visitor, on purpose and
 * now at the RLS level too (20260826130000): a non-owner's read of a private profile returns no
 * row, so this page cannot distinguish them and the copy claims nothing it can't know. The owner
 * still sees their own page whatever the flag says.
 */
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Image } from 'expo-image';

import { BinderCarousel } from '@/components/binder/BinderCarousel';
import { ReportSheet } from '@/components/binder/ReportSheet';
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
  | { status: 'missing' };

export default function ProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reporting, setReporting] = useState(false);

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
        // RLS only returns a private profile to its owner, so reaching here with isPublic false
        // IS the owner's own view; no second check needed.
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
        ) : state.status === 'missing' ? (
          <View style={styles.center}>
            <ThemedText type="subtitle" style={styles.missTitle}>
              Profile not available
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.missText}>
              This profile is private, doesn’t exist, or is no longer available.
            </ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            {state.profile.avatarUrl ? (
              <Image
                source={{ uri: state.profile.avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={styles.avatar}>
                <ThemedText style={styles.avatarText}>
                  {(state.profile.username || '?').trim().charAt(0).toUpperCase()}
                </ThemedText>
              </View>
            )}
            <ThemedText type="subtitle" style={styles.name}>
              {name}
            </ThemedText>
            {state.profile.bio ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.bio}>
                {state.profile.bio}
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

            {/* The takedown intake for profile content (bio, avatar), the same flow as reporting a
                binder, filed with profile_id instead. Hidden on your own page. */}
            {user?.id !== state.profile.id ? (
              <Pressable onPress={() => setReporting(true)} hitSlop={6} style={styles.reportLink}>
                <ThemedText type="small" themeColor="textSecondary">
                  Report this profile
                </ThemedText>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
        {reporting && state.status === 'ok' ? (
          <ReportSheet
            target={{ profileId: state.profile.id }}
            onClose={() => setReporting(false)}
          />
        ) : null}
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
    overflow: 'hidden',
  },
  avatarText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.display },
  name: { marginTop: Spacing.two, textAlign: 'center' },
  bio: { marginTop: Spacing.two, textAlign: 'center', maxWidth: 480, lineHeight: 20 },
  reportLink: { marginTop: Spacing.five, alignSelf: 'center', opacity: 0.8 },
  hint: { marginTop: Spacing.two, textAlign: 'center' },
  section: { width: '100%', marginTop: Spacing.five, gap: Spacing.three },
  sectionTitle: { fontSize: FontSize.md },
});
