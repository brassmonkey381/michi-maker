/**
 * Public profile route (`/u/[id]`): a person's page: avatar, name, bio, and the public binders
 * they've shared. Reached from the People search window or a shared profile link.
 *
 * THE PARAM IS A HANDLE, not necessarily an id. It is the person's username when they have one
 * (`/u/fakemichi`) and their uuid when they don't, and `fetchProfile` accepts either — every
 * /u/<uuid> link shared before usernames were used in URLs still has to resolve. The file keeps
 * the `[id]` name because renaming a route param is churn the router would feel and nobody else
 * would; read `id` here as "handle".
 *
 * A visitor who arrives by uuid on a profile that HAS a username is redirected to the username
 * form, so the URL they copy from the address bar is the readable one.
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
import { Wordmark } from '@/components/brand/Wordmark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, MaxContentWidthWide, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchPublicBinders } from '@/data/binderRepo';
import { sortByRecentEdit, type DemoBinder } from '@/data/binderTypes';
import { CONTEST, categoryLabel } from '@/data/contest';
import { fetchWinsForOwner, type ContestWinner } from '@/data/contestRepo';
import { fetchProfile, type PublicProfile } from '@/data/profileRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

/** 1 → 1st, 2 → 2nd, 3 → 3rd, 4 → 4th. */
function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

type State =
  | { status: 'loading' }
  | { status: 'ok'; profile: PublicProfile; binders: DemoBinder[]; wins: ContestWinner[] }
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
        // Arrived by id but the person has a username: swap the address bar over to it, so the
        // link someone copies from here is the readable one. `replace`, not `push`, so Back still
        // leaves the profile rather than bouncing between two spellings of the same page. Old
        // /u/<uuid> links keep working — this upgrades them rather than breaking them.
        if (Platform.OS === 'web' && profile.username && profile.username !== id) {
          router.replace(`/u/${profile.username}` as never);
        }
        // RLS only returns a private profile to its owner, so reaching here with isPublic false
        // IS the owner's own view; no second check needed.
        // Most recently edited first, same as the owner's own shelf.
        // The trophy is decoration: a failed read of it must not take the profile down with it.
        const [binders, wins] = await Promise.all([
          fetchPublicBinders(profile.id).then(sortByRecentEdit),
          fetchWinsForOwner(profile.id).catch(() => [] as ContestWinner[]),
        ]);
        if (active) setState({ status: 'ok', profile, binders, wins });
      } catch {
        if (active) setState({ status: 'missing' });
      }
    })();
    return () => {
      active = false;
    };
  }, [id, user, router]);
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
                ‹ <Wordmark />
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
            {/* CONTEST WINNERS wear a small trophy on the avatar's corner and one quiet line under
                the name that goes to the Hall of Fame. On the account, not the binder (owner call,
                2026-10-11): the person won, and the binder may be edited or deleted later. */}
            <View style={styles.avatarWrap}>
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
              {state.wins.length > 0 ? (
                <View
                  style={styles.trophy}
                  accessibilityLabel="Contest winner"
                  accessibilityRole="image">
                  <ThemedText style={styles.trophyText}>🏆</ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText type="subtitle" style={styles.name}>
              {name}
            </ThemedText>
            {state.wins.length > 0 ? (
              <Link href="/contest" asChild>
                <Pressable hitSlop={6}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.winLine}>
                    {state.wins
                      .map((w) => `${ordinal(w.place)} place, ${categoryLabel(w.category)}`)
                      .join(' · ')}
                    {' · '}
                    {CONTEST.name} ›
                  </ThemedText>
                </Pressable>
              </Link>
            ) : null}
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
  avatarWrap: { width: 72, height: 72 },
  // Sits on the avatar's lower-right edge, on a disc the page's own colour so it reads as a pin
  // rather than part of the picture.
  trophy: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyText: { fontSize: 14, lineHeight: 18 },
  winLine: { marginTop: Spacing.one, textAlign: 'center' },
  name: { marginTop: Spacing.two, textAlign: 'center' },
  bio: { marginTop: Spacing.two, textAlign: 'center', maxWidth: 480, lineHeight: 20 },
  reportLink: { marginTop: Spacing.five, alignSelf: 'center', opacity: 0.8 },
  hint: { marginTop: Spacing.two, textAlign: 'center' },
  section: { width: '100%', marginTop: Spacing.five, gap: Spacing.three },
  sectionTitle: { fontSize: FontSize.md },
});
