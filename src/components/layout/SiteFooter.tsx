/**
 * Shared site footer: the cross-page link row (Subscriptions / How-to / Method / Terms / Privacy)
 * plus the fan-tool disclaimer lines. `FooterLinks` is exported separately so the landing page
 * can adopt just the links inside its own footer without restructuring.
 */
import { useRouter, type Href } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Spacing } from '@/constants/theme';

/** The one-line fan/IP disclaimer used across footers and legal pages. */
export const FAN_DISCLAIMER =
  'Card images belong to their respective owners. michi-maker is a fan-made tool and is not ' +
  'affiliated with Nintendo, Creatures, or The Pokémon Company.';

export const TAGLINE = 'michi-maker, made with a love for the craft.';

const LINKS: { label: string; href: Href }[] = [
  { label: 'Plans', href: '/plans' as Href },
  { label: 'My Purchases', href: '/purchases' as Href },
  { label: 'How-to', href: '/learn' as Href },
  { label: 'The Michi Method', href: '/michi-method' },
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Privacy', href: '/legal/privacy' },
];

/** A wrap row of quiet page links, middot-separated. */
export function FooterLinks() {
  const router = useRouter();
  return (
    <View style={styles.links}>
      {LINKS.map((l, i) => (
        <Fragment key={l.label}>
          {i > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.dot}>
              ·
            </ThemedText>
          ) : null}
          <Pressable
            onPress={() => router.push(l.href)}
            hitSlop={6}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.link}>
              {l.label}
            </ThemedText>
          </Pressable>
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
  line: { fontSize: FontSize.sm, lineHeight: 18 },
  pressed: { opacity: 0.7 },
});
