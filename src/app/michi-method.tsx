/**
 * `/michi-method` — an explainer and credit page for the Michi Method: what it is, the
 * collector who created it (Michi / @peeplop), the core page layouts, and where to learn
 * more. Doubles as a shareable marketing/SEO surface (crawlers get rich meta via
 * api/og-michi.js). Reachable from the home header and from a shared link.
 */
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import Head from 'expo-router/head';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurateCallout } from '@/components/CurateCallout';
import { StyleGallery } from '@/components/michi/MethodShowcase';
import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, MaxContentWidth, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { AUTO_FILL_SHOWCASE_ART, WOAHPOKE_GUIDE } from '@/data/guides';

// The collector credited with creating and popularising the method, and the community
// guides worth sending people to.
const MICHI_INSTAGRAM = 'https://www.instagram.com/peeplop/';
const ARTOFPKM = 'https://www.artofpkm.com/pokemon';

export default function MichiMethodScreen() {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.push('/'));

  return (
    <ThemedView style={styles.container}>
      {Platform.OS === 'web' ? (
        <Head>
          <title>What is a michi binder? The michi method explained · Michi-Maker</title>
          <meta
            name="description"
            content="A michi binder treats every Pokémon binder page as a canvas: anchor pages, single-Pokémon spreads, colour themes, and art sliced across pockets. The method, its creator, and how to build one for free."
          />
        </Head>
      ) : null}
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={goBack}
              hitSlop={10}
              accessibilityLabel="Back"
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
              <ThemedText style={styles.backText}>‹ Back</ThemedText>
            </Pressable>
            <Pressable onPress={() => router.push('/')} hitSlop={10}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Michi-Maker
              </ThemedText>
            </Pressable>
          </View>

          {/* Hero: the pages first, the name second. */}
          <ThemedText type="smallBold" style={styles.kicker}>
            A WAY OF SEEING A BINDER PAGE
          </ThemedText>
          <ThemedText type="title" style={styles.h1}>
            The Michi Method
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
            A binder page as a <ThemedText type="smallBold">canvas</ThemedText> rather than a storage
            grid: cards, printed art, deliberate negative space, and one image sliced across several
            pockets, arranged into pages that look intentional.
          </ThemedText>

          {/* Credit — the heart of this page */}
          <ThemedView type="backgroundElement" style={styles.creditCard}>
            <ThemedText type="smallBold" style={styles.creditKicker}>
              Created by Michi
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.creditBody}>
              The Michi Method was created and popularised by the collector{' '}
              <ThemedText type="smallBold">Michi</ThemedText> (
              <ExternalLink href={MICHI_INSTAGRAM}>
                <ThemedText type="linkPrimary">@peeplop</ThemedText>
              </ExternalLink>{' '}
              on Instagram). The name, the style, and the whole idea of treating a binder page as
              composition are theirs. michi-maker is a fan tool built to make the method easier to plan,
              and we credit Michi as its originator.
            </ThemedText>
            <ExternalLink href={MICHI_INSTAGRAM} style={styles.creditLink}>
              <ThemedText type="linkPrimary">Follow Michi on Instagram →</ThemedText>
            </ExternalLink>
          </ThemedView>

          {/* The core layouts, straight from the app's own metadata */}
          <ThemedText type="smallBold" style={styles.sectionTitle}>
            The core page layouts
          </ThemedText>
          {/* Each style as a real page from the app's own binders, with real cards. Tap one to
              open the binder it lives in. */}
          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLede}>
            Eight ways a page can be about something. Each one below is a real page from one of our
            binders; tap it to turn the pages around it.
          </ThemedText>
          <StyleGallery />

          <View style={styles.sectionGap} />

          {/* Our own how-to, featured above the reading list: it is the one that shows the
              method being built rather than described. */}
          <Pressable onPress={() => router.push('/learn/auto-page-fill' as Href)} style={({ pressed }) => [pressed && styles.pressed]}>
              <ThemedView type="backgroundElement" style={styles.featureCard}>
                <Image
                  source={{ uri: AUTO_FILL_SHOWCASE_ART }}
                  style={styles.featureArt}
                  contentFit="cover"
                  transition={150}
                  accessibilityLabel="Eevee, the card the walkthrough builds its pages around"
                />
                <View style={styles.featureBody}>
                  <ThemedText type="smallBold" style={styles.featureTitle}>
                    Build a page around one card
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.featureLede}>
                    Drop one card into a pocket and michi-maker finishes the page around it. A
                    walkthrough of all eight fill methods, each shown as the page it produced.
                  </ThemedText>
                  <ThemedText type="linkPrimary" style={styles.featureLink}>
                    Watch the methods fill a page →
                  </ThemedText>
                </View>
              </ThemedView>
            </Pressable>

          {/* The method, applied to a collection: every layout above is one the curator builds
              from the cards a reader already owns. */}
          <View style={styles.calloutWrap}>
            <CurateCallout surface="michi-method" />
          </View>

          {/* Learn more */}
          <ThemedText type="smallBold" style={styles.sectionTitle}>
            Learn more
          </ThemedText>
          <View style={styles.linkList}>
            <ExternalLink href={WOAHPOKE_GUIDE}>
              <ThemedText type="linkPrimary">woahpoke: A Full Guide to the Michi Method →</ThemedText>
            </ExternalLink>
            <ExternalLink href={ARTOFPKM}>
              <ThemedText type="linkPrimary">The Art of Pokémon: browse card art by illustrator →</ThemedText>
            </ExternalLink>
          </View>

          {/* CTA back into the product */}
          <Pressable
            onPress={() => router.push('/')}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <ThemedText style={styles.ctaText}>Start a michi binder</ThemedText>
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
            Method credited to Michi (@peeplop). michi-maker is a fan project for personal collection
            display and is not affiliated with or endorsed by Michi, Nintendo, Creatures Inc., or GAME
            FREAK inc. Pokémon and all related card artwork are © their respective owners.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  calloutWrap: { marginTop: 24 },
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
  },
  backBtn: { paddingVertical: Spacing.one, paddingRight: Spacing.two },
  backText: { fontSize: FontSize.control, fontWeight: Weight.semibold },
  pressed: { opacity: 0.7 },
  h1: { marginBottom: Spacing.two },
  lede: { lineHeight: 22, marginBottom: Spacing.four },
  creditCard: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    marginBottom: Spacing.five,
  },
  creditKicker: { fontSize: FontSize.label },
  creditBody: { lineHeight: 22 },
  creditLink: { marginTop: Spacing.one },
  featureCard: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.five,
  },
  // 63:88 is the real card aspect, so the art sits in the row like a card in a pocket.
  featureArt: { width: 72, height: 100, borderRadius: Radius.sm },
  featureBody: { flex: 1, gap: Spacing.one },
  featureTitle: { fontSize: FontSize.control },
  featureLede: { lineHeight: 20 },
  featureLink: { fontSize: FontSize.label },
  sectionTitle: { fontSize: FontSize.md, marginBottom: Spacing.three },
  kicker: { fontSize: FontSize.label, letterSpacing: 0.8, color: Palette.accent, marginBottom: Spacing.one },
  sectionLede: { lineHeight: 20, marginBottom: Spacing.three, marginTop: -Spacing.one },
  sectionGap: { marginTop: Spacing.five },
  layoutLabel: { fontSize: FontSize.control },
  layoutDesc: { lineHeight: 20 },
  linkList: { gap: Spacing.three, marginBottom: Spacing.five },
  cta: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: Spacing.five,
  },
  ctaText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.control },
  footnote: { fontSize: FontSize.sm, lineHeight: 18 },
});
