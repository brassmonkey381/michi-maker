/**
 * COVERAGE: which search, page fill and scanning features are live for each game, and which are
 * still being filled in (data/gameCoverage). Statuses only, never counts.
 *
 * Wide screens get the table (games down, features across); a phone gets one block per game with
 * its five features listed, because five pill columns do not fit 400 px.
 */
import { Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { Breakpoints, FontSize, MaxContentWidthDoc, Palette, Spacing, Weight } from '@/constants/theme';
import {
  COVERAGE_AS_OF,
  COVERAGE_FEATURES,
  COVERAGE_PDF,
  COVERAGE_ROWS,
  type CoverageRow,
  type CoverageStatus,
} from '@/data/gameCoverage';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function liveCount(r: CoverageRow): number {
  return COVERAGE_FEATURES.filter((f) => r.status[f.key] === 'live').length;
}

function Pill({ status }: { status: CoverageStatus }) {
  const live = status === 'live';
  const tone = live ? Palette.success : Palette.warning;
  return (
    <View style={[styles.pill, { backgroundColor: `${tone}22` }]}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <ThemedText style={styles.pillText}>{live ? 'Live' : 'WIP'}</ThemedText>
    </View>
  );
}

function GameName({ r }: { r: CoverageRow }) {
  return (
    <View style={styles.gameCell}>
      <ThemedText type="smallBold" style={styles.gameName}>
        {r.game}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {r.note ? `${r.note} · ` : ''}
        {liveCount(r)} of {COVERAGE_FEATURES.length} live
      </ThemedText>
    </View>
  );
}

export default function CoverageScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= Breakpoints.phone;

  return (
    <PageShell
      title="Coverage"
      description="Which search, page fill and scanning features are live for each trading card game on Michi-Maker."
      maxWidth={MaxContentWidthDoc}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
        FEATURE COVERAGE · {fmtDate(COVERAGE_AS_OF).toUpperCase()}
      </ThemedText>
      <ThemedText type="title" style={styles.h1}>
        What works for each game
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        You can build binders for every game below. This table shows which search, page fill and scanning
        features are fully live for each game, and which are still being filled in.
      </ThemedText>

      {wide ? (
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <View style={styles.gameCol}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Game
              </ThemedText>
            </View>
            {COVERAGE_FEATURES.map((f) => (
              <View key={f.key} style={styles.featCol}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.center}>
                  {f.label}
                </ThemedText>
                <ThemedText style={styles.blurb}>{f.blurb}</ThemedText>
              </View>
            ))}
          </View>
          {COVERAGE_ROWS.map((r, i) => (
            <View key={r.game} style={[styles.row, i > 0 && styles.rule]}>
              <View style={styles.gameCol}>
                <GameName r={r} />
              </View>
              {COVERAGE_FEATURES.map((f) => (
                <View key={f.key} style={[styles.featCol, styles.middle]}>
                  <Pill status={r.status[f.key]} />
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.cards}>
          {COVERAGE_ROWS.map((r) => (
            <View key={r.game} style={styles.card}>
              <GameName r={r} />
              {COVERAGE_FEATURES.map((f) => (
                <View key={f.key} style={styles.cardLine}>
                  <ThemedText type="small" style={styles.flex}>
                    {f.label}
                  </ThemedText>
                  <Pill status={r.status[f.key]} />
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      <View style={styles.key}>
        <View style={styles.keyCol}>
          <ThemedText type="smallBold">What the labels mean</ThemedText>
          <View style={styles.keyLine}>
            <Pill status="live" />
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              Works for at least 70% of the game’s released cards.
            </ThemedText>
          </View>
          <View style={styles.keyLine}>
            <Pill status="wip" />
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              Works today for the cards it covers, and more cards are added as we go.
            </ThemedText>
          </View>
        </View>
        <View style={styles.keyCol}>
          <ThemedText type="smallBold">Why some are WIP</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.para}>
            Magic and Yu-Gi-Oh! have tens of thousands of printings, so their cards are added in batches. The
            scanner and similar fill learn each game’s cards first, and theme search needs every card’s art
            described before it goes live.
          </ThemedText>
        </View>
      </View>

      {Platform.OS === 'web' ? (
        <Pressable onPress={() => Linking.openURL(COVERAGE_PDF)} hitSlop={8} style={({ pressed }) => [styles.pdf, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.link}>
            Download as PDF ›
          </ThemedText>
        </Pressable>
      ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  eyebrow: { letterSpacing: 1.2, fontWeight: Weight.semibold, color: Palette.accent },
  h1: { marginTop: Spacing.one },
  lede: { marginTop: Spacing.two, lineHeight: 20, maxWidth: 620 },

  table: {
    marginTop: Spacing.four,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: Spacing.three, paddingVertical: 12 },
  headRow: { borderBottomWidth: 1, borderBottomColor: Palette.hairline, alignItems: 'flex-end' },
  rule: { borderTopWidth: 1, borderTopColor: Palette.hairline },
  gameCol: { flex: 1.4, justifyContent: 'center' },
  featCol: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.one },
  middle: { justifyContent: 'center' },
  center: { textAlign: 'center' },
  blurb: { fontSize: FontSize.sm, color: Palette.muted, textAlign: 'center', marginTop: 2 },
  gameCell: { gap: 2 },
  gameName: { fontSize: FontSize.md },

  cards: { marginTop: Spacing.four, gap: Spacing.three },
  card: { borderWidth: 1, borderColor: Palette.hairline, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  cardLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 8, paddingRight: 10, borderRadius: 999, alignSelf: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: FontSize.label, fontWeight: Weight.semibold, lineHeight: 16 },

  key: { marginTop: Spacing.five, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  keyCol: { flexGrow: 1, flexBasis: 260, gap: Spacing.two },
  keyLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  para: { lineHeight: 20 },

  pdf: { marginTop: Spacing.four, alignSelf: 'flex-start' },
  link: { color: Palette.link },
  pressed: { opacity: 0.7 },
});
