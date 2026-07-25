/**
 * The binder contest page — marketing surface AND official rules (docs/CONTEST.md). Everything
 * renders from src/data/contest.ts, so prize/date/copy changes happen there. Includes the Hall
 * of Fame section, which appears once contest_winners rows exist (post-contest) and enshrines
 * the winning binders permanently.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  BottomTabInset,
  Breakpoints,
  FontSize,
  MaxContentWidth,
  Palette,
  Radius,
  Spacing,
  Weight,
} from '@/constants/theme';
import { fetchBinderTitles } from '@/data/binderRepo';
import { CATEGORIES, CONTEST, contestPhase, categoryLabel } from '@/data/contest';
import { fetchContestWinners, type ContestWinner } from '@/data/contestRepo';
import { isSupabaseConfigured } from '@/lib/env';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ContestScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const railHidden = Platform.OS !== 'web' || width < Breakpoints.rail;
  const phase = contestPhase();

  // Hall of Fame — empty until winners are declared; then it stays forever.
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

          {/* Hero */}
          <ThemedText type="title" style={styles.h1}>
            🏆 {CONTEST.name}
          </ThemedText>
          <ThemedText type="small" style={styles.headline}>
            {CONTEST.headline}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            {CONTEST.subhead}
          </ThemedText>
          <View style={styles.datesRow}>
            <Text style={styles.dateChip}>
              {phase === 'upcoming'
                ? `Entries open ${fmtDate(CONTEST.opensAt)}`
                : phase === 'open'
                  ? `Open now! Voting ends ${fmtDate(CONTEST.endsAt)}`
                  : `Ended ${fmtDate(CONTEST.endsAt)}`}
            </Text>
          </View>

          {phase !== 'ended' ? (
            <View style={styles.ctaRow}>
              <Pressable
                onPress={() => router.push('/my-binders' as Href)}
                style={({ pressed }) => [styles.cta, pressed && styles.dim]}>
                <Text style={styles.ctaText}>Enter a binder ›</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/discover' as Href)}
                style={({ pressed }) => [styles.ctaGhost, pressed && styles.dim]}>
                <Text style={styles.ctaGhostText}>See the entries</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Hall of Fame — permanent, once winners exist. */}
          {winners.length > 0 ? (
            <View style={styles.section}>
              <ThemedText type="subtitle" style={styles.h2}>
                Hall of Fame
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
                The winners of the {CONTEST.name}, enshrined.
              </ThemedText>
              {winners.map((w) => (
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
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* How to enter */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.h2}>
              How to enter
            </ThemedText>
            {[
              'Build a binder and make it public from the Share sheet. Any size binder can enter, as long as at most 16 pages are public.',
              'In the Share sheet, pick exactly ONE category and tap Enter contest.',
              'Rally votes! Anyone can ♥ your binder on its public page or from Discover.',
              'Enter early: leaderboards run all contest long, and early votes mean more eyes on your binder.',
            ].map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepNum}>{i + 1}</Text>
                <ThemedText type="small" themeColor="textSecondary" style={styles.stepText}>
                  {s}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Prizes */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.h2}>
              Categories & prizes
            </ThemedText>
            {CATEGORIES.map((c) => (
              <View key={c.slug} style={[styles.catCard, c.flagship && styles.catCardFlagship]}>
                <ThemedText type="smallBold" style={styles.catLabel}>
                  {c.flagship ? '★ ' : ''}
                  {c.label}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.catBlurb}>
                  {c.blurb}
                </ThemedText>
                <View style={styles.prizeRows}>
                  {c.prizes.map((p) => (
                    <View key={p.place} style={styles.prizeRow}>
                      <Text style={styles.prizePlace}>{p.place}</Text>
                      <Text style={[styles.prizeName, p.prize.includes('LIFETIME') && styles.prizeLifetime]}>
                        {p.prize}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Official rules */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.h2}>
              Official rules
            </ThemedText>
            {[
              'No purchase necessary to enter or win.',
              `Entries open ${fmtDate(CONTEST.opensAt)} and close ${fmtDate(CONTEST.endsAt)}. Winners are determined by vote counts at the close time.`,
              'Enter by marking a public binder with exactly one category. The category choice is final. You may withdraw an entry until the close time (re-entering resets your entry time). One category per binder; you may enter multiple binders.',
              `Entries may show at most ${CONTEST.pageCap} public pages. Binders of any size can enter by hiding pages down to ${CONTEST.pageCap} public ones, and only the first ${CONTEST.pageCap} public pages of an entry are shown in contest views.`,
              'Winners are determined purely by most votes (binder likes) in the entered category. Vote-count ties display in shuffled order but final ties are broken by earliest entry time.',
              'We reserve the right to disqualify entries that violate the Terms of Service or DMCA (use art you have the rights to, and credit your sources), and entries with fraudulent votes (bots, scripts, or multiple accounts).',
              'Prizes are michi-maker subscription grants applied to the winning account; they have no cash value and are not transferable.',
              'Entering requires a free michi-maker account and a public profile. Void where prohibited.',
              'Sponsor: michi-maker. Winners will be announced on this page and notified via their account.',
            ].map((r, i) => (
              <View key={i} style={styles.ruleRow}>
                <Text style={styles.ruleBullet}>•</Text>
                <ThemedText type="small" themeColor="textSecondary" style={styles.ruleText}>
                  {r}
                </ThemedText>
              </View>
            ))}
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
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.three },
  h1: { marginBottom: Spacing.two },
  headline: { fontWeight: Weight.bold, marginBottom: Spacing.one, lineHeight: 20 },
  sub: { lineHeight: 20, marginBottom: Spacing.three },
  datesRow: { flexDirection: 'row', marginBottom: Spacing.three },
  dateChip: {
    fontSize: FontSize.sm,
    fontWeight: Weight.bold,
    color: Palette.accent,
    backgroundColor: Palette.selectionSoft,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    overflow: 'hidden',
  },
  ctaRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.four },
  cta: {
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  ctaText: { color: Palette.accentText, fontSize: FontSize.control, fontWeight: Weight.bold },
  ctaGhost: {
    borderWidth: 1,
    borderColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  ctaGhostText: { color: Palette.accent, fontSize: FontSize.control, fontWeight: Weight.semibold },
  section: { marginTop: Spacing.four, gap: Spacing.two },
  h2: { marginBottom: Spacing.one },
  para: { lineHeight: 20 },
  stepRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Palette.accent,
    color: Palette.accentText,
    fontSize: FontSize.sm,
    fontWeight: Weight.bold,
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  stepText: { flex: 1, lineHeight: 20 },
  catCard: {
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  catCardFlagship: { borderColor: Palette.accent, backgroundColor: Palette.selectionSoft },
  catLabel: { fontSize: FontSize.md },
  catBlurb: { lineHeight: 18 },
  prizeRows: { marginTop: Spacing.one, gap: 2 },
  prizeRow: { flexDirection: 'row', gap: Spacing.two },
  prizePlace: { width: 72, fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.muted },
  prizeName: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink2 },
  prizeLifetime: { color: Palette.accent, fontWeight: Weight.bold },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  winnerPlace: { width: 190 },
  winnerTitle: { flex: 1, color: Palette.accent },
  ruleRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  ruleBullet: { color: Palette.muted, lineHeight: 20 },
  ruleText: { flex: 1, lineHeight: 20 },
  dim: { opacity: 0.7 },
});
