/**
 * The binder contest page, AFTER the first contest (docs/CONTEST.md, "How the first contest
 * ended"). It is the record now, not the pitch: what ran, who won, what they won, and that a
 * better-targeted one comes later. The Hall of Fame renders from contest_winners and stays forever.
 *
 * The page is no longer in the nav rail (owner call, 2026-10-11); it is reached from the winning
 * binders' contest badge, from /contest-binders' rules link and by URL.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Breakpoints, MaxContentWidthDoc, Palette, Spacing } from '@/constants/theme';
import { fetchBinderTitles } from '@/data/binderRepo';
import { CATEGORIES, CONTEST, categoryLabel } from '@/data/contest';
import { fetchContestWinners, type ContestWinner } from '@/data/contestRepo';
import { isSupabaseConfigured } from '@/lib/env';

function fmtDate(iso: string): string {
  // The instants are UTC midnights, so without timeZone a US reader sees the day before.
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** The first-place prize of a category, from the same table the contest was announced with. */
function firstPrize(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.prizes.find((p) => p.place === '1st')?.prize ?? 'PRO';
}

export default function ContestScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;

  // Hall of Fame — rendered from contest_winners, which is written by us after a contest.
  const [winners, setWinners] = useState<ContestWinner[]>([]);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let stale = false;
    fetchContestWinners()
      .then(async (rows) => {
        if (stale || rows.length === 0) return;
        const t = await fetchBinderTitles(rows.map((w) => w.binderId));
        if (stale) return;
        setWinners(rows);
        setTitles(t);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, []);

  // "Best Aesthetic took home LIFETIME PRO" reads from the winners that exist, so the copy cannot
  // name a prize nobody received.
  const awarded = winners
    .filter((w) => w.place === 1)
    .map((w) => `${categoryLabel(w.category)} took home ${firstPrize(w.category)}`);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {railHidden ? (
            <View style={styles.backRow}>
              <Pressable onPress={() => router.push('/')} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ‹ Home
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          <ThemedText type="title" style={styles.h1}>
            🏆 {CONTEST.name}
          </ThemedText>

          {/* The record of the first contest. */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.h2}>
              About the contest
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
              Our first community binder contest ran from {fmtDate(CONTEST.opensAt)} to {fmtDate(CONTEST.endsAt)}.
              Collectors entered a public binder in one of six categories, and every like it collected was a
              vote.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
              {awarded.length > 0
                ? `The winners each received their category's first prize: ${awarded.join(', and ')}. Prizes are PRO memberships applied to the winning account.`
                : 'Winners received their category’s first prize as a PRO membership on their account.'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
              Thank you to everyone who entered and voted. We plan to run a bigger contest in the future, once
              more collectors have found michi-maker, with categories built around specific games and binder
              styles. Watch What’s New for the announcement.
            </ThemedText>
          </View>

          {/* Hall of Fame — permanent. */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.h2}>
              Hall of Fame
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
              The winners of the {CONTEST.name}, enshrined.
            </ThemedText>
            {winners.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
                Loading the winners…
              </ThemedText>
            ) : (
              winners.map((w) => (
                <Pressable
                  key={`${w.category}-${w.place}`}
                  onPress={() => router.push(`/binder/${w.binderId}` as Href)}
                  style={({ pressed }) => [styles.winnerRow, pressed && styles.dim]}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.winnerPlace}>
                    {categoryLabel(w.category)} · #{w.place}
                  </ThemedText>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.winnerTitle}>
                    {titles.get(w.binderId) ?? 'View binder'} ›
                  </ThemedText>
                  <Text style={styles.winnerPrize}>{w.place === 1 ? firstPrize(w.category) : ''}</Text>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidthDoc,
    alignSelf: 'center',
  },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.three },
  h1: { marginBottom: Spacing.two },
  section: { marginTop: Spacing.four, gap: Spacing.two },
  h2: { marginBottom: Spacing.one },
  para: { lineHeight: 20 },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  winnerPlace: { width: 190 },
  winnerTitle: { flex: 1, color: Palette.accent },
  winnerPrize: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  dim: { opacity: 0.7 },
});
