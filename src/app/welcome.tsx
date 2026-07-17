import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { BinderThumb } from '@/components/binder/BinderThumb';
import { LogoMark } from '@/components/brand/LogoMark';
import { FooterLinks } from '@/components/layout/SiteFooter';
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
import { useTheme } from '@/hooks/use-theme';
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

/**
 * The brand display face (Fraunces, loaded via global.css on web). Headings only —
 * body copy stays on the system sans like the rest of the app.
 */
const BrandFont = Platform.select({ web: 'var(--font-brand)', default: 'serif' });

/**
 * The landing page's own surface language — "gallery studio": warm paper walls, mat-board
 * cards, bronze craft accents, and one dark beat for the print payoff. Scoped here on
 * purpose (the app keeps its variant tokens); the binder pages and the blue CTAs are the
 * only saturated things on the page, so the card art stays the loudest voice.
 */
const Paper = { light: '#FAF6EF', dark: '#151310' };
const Mat = { light: '#F0EADF', dark: '#211E18' };
const Bronze = { light: '#8A6B45', dark: '#C99F6E' };
/** The print band is the page's one dark moment, in both schemes. */
const InkBand = { bg: '#1D1A15', title: '#F5EFE4', body: '#B3AA9A' };

/**
 * Whether the RESOLVED theme is dark. The paper/mat/bronze surfaces must agree with the
 * text colors ThemedText resolves, and those follow the active theme VARIANT, which may
 * pin a scheme (Dark Vault is dark in both OS schemes). Reading the raw OS scheme here
 * put espresso vintage-light text on dark paper for anyone with a variant set — so judge
 * darkness from the actual theme background instead.
 */
function isDarkBackground(hex: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  const luminance = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return luminance < 128;
}

/** One page that tells a story at a glance: the rarity ladder, common → hyper. */
const HERO_ID = 'gen-prismatic-rarity-ladder';
/** Wide screens get an OPEN SPREAD instead: the owner's real binder, opened to its facing pages. */
const SPREAD_ID = 'ex-my-first-binder';
/** Which facing pages the spread shows (0-indexed left page): pages 2–3, designed as a pair. */
const SPREAD_LEFT_PAGE = 1;
/** The owner's real binders (bundled by scripts/build-featured-binders.mjs), not mockups. */
const GALLERY_IDS = ['ex-my-first-binder', 'ex-ideas-in-flight', 'ex-pitch-black-chase'];

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
    body: 'Scans from the TCGScan app and CSV imports land here live. Fill binders from what you own: green for owned, gray for still hunting.',
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
  const dark = isDarkBackground(useTheme().background);
  const paper = dark ? Paper.dark : Paper.light;
  const mat = dark ? Mat.dark : Mat.light;
  const bronze = dark ? Bronze.dark : Bronze.light;

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

  // The hero: an open two-page spread when there's room for it (facing pages are the thing
  // neither a card list nor a competitor wireframe can show), a single page otherwise.
  const spreadBinder = BINDERS_BY_ID.get(SPREAD_ID);
  const showSpread =
    windowW >= 1180 && !!spreadBinder && spreadBinder.pages.length > SPREAD_LEFT_PAGE + 1;
  const spreadPageW = Math.min(330, (windowW - 620) / 2);
  // The single-page render: big enough to read the cards, never wider than the phone.
  const heroW = wide ? 420 : Math.min(windowW - Spacing.five * 2, 380);
  const thumbW = wide ? 300 : Math.min(windowW - Spacing.five * 2, 280);

  return (
    <ThemedView style={[styles.root, { backgroundColor: paper }]}>
      {Platform.OS === 'web' ? (
        <Head>
          <title>michi-maker: build beautiful Pokémon card binders</title>
          <meta
            name="description"
            content="Compose curated Pokémon card binder pages: rarity ladders, color spreads, artist galleries. Print true-size fill sheets and build the real thing. Free while in beta."
          />
          <meta property="og:title" content="michi-maker: build beautiful Pokémon card binders" />
          <meta
            property="og:description"
            content="Compose curated Pokémon card binder pages: rarity ladders, color spreads, artist galleries. Print true-size fill sheets and build the real thing. Free while in beta."
          />
          <meta property="og:image" content="https://michi-maker.com/og.png" />
          <meta name="twitter:card" content="summary_large_image" />
        </Head>
      ) : null}
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
          {/* ── Nav ─────────────────────────────────────────────────────── */}
          <View style={styles.shell}>
            <View style={styles.nav}>
              <View style={styles.brandRow}>
                <LogoMark size={26} />
                <ThemedText style={styles.wordmark}>michi-maker</ThemedText>
              </View>
              <Pressable
                onPress={enterApp}
                style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}>
                <ThemedText style={styles.navBtnText}>Open the app →</ThemedText>
              </Pressable>
            </View>

            {/* ── Hero ────────────────────────────────────────────────── */}
            <View style={[styles.hero, wide && styles.heroWide]}>
              <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
                <ThemedText style={[styles.kicker, { color: bronze }]}>
                  THE MICHI METHOD, DIGITIZED
                </ThemedText>
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

              {showSpread && spreadBinder ? (
                <View style={styles.heroArt}>
                  <View style={[styles.heroTilt, Shadows.page]}>
                    <View style={styles.spreadRow}>
                      <BinderGrid page={spreadBinder.pages[SPREAD_LEFT_PAGE]} width={spreadPageW} />
                      <View style={styles.spine}>
                        {[0, 1, 2, 3].map((i) => (
                          <View key={i} style={styles.ring} />
                        ))}
                      </View>
                      <BinderGrid
                        page={spreadBinder.pages[SPREAD_LEFT_PAGE + 1]}
                        width={spreadPageW}
                      />
                    </View>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.heroCaption}>
                    “{spreadBinder.title}”, an open spread rendered live. Not a screenshot.
                  </ThemedText>
                </View>
              ) : heroBinder?.pages[0] ? (
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

            {/* ── Why michi — plain text columns on the paper, a bronze rule above each ── */}
            <View style={styles.cardRow}>
              {VALUE_PROPS.map((prop) => (
                <View key={prop.title} style={[styles.valueCol, wide && styles.cardThird]}>
                  <View style={[styles.rule, { backgroundColor: bronze }]} />
                  <ThemedText style={styles.valueTitle}>{prop.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.cardBody}>
                    {prop.body}
                  </ThemedText>
                </View>
              ))}
            </View>

            {/* ── The tools ───────────────────────────────────────────── */}
            <View style={styles.section}>
              <ThemedText style={[styles.kicker, { color: bronze }]}>THE TOOLS</ThemedText>
              <ThemedText style={styles.h2}>
                Everything between “pile of cards” and “page you’re proud of.”
              </ThemedText>
              <View style={styles.cardRow}>
                {FEATURES.map((f) => (
                  <View
                    key={f.title}
                    style={[styles.featureCard, { backgroundColor: mat }, wide && styles.cardThird]}>
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

            {/* ── Print band — the page's one dark moment ─────────────── */}
            <View style={[styles.printBand, wide && styles.printBandWide]}>
              <View style={styles.printStat}>
                <ThemedText style={[styles.printSize, { color: InkBand.title }]}>
                  2.5″ × 3.5″
                </ThemedText>
                <ThemedText type="small" style={{ color: InkBand.body }}>
                  true card size, at pocket pitch
                </ThemedText>
              </View>
              <View style={styles.printCopy}>
                <ThemedText style={[styles.cardTitle, { color: InkBand.title }]}>
                  The physical payoff
                </ThemedText>
                <ThemedText type="small" style={[styles.cardBody, { color: InkBand.body }]}>
                  Export any binder as cut-ready fill sheets: placeholders for the hunt, your
                  real sliced art, inserts, and folded two-wide pieces whose art crosses the
                  fold. Print, cut, slide into pockets. The page on your shelf matches the page
                  on your screen.
                </ThemedText>
              </View>
            </View>

            {/* ── Gallery ─────────────────────────────────────────────── */}
            <View style={styles.section} onLayout={(e) => (galleryY.current = e.nativeEvent.layout.y)}>
              <ThemedText style={[styles.kicker, { color: bronze }]}>OPEN A REAL BINDER</ThemedText>
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
              <FooterLinks />
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  wordmark: { fontFamily: BrandFont, fontSize: FontSize.h2, fontWeight: Weight.bold },
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
  },
  h1: { fontFamily: BrandFont, fontSize: 56, lineHeight: 62, fontWeight: '900' },
  h1Narrow: { fontSize: FontSize.display, lineHeight: 42 },
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
  heroCaption: { maxWidth: 480, textAlign: 'center' },
  spreadRow: { flexDirection: 'row', alignItems: 'center' },
  spine: {
    alignSelf: 'stretch',
    width: 26,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: Spacing.five,
  },
  ring: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Palette.hairlineStrong,
  },

  cardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  cardThird: { flexBasis: '31%', flexGrow: 1 },
  valueCol: {
    gap: Spacing.two,
    width: '100%',
    paddingVertical: Spacing.two,
  },
  rule: { width: 36, height: 3, borderRadius: 2, marginBottom: Spacing.one },
  valueTitle: { fontFamily: BrandFont, fontSize: FontSize.h2, fontWeight: Weight.bold, lineHeight: 28 },
  featureCard: {
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
    width: '100%',
  },
  cardTitle: { fontSize: FontSize.lg, fontWeight: Weight.bold, lineHeight: 24 },
  cardBody: { lineHeight: 21 },

  section: { marginTop: Spacing.six },
  h2: {
    fontFamily: BrandFont,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: Weight.bold,
    marginTop: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  sectionSub: { marginTop: Spacing.two, maxWidth: MaxContentWidth, lineHeight: 21 },
  alsoLine: { marginTop: Spacing.three, lineHeight: 21 },

  printBand: {
    marginTop: Spacing.six,
    borderRadius: 24,
    padding: Spacing.five,
    gap: Spacing.four,
    backgroundColor: InkBand.bg,
  },
  printBandWide: { flexDirection: 'row', alignItems: 'center' },
  printStat: { alignItems: 'flex-start', gap: Spacing.one, minWidth: 220 },
  printSize: { fontFamily: BrandFont, fontSize: FontSize.display, fontWeight: '900', lineHeight: 40 },
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
