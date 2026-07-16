import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { BinderThumb } from '@/components/binder/BinderThumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  FontSize,
  MaxContentWidth,
  MaxContentWidthWide,
  Palette,
  Radius,
  Shadows,
  Spacing,
  Weight,
} from '@/constants/theme';
import { SAMPLE_BINDERS } from '@/data/sampleData';
import { markLandingSeen } from '@/lib/landing';

/**
 * The marketing landing page. First-time web visitors land here from `/` (see lib/landing);
 * it stays reachable at /welcome forever as the linkable "what is this?" page.
 *
 * Everything visual on this page is REAL: the hero and the gallery render bundled example
 * binders through the same BinderGrid the app uses. Nothing here forces the catalog load —
 * non-editable grids with no captions paint covers straight from card ids.
 */

const BINDERS_BY_ID = new Map(SAMPLE_BINDERS.map((b) => [b.id, b]));

/** One page that tells a story at a glance: the rarity ladder, common → hyper. */
const HERO_ID = 'gen-prismatic-rarity-ladder';
/** A curated spread of looks: grails, budget holos, vintage, completion, galleries. */
const GALLERY_IDS = [
  'gen-grail-wall',
  'gen-vintage-vs-modern-grails',
  'gen-dollar-bin-holos',
  'gen-sv-supporter-gallery',
  'gen-reprints-doppelgangers',
  'gen-base-set-completion',
];

const VALUE_PROPS = [
  {
    title: 'Composition, not cataloging',
    body: 'Most binder apps sort your cards. michi-maker composes them: anchor pages, color spreads, rarity ladders, artist galleries. Every pocket placed on purpose.',
  },
  {
    title: 'Real binder physics',
    body: 'Pages come in real side-load sizes (3×3, 3×4, 4×4). Jumbo cards span four pockets, V-UNIONs assemble from their pieces, and folded art crosses the fold, exactly like the binder on your shelf.',
  },
  {
    title: 'From screen to shelf',
    body: 'Print cut-ready fill sheets at true card size, 2.5″ × 3.5″ at pocket pitch, so the page you composed drops straight into real pockets. Most tools print undersized; we don’t.',
  },
] as const;

const FEATURES = [
  {
    title: 'Composer',
    body: 'Seed a pocket with one card and auto-curate the page around it. Seven michi methods, from evolution lines and species pages to color runs.',
  },
  {
    title: 'Slice Studio',
    body: 'Slice any artwork across pockets with aspect-true windows, rotation and flips. Merge pieces into folded pairs that span the fold of a real page.',
  },
  {
    title: 'Build-a-binder',
    body: 'Turn a pile of cards into story-first pages in one pass: chase boards, evolution lines, artist pages, set completions, type clusters.',
  },
  {
    title: 'My Collection',
    body: 'Scans from the tcgscan app and CSV imports land here live. Fill binders from what you own: green for owned, gray for still hunting.',
  },
  {
    title: 'True-size printing',
    body: 'Fill sheets ship with placeholders, your real sliced art, and inserts. Gap compensation keeps mounted pictures reading continuous across pockets.',
  },
  {
    title: 'Share your pages',
    body: 'Publish binders at a permanent @username, collect likes, and climb the rolling featured leaderboard. Anyone can flip through, no account needed.',
  },
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  const { width: windowW } = useWindowDimensions();
  const wide = windowW >= 920;

  const scrollRef = useRef<ScrollView>(null);
  const galleryY = useRef(0);

  const enterApp = () => {
    markLandingSeen();
    router.replace('/');
  };
  const openBinder = (id: string) => {
    markLandingSeen();
    router.push(`/binder/${id}`);
  };
  const scrollToGallery = () =>
    scrollRef.current?.scrollTo({ y: galleryY.current, animated: true });

  const heroBinder = BINDERS_BY_ID.get(HERO_ID) ?? SAMPLE_BINDERS[0];
  const galleryBinders = GALLERY_IDS.map((id) => BINDERS_BY_ID.get(id)).filter(
    (b): b is NonNullable<typeof b> => !!b,
  );

  // The hero page render: big enough to read the cards, never wider than the phone.
  const heroW = wide ? 420 : Math.min(windowW - Spacing.five * 2, 380);
  const thumbW = wide ? 300 : Math.min(windowW - Spacing.five * 2, 280);

  return (
    <ThemedView style={styles.root}>
      {Platform.OS === 'web' ? (
        <Head>
          <title>michi-maker: build beautiful Pokémon card binders</title>
          <meta
            name="description"
            content="Compose curated Pokémon card binder pages: rarity ladders, color spreads, artist galleries. Print true-size fill sheets and build the real thing. Free while in beta."
          />
        </Head>
      ) : null}
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
          {/* ── Nav ─────────────────────────────────────────────────────── */}
          <View style={styles.shell}>
            <View style={styles.nav}>
              <ThemedText style={styles.wordmark}>michi-maker</ThemedText>
              <Pressable
                onPress={enterApp}
                style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}>
                <ThemedText style={styles.navBtnText}>Open the app →</ThemedText>
              </Pressable>
            </View>

            {/* ── Hero ────────────────────────────────────────────────── */}
            <View style={[styles.hero, wide && styles.heroWide]}>
              <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
                <ThemedText style={styles.kicker}>THE MICHI METHOD, DIGITIZED</ThemedText>
                <ThemedText
                  style={[styles.h1, !wide && styles.h1Narrow]}
                  accessibilityRole="header">
                  Binder pages worth staring at.
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.heroSub}>
                  michi-maker is a studio for curated Pokémon card binders. Compose anchor
                  pages, rarity ladders, color spreads and artist galleries, then print
                  true-size fill sheets and build the real thing.
                </ThemedText>
                <View style={styles.ctaRow}>
                  <Pressable
                    onPress={enterApp}
                    style={({ pressed }) => [styles.ctaPrimary, pressed && styles.pressed]}>
                    <ThemedText style={styles.ctaPrimaryText}>Start building for free</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={scrollToGallery}
                    style={({ pressed }) => [styles.ctaSecondary, pressed && styles.pressed]}>
                    <ThemedText style={styles.ctaSecondaryText}>See example binders ↓</ThemedText>
                  </Pressable>
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.betaNote}>
                  Free while in beta · web, iOS and Android
                </ThemedText>
              </View>

              {heroBinder?.pages[0] ? (
                <View style={styles.heroArt}>
                  <View style={[styles.heroTilt, Shadows.page]}>
                    <BinderGrid page={heroBinder.pages[0]} width={heroW} />
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.heroCaption}>
                    “{heroBinder.title}”, a real page rendered live. Not a screenshot.
                  </ThemedText>
                </View>
              ) : null}
            </View>

            {/* ── Why michi ───────────────────────────────────────────── */}
            <View style={styles.cardRow}>
              {VALUE_PROPS.map((prop) => (
                <ThemedView
                  key={prop.title}
                  type="backgroundElement"
                  style={[styles.valueCard, wide && styles.cardThird]}>
                  <ThemedText style={styles.cardTitle}>{prop.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.cardBody}>
                    {prop.body}
                  </ThemedText>
                </ThemedView>
              ))}
            </View>

            {/* ── The tools ───────────────────────────────────────────── */}
            <View style={styles.section}>
              <ThemedText style={styles.kicker}>THE TOOLS</ThemedText>
              <ThemedText style={styles.h2}>
                Everything between “pile of cards” and “page you’re proud of.”
              </ThemedText>
              <View style={styles.cardRow}>
                {FEATURES.map((f) => (
                  <View key={f.title} style={[styles.featureCard, wide && styles.cardThird]}>
                    <ThemedText style={styles.cardTitle}>{f.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.cardBody}>
                      {f.body}
                    </ThemedText>
                  </View>
                ))}
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.alsoLine}>
                Also in the box: double-sided book view, card labels, jumbo &amp; V-UNION
                support, dark mode.
              </ThemedText>
            </View>

            {/* ── Print band ──────────────────────────────────────────── */}
            <ThemedView type="backgroundElement" style={[styles.printBand, wide && styles.printBandWide]}>
              <View style={styles.printStat}>
                <ThemedText style={styles.printSize}>2.5″ × 3.5″</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  true card size, at pocket pitch
                </ThemedText>
              </View>
              <View style={styles.printCopy}>
                <ThemedText style={styles.cardTitle}>The physical payoff</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.cardBody}>
                  Export any binder as cut-ready fill sheets: placeholders for the hunt, your
                  real sliced art, inserts, and folded two-wide pieces whose art crosses the
                  fold. Print, cut, slide into pockets. The page on your shelf matches the page
                  on your screen.
                </ThemedText>
              </View>
            </ThemedView>

            {/* ── Gallery ─────────────────────────────────────────────── */}
            <View style={styles.section} onLayout={(e) => (galleryY.current = e.nativeEvent.layout.y)}>
              <ThemedText style={styles.kicker}>OPEN A REAL BINDER</ThemedText>
              <ThemedText style={styles.h2}>These aren’t mockups.</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionSub}>
                Every example below is a live binder. Open one, flip its pages, then duplicate
                it and make it yours.
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
                {galleryBinders.map((binder) => (
                  <BinderThumb
                    key={binder.id}
                    binder={binder}
                    width={thumbW}
                    onPress={() => openBinder(binder.id)}
                  />
                ))}
              </ScrollView>
            </View>

            {/* ── Closing CTA ─────────────────────────────────────────── */}
            <View style={styles.closing}>
              <ThemedText style={styles.h2}>Your cards deserve better than a shoebox.</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionSub}>
                Everything above is free while michi-maker is in beta. Sign in so your binders
                follow you between devices.
              </ThemedText>
              <Pressable
                onPress={enterApp}
                style={({ pressed }) => [styles.ctaPrimary, styles.ctaClosing, pressed && styles.pressed]}>
                <ThemedText style={styles.ctaPrimaryText}>Start building for free</ThemedText>
              </Pressable>
            </View>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
                michi-maker, made with a love for the craft.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
                Card images belong to their respective owners. michi-maker is a fan-made tool
                and is not affiliated with Nintendo, Creatures, or The Pokémon Company.
              </ThemedText>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { width: '100%' },
  shell: {
    width: '100%',
    maxWidth: MaxContentWidthWide,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  pressed: { opacity: 0.7 },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  wordmark: { fontSize: FontSize.h2, fontWeight: Weight.bold },
  navBtn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  navBtnText: { fontSize: FontSize.body, fontWeight: Weight.semibold },

  hero: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.five,
    gap: Spacing.five,
  },
  heroWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.six,
    paddingBottom: Spacing.six,
  },
  heroCopy: { gap: Spacing.three, maxWidth: MaxContentWidth },
  heroCopyWide: { flex: 1, paddingRight: Spacing.five },
  kicker: {
    fontSize: FontSize.sm,
    fontWeight: Weight.bold,
    letterSpacing: 2,
    color: Palette.accent,
  },
  h1: { fontSize: FontSize.hero, lineHeight: 54, fontWeight: Weight.bold },
  h1Narrow: { fontSize: FontSize.display, lineHeight: 40 },
  heroSub: { fontSize: FontSize.md, lineHeight: 26, maxWidth: 560 },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.two },
  ctaPrimary: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
  },
  ctaPrimaryText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.md },
  ctaSecondary: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  ctaSecondaryText: { fontWeight: Weight.semibold, fontSize: FontSize.md },
  betaNote: { marginTop: Spacing.one },
  heroArt: { alignItems: 'center', gap: Spacing.three },
  heroTilt: { transform: [{ rotate: '-1.5deg' }] },
  heroCaption: { maxWidth: 420, textAlign: 'center' },

  cardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  cardThird: { flexBasis: '31%', flexGrow: 1 },
  valueCard: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    width: '100%',
  },
  featureCard: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    width: '100%',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  cardTitle: { fontSize: FontSize.lg, fontWeight: Weight.bold, lineHeight: 24 },
  cardBody: { lineHeight: 21 },

  section: { marginTop: Spacing.six },
  h2: {
    fontSize: FontSize.title,
    lineHeight: 30,
    fontWeight: Weight.bold,
    marginTop: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  sectionSub: { marginTop: Spacing.two, maxWidth: MaxContentWidth, lineHeight: 21 },
  alsoLine: { marginTop: Spacing.three, lineHeight: 21 },

  printBand: {
    marginTop: Spacing.six,
    borderRadius: Radius.lg,
    padding: Spacing.five,
    gap: Spacing.four,
  },
  printBandWide: { flexDirection: 'row', alignItems: 'center' },
  printStat: { alignItems: 'flex-start', gap: Spacing.one, minWidth: 220 },
  printSize: { fontSize: FontSize.display, fontWeight: Weight.bold, lineHeight: 40 },
  printCopy: { flex: 1, gap: Spacing.two, minWidth: 240 },

  galleryRow: { gap: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.two },

  closing: {
    marginTop: Spacing.six,
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  ctaClosing: { marginTop: Spacing.three },

  footer: {
    marginTop: Spacing.six,
    paddingTop: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    gap: Spacing.two,
  },
  footerText: { lineHeight: 20 },
});
