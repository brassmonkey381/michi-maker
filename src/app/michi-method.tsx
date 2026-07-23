/**
 * `/michi-method` — an explainer and credit page for the Michi Method: what it is, the
 * collector who created it (Michi / @peeplop), the core page layouts, and where to learn
 * more. Doubles as a shareable marketing/SEO surface (crawlers get rich meta via
 * api/og-michi.js). Reachable from the home header and from a shared link.
 */
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  FontSize,
  MaxContentWidth,
  Palette,
  Radius,
  Spacing,
  Weight,
} from '@/constants/theme';
import { WOAHPOKE_GUIDE } from '@/data/guides';
import { MICHI_LAYOUT_STYLES } from '@/types/domain';

// The collector credited with creating and popularising the method, and the community
// guides worth sending people to.
const MICHI_INSTAGRAM = 'https://www.instagram.com/peeplop/';
const ARTOFPKM = 'https://www.artofpkm.com/pokemon';

export default function MichiMethodScreen() {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.push('/'));

  return (
    <ThemedView style={styles.container}>
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
                michi-maker
              </ThemedText>
            </Pressable>
          </View>

          {/* Hero */}
          <ThemedText type="subtitle" style={styles.h1}>
            The Michi Method
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
            A way of building a binder page as a <ThemedText type="smallBold">canvas</ThemedText> rather
            than a storage grid: cards, printed art, deliberate negative space, and single images sliced
            across several pockets, arranged into pages that look intentional.
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
          <View style={styles.layoutList}>
            {MICHI_LAYOUT_STYLES.map((style) => (
              <View key={style.value} style={styles.layoutRow}>
                <ThemedText type="smallBold" style={styles.layoutLabel}>
                  {style.label}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.layoutDesc}>
                  {style.description}
                </ThemedText>
              </View>
            ))}
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
  sectionTitle: { fontSize: FontSize.md, marginBottom: Spacing.three },
  layoutList: { gap: Spacing.three, marginBottom: Spacing.five },
  layoutRow: { gap: Spacing.half },
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
