/**
 * Shared site footer: the cross-page link row (Subscriptions / How-to / Method / Terms / Privacy)
 * plus the fan-tool disclaimer lines. `FooterLinks` is exported separately so the landing page
 * can adopt just the links inside its own footer without restructuring.
 */
import { Link, type Href } from 'expo-router';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Spacing } from '@/constants/theme';

/** The one-line fan/IP disclaimer used across footers and legal pages. */
export const FAN_DISCLAIMER =
  'Card images belong to their respective owners. michi-maker is a fan-made tool and is not ' +
  'affiliated with Nintendo, Creatures, or The Pokémon Company.';

/** FTC affiliate-compensation disclosure. Some outbound card links are affiliate links
 *  (eBay Partner Network, TCGplayer affiliate program). Must stay clear + conspicuous. */
export const AFFILIATE_DISCLOSURE =
  'As an eBay Partner Network and TCGplayer affiliate, michi-maker may earn a commission on ' +
  'qualifying purchases made through outbound links, at no extra cost to you.';

export const TAGLINE = 'michi-maker, made with a love for the craft.';

/**
 * ANCHOR TEXT IS A RANKING SIGNAL. Search engines read the words of a link as a description of the
 * page it points to, so "How-To" tells them nothing and "Pokémon binder how-to guides" tells them
 * what /learn is about. These are real <a href> elements (Link, not Pressable + router.push) so a
 * crawler can follow them at all; the labels say what the page is, in the words people search.
 */
const LINKS: { label: string; href: Href }[] = [
  { label: 'Pokémon binder layouts: the michi method', href: '/michi-method' },
  { label: 'Pokémon binder how-to guides', href: '/learn' as Href },
  { label: 'Print a binder fill sheet at true size', href: '/learn/print-binder' as Href },
  { label: 'Browse Pokémon cards', href: '/browse' as Href },
  { label: 'Plans & pricing', href: '/plans' as Href },
  { label: 'My Purchases', href: '/purchases' as Href },
  { label: 'What’s New', href: '/whats-new' as Href },
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'Copyright', href: '/legal/dmca' as Href },
];

/** A wrap row of quiet page links, middot-separated. */
export function FooterLinks() {
  return (
    <View style={styles.links}>
      {LINKS.map((l, i) => (
        <Fragment key={l.label}>
          {i > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.dot}>
              ·
            </ThemedText>
          ) : null}
          <Link href={l.href} style={styles.anchor}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
              {l.label}
            </ThemedText>
          </Link>
        </Fragment>
      ))}
    </View>
  );
}

/** The full footer block: hairline rule, links, tagline + disclaimer. */
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.footer}>
      <FooterLinks />
      {!compact ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.line}>
          {TAGLINE}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary" style={styles.line}>
        {FAN_DISCLAIMER}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.line}>
        {AFFILIATE_DISCLOSURE}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: Spacing.six,
    paddingTop: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    gap: Spacing.two,
  },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  dot: { fontSize: FontSize.sm },
  link: { fontSize: FontSize.sm },
  anchor: { textDecorationLine: 'none' },
  line: { fontSize: FontSize.sm, lineHeight: 18 },
});
