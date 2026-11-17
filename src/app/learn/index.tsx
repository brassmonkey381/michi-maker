/**
 * `/learn` — the how-to hub. One card per guide from src/data/guides.ts; adding a guide there
 * adds it here automatically.
 */
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { CurateCallout } from '@/components/CurateCallout';
import { ExternalLink } from '@/components/external-link';
import { GuideHook } from '@/components/learn/GuideFigure';
import type { GuideHook as GuideHookData } from '@/data/guides';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Radius, Shadows, Spacing, MaxContentWidthDoc } from '@/constants/theme';
import { GUIDE_LIST } from '@/data/guides';
import { flag } from '@/lib/flags';

/** MIC-017 piece 14 ('dev'): pictures first, titles only. */
const LEARN_CLEAN = flag('learn-clean');

export default function LearnHubScreen() {
  const router = useRouter();
  // TWO ACROSS ON A DESKTOP. One card per row at the document width left the right two thirds of
  // every card empty beside a 72px picture. Paired, each card is about 450px with a card-sized
  // hook at 120px, so the pictures carry their share of the row; a narrow window stacks them.
  const { width } = useWindowDimensions();
  const twoUp = width >= 760;
  const hookW = LEARN_CLEAN ? (twoUp ? 200 : Math.max(120, Math.floor((width - 64) / 2) - 24)) : twoUp ? 120 : 84;
  // ONE PICTURE HEIGHT FOR EVERY TILE (MIC-039 p20; owner: same height, never cropped or shrunk,
  // bigger if anything). Each picture is drawn whole at this height, so the titles line up.
  const picH = twoUp ? 340 : Math.round(hookW * 1.7);
  return (
    <PageShell
      maxWidth={MaxContentWidthDoc}
      title="Pokémon binder how-to guides"
      description="Short illustrated guides to building a Pokémon binder the michi way: fill a page around one card, cut art into pockets, print at true card size, and search your cards."
      heading="Pokémon binder how-to guides"
      lede="Short, practical walkthroughs of the craft: building a binder, cutting art into pockets, and getting it onto paper at true size.">

      <View style={[styles.list, (twoUp || LEARN_CLEAN) && styles.listTwoUp]}>
        {GUIDE_LIST.map((g) => {
          const card = LEARN_CLEAN ? (
            <ThemedView type="backgroundElement" style={[styles.card, styles.cleanCard]} testID="learn-tile">
              <View style={[styles.cleanPic, { height: picH }]}>
                <EvenHook hook={g.hook} height={picH} maxWidth={g.wide ? 420 : twoUp ? 300 : hookW + 24} />
              </View>
              <ThemedText type="smallBold" style={styles.cleanTitle}>
                {g.title}
              </ThemedText>
            </ThemedView>
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              <GuideHook hook={g.hook} width={hookW} />
              <View style={[styles.cardBody, g.wide && styles.cardBodyWide]}>
              <View style={styles.cardHead}>
                <ThemedText type="smallBold" style={styles.cardTitle}>
                  {g.title}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cardLede}>
                {g.lede}
              </ThemedText>
              <ThemedText type="linkPrimary" style={styles.cardLink}>
                Read the guide →
              </ThemedText>
              </View>
            </ThemedView>
          );
          // A guide can point at a hosted page instead of its in-app steps (see Guide.externalHref).
          // Those are real URLs, not Expo routes, so they must never go through router.push.
          return g.externalHref ? (
            <ExternalLink key={g.slug} href={g.externalHref as Href & string} asChild>
              <Pressable
                accessibilityRole="link"
                style={({ pressed }) => [LEARN_CLEAN ? (g.wide ? styles.wide : twoUp ? styles.third : styles.half) : twoUp && (g.wide ? styles.wide : styles.half), pressed && styles.pressed]}>
                {card}
              </Pressable>
            </ExternalLink>
          ) : (
            <Pressable
              key={g.slug}
              onPress={() => router.push(`/learn/${g.slug}` as Href)}
              accessibilityRole="link"
              style={({ pressed }) => [LEARN_CLEAN ? (g.wide ? styles.wide : twoUp ? styles.third : styles.half) : twoUp && (g.wide ? styles.wide : styles.half), pressed && styles.pressed]}>
              {card}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.callout}>
        <CurateCallout surface="learn" />
      </View>
    </PageShell>
  );
}

/**
 * A guide's picture drawn whole at a set HEIGHT. The hooks size by width and each has its own
 * shape (a card, a 3 x 2 pocket sheet, a fan), so it is drawn once at a probe width, measured, and
 * redrawn at the width that gives the asked height, capped by the room the tile has.
 */
function EvenHook({ hook, height, maxWidth }: { hook: GuideHookData; height: number; maxWidth: number }) {
  const PROBE = 100;
  const [ratio, setRatio] = useState(0); // height / width of this hook
  if (!ratio) {
    return (
      <View style={styles.probe} onLayout={(e) => e.nativeEvent.layout.height > 0 && setRatio(e.nativeEvent.layout.height / PROBE)}>
        <GuideHook hook={hook} width={PROBE} />
      </View>
    );
  }
  return <GuideHook hook={hook} width={Math.max(40, Math.min(maxWidth, Math.floor(height / ratio)))} />;
}

const styles = StyleSheet.create({
  probe: { opacity: 0, alignSelf: 'flex-start' },
  callout: { marginTop: 28 },
  // Piece 14: pictures first, titles only.
  third: { width: '31.5%', flexGrow: 1 },
  cleanCard: { flexDirection: 'column', alignItems: 'center', gap: 10, paddingVertical: 16 },
  cleanPic: { alignItems: 'center', justifyContent: 'center' },
  cleanTitle: { textAlign: 'center', fontSize: FontSize.md },
  list: { gap: Spacing.three },
  listTwoUp: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  // Two per row with one gap between: each takes half of what is left. Percentages would ignore
  // the gap and wrap to one per row.
  half: { width: '48.5%', flexGrow: 1 },
  // A wide card (a hook three cards across) takes the full row, and no more: without an explicit
  // width a row-wrapped item sizes to its content, and three real cards plus a long lede ran past
  // the column the paired cards sit in.
  wide: { width: '100%' },
  pressed: { opacity: 0.8 },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    ...Shadows.page,
  },
  cardBody: { flex: 1, minWidth: 0, gap: Spacing.two },
  // Beside three cards the text keeps a reading measure and wraps, rather than one long line.
  cardBodyWide: { maxWidth: 480 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  cardTitle: { fontSize: FontSize.md, flexShrink: 1 },
  cardLede: { lineHeight: 20 },
  cardLink: { fontSize: FontSize.label, marginTop: Spacing.one },
});
