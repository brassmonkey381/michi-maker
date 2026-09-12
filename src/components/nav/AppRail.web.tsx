/**
 * Left nav rail (web, wide screens only). Mounted once in app/_layout beside the router Slot;
 * hides itself below the rail breakpoint and on routes that own their chrome: the landing page
 * (its own inline nav) and the binder editor/viewer (full-bleed workbench).
 *
 * The rail is site chrome, not app state: plain links, active-route highlight from the pathname,
 * legal links pinned at the bottom. The home header's People/Settings/Account actions stay where
 * they are; the rail only carries pages.
 */
import { usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { LogoMark } from '@/components/brand/LogoMark';
import { useTcgscanOpen } from '@/components/monetization/BundleOffer';
import { TCGSCAN_URL } from '@/data/subscriptions';
import { Wordmark } from '@/components/brand/Wordmark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Breakpoints, Fonts, FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { useAuth } from '@/store/auth';

type RailItem = { label: string; href: Href; match: (path: string) => boolean; external?: boolean };

// Two groups: "Explore" (discovery + info) and "You" (the account's own stuff). Within You,
// My Binders sits directly above My Purchases.
const EXPLORE: RailItem[] = [
  { label: 'Home', href: '/', match: (p) => p === '/' },
  { label: 'Discover Binders', href: '/discover' as Href, match: (p) => p.startsWith('/discover') },
  { label: 'Contest 🏆', href: '/contest' as Href, match: (p) => p.startsWith('/contest') },
  { label: 'Browse Cards', href: '/browse' as Href, match: (p) => p.startsWith('/browse') },
  { label: 'Plans', href: '/plans' as Href, match: (p) => p.startsWith('/plans') || p.startsWith('/subscriptions') || p.startsWith('/pricing') },
  { label: 'How-To', href: '/learn' as Href, match: (p) => p.startsWith('/learn') },
  { label: 'The Michi Method', href: '/michi-method', match: (p) => p.startsWith('/michi-method') },
  { label: 'What’s New', href: '/whats-new' as Href, match: (p) => p.startsWith('/whats-new') },
  // The sister app, in the rail where every page can see it. External: it leaves for tcgscan.ai.
  { label: 'TCGScan ↗', href: TCGSCAN_URL as Href, match: () => false, external: true },
];
const YOU: RailItem[] = [
  { label: 'My Binders', href: '/my-binders' as Href, match: (p) => p.startsWith('/my-binders') },
  { label: 'My Purchases', href: '/purchases' as Href, match: (p) => p.startsWith('/purchases') },
];

export function AppRail() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = !!profile?.is_admin;

  if (width < Breakpoints.rail) return null;
  if (pathname === '/welcome' || pathname.startsWith('/binder/')) return null;

  return (
    <ThemedView style={styles.rail}>
      <Pressable
        onPress={() => router.push('/')}
        accessibilityLabel="Michi-Maker home"
        style={({ pressed }) => [styles.wordmarkRow, pressed && styles.pressed]}>
        <LogoMark size={22} />
        <ThemedText style={styles.wordmark}>
          <Wordmark />
        </ThemedText>
      </Pressable>

      <RailGroup label="Explore" items={EXPLORE} pathname={pathname} onNavigate={router.push} />
      <View style={styles.groupGap} />
      <RailGroup label="You" items={YOU} pathname={pathname} onNavigate={router.push} />

      <View style={styles.grow} />

      <View style={styles.bottom}>
        <Pressable onPress={() => router.push('/legal/terms')} hitSlop={4}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.bottomLink}>
            Terms
          </ThemedText>
        </Pressable>
        <Pressable onPress={() => router.push('/legal/privacy')} hitSlop={4}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.bottomLink}>
            Privacy
          </ThemedText>
        </Pressable>
        {/* Admin-only entry to the analytics studio. Hidden for everyone else; the route is
            server-side gated regardless. */}
        {isAdmin ? (
          <Pressable onPress={() => router.push('/studio' as Href)} hitSlop={4}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.bottomLink}>
              Studio
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </ThemedView>
  );
}

function RailGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: RailItem[];
  pathname: string;
  onNavigate: (href: Href) => void;
}) {
  // The TCGScan item is the one link here that is not instant: it mints a sign-in ticket first.
  // Only the group holding it ever shows a pending state, and the others simply never set it.
  const { opening, open } = useTcgscanOpen();
  return (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupLabel}>
        {label}
      </ThemedText>
      <View style={styles.items}>
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Pressable
              key={item.label}
              onPress={() => (item.external ? open() : onNavigate(item.href))}
              disabled={item.external && opening}
              accessibilityRole="link"
              accessibilityState={{ selected: active, busy: item.external && opening }}
              style={({ pressed }) => [
                styles.item,
                active && styles.itemActive,
                (pressed || (item.external && opening)) && styles.pressed,
              ]}>
              <ThemedText
                type={active ? 'smallBold' : 'small'}
                themeColor={active ? undefined : 'textSecondary'}
                style={styles.itemText}>
                {/* The TCGScan link mints a sign-in ticket before it navigates; it says so while
                    that is happening rather than looking like a link that missed the press. */}
                {item.external && opening ? 'Opening…' : item.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  /**
   * A ThemedView, because THE RAIL HAS TO PAINT ITS OWN GROUND.
   *
   * It never set a background at all, and neither does the frame it sits in, so in dark mode the
   * browser's white showed through under text that had already flipped to near-white: the
   * "Michi-Maker" wordmark was #ffffff on #ffffff, and every nav label was #C4C8CE on #ffffff at
   * 1.68:1. The only thing visible was the accent hyphen, which is its own colour, and the
   * selected pill, which brings its own fill. The routed screen beside it was correct throughout,
   * which is why this survived so long: the half of the window people look at was never wrong.
   *
   * `theme.background` rather than a raised surface, so the relationship the light build already
   * had is unchanged — the rail is the page's own ground and the active pill is the raised thing
   * on it (Palette.panel: #f0f0f3 on white, #212225 on #131417). Themed rather than
   * Palette-resolved so it follows a scheme flip live, like the text it has to stay behind.
   */
  rail: {
    width: 216,
    borderRightWidth: 1,
    borderRightColor: Palette.hairline,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.five,
  },
  wordmark: { fontFamily: Fonts?.brand, fontSize: FontSize.md, fontWeight: Weight.bold },
  groupLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.two,
  },
  items: { gap: 2 },
  groupGap: { height: Spacing.four },
  item: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
  },
  itemActive: { backgroundColor: Palette.panel },
  itemText: { fontSize: FontSize.label },
  grow: { flexGrow: 1 },
  bottom: {
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.two,
    flexDirection: 'row',
    gap: Spacing.three,
  },
  bottomLink: { fontSize: FontSize.sm },
  pressed: { opacity: 0.7 },
});
