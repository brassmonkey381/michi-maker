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
import { ThemedText } from '@/components/themed-text';
import { Breakpoints, Fonts, FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

type RailItem = { label: string; href: Href; match: (path: string) => boolean };

// Two groups: "Explore" (discovery + info) and "You" (the account's own stuff). Within You,
// My Binders sits directly above My Purchases.
const EXPLORE: RailItem[] = [
  { label: 'Home', href: '/', match: (p) => p === '/' },
  { label: 'Browse cards', href: '/browse' as Href, match: (p) => p.startsWith('/browse') },
  { label: 'Plans', href: '/plans' as Href, match: (p) => p.startsWith('/plans') || p.startsWith('/subscriptions') || p.startsWith('/pricing') },
  { label: 'How-to', href: '/learn' as Href, match: (p) => p.startsWith('/learn') },
  { label: 'The Michi Method', href: '/michi-method', match: (p) => p.startsWith('/michi-method') },
];
const YOU: RailItem[] = [
  { label: 'My Binders', href: '/my-binders' as Href, match: (p) => p.startsWith('/my-binders') },
  { label: 'My Purchases', href: '/purchases' as Href, match: (p) => p.startsWith('/purchases') },
];

export function AppRail() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();

  if (width < Breakpoints.rail) return null;
  if (pathname === '/welcome' || pathname.startsWith('/binder/')) return null;

  return (
    <View style={styles.rail}>
      <Pressable
        onPress={() => router.push('/')}
        accessibilityLabel="michi-maker home"
        style={({ pressed }) => [styles.wordmarkRow, pressed && styles.pressed]}>
        <LogoMark size={22} />
        <ThemedText style={styles.wordmark}>michi-maker</ThemedText>
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
      </View>
    </View>
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
              onPress={() => onNavigate(item.href)}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && styles.pressed]}>
              <ThemedText
                type={active ? 'smallBold' : 'small'}
                themeColor={active ? undefined : 'textSecondary'}
                style={styles.itemText}>
                {item.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
