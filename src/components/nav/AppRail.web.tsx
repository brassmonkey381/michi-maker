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
import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  type PressableStateCallbackType,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { LogoMark } from '@/components/brand/LogoMark';
import { useTcgscanOpen } from '@/components/monetization/BundleOffer';
import { Wordmark } from '@/components/brand/Wordmark';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Breakpoints, Fonts, FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { freshPinned } from '@/data/changelog';
import { NavIcon } from '@/components/nav/NavIcon';
import { navGroups, navHiddenOn, type NavGroup, type NavItem } from '@/components/nav/navItems';
import { useAuth } from '@/store/auth';

/**
 * The items live in nav/navItems now, shared with the phone drawer (nav/MobileNav). Two copies of
 * a nav list drift, and the drift is silent: a page gets added to the one you were looking at and
 * is missing from the other for months.
 *
 * LIT (owner, 2026-09-21): a glow in the accent and a chevron after the label, while there is
 * something the reader has not seen. Today only What's New earns it, and only while a pinned item
 * is under a week old (data/changelog: freshPinned); the light goes out on its own.
 */
type RailItem = NavItem;

// Four groups (Make, Explore, Learn, Account) from nav/navItems; only the What's New glow is
// decided here, because it depends on state the list itself should not carry.
const GROUPS: NavGroup[] = navGroups(freshPinned().length > 0);

/** react-native-web reports hover in the style callback; the RN type does not promise it. */
const hovered = (state: PressableStateCallbackType) => !!(state as { hovered?: boolean }).hovered;

export function AppRail() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = !!profile?.is_admin;

  if (width < Breakpoints.rail) return null;
  if (navHiddenOn(pathname)) return null;

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

      {GROUPS.map((g, n) => (
        <RailGroup key={g.label} label={g.label} items={g.items} first={n === 0} pathname={pathname} onNavigate={router.push} />
      ))}

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

/**
 * ONE GROUP: a small-caps label over a hairline (the first group has no rule; the wordmark is its
 * rule), then the rows. A row is glyph, label, and for a lit item the chevron. The active row is
 * a filled panel with a 3 px accent bar down its left edge, so "you are here" reads from the edge
 * of the rail before the eye reaches the words; a hovered row gets the panel without the bar.
 */
function RailGroup({
  label,
  items,
  first,
  pathname,
  onNavigate,
}: {
  label: string;
  items: RailItem[];
  first: boolean;
  pathname: string;
  onNavigate: (href: Href) => void;
}) {
  // The Scan Cards item is the one link here that is not instant: it mints a sign-in ticket first
  // and opens tcgscan.ai in a new tab. Only the group holding it ever shows a pending state.
  const { opening, open } = useTcgscanOpen();
  return (
    <View style={[styles.group, !first && styles.groupRuled]} accessibilityRole="list" accessibilityLabel={label}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupLabel}>
        {label}
      </ThemedText>
      <View style={styles.items}>
        {items.map((item) => {
          const active = item.match(pathname);
          const busy = !!item.external && opening;
          const lit = active || !!item.glow;
          return (
            <Pressable
              key={item.label}
              onPress={() => (item.external ? open(String(item.href), { newTab: item.newTab }) : onNavigate(item.href))}
              disabled={busy}
              accessibilityRole="link"
              accessibilityState={{ selected: active, busy }}
              testID={item.glow ? 'rail-item-glow' : undefined}
              style={(state) => [
                styles.item,
                hovered(state) && !active && styles.itemHover,
                active && styles.itemActive,
                (state.pressed || busy) && styles.pressed,
              ]}>
              {item.glow ? <Glow /> : null}
              {active ? <View style={styles.itemBar} /> : null}
              <ThemedText
                themeColor={lit ? undefined : 'textSecondary'}
                style={[styles.itemIcon, item.glow && styles.itemTextGlow]}>
                <NavIcon name={item.icon} />
              </ThemedText>
              <ThemedText
                type={lit ? 'smallBold' : 'small'}
                themeColor={lit ? undefined : 'textSecondary'}
                style={[styles.itemText, item.glow && styles.itemTextGlow]}
                numberOfLines={1}>
                {/* The Scan Cards link mints a sign-in ticket before it navigates; it says so while
                    that is happening rather than looking like a link that missed the press. */}
                {busy ? 'Opening…' : item.label}
              </ThemedText>
              {item.tag ? <ThemedText style={styles.tag}>{item.tag}</ThemedText> : null}
              {item.external && !busy ? (
                <ThemedText themeColor="textSecondary" style={styles.external}>
                  ↗
                </ThemedText>
              ) : null}
              {item.glow ? <ThemedText style={[styles.itemText, styles.itemTextGlow, styles.chevron]}>›</ThemedText> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * THE LIGHT BEHIND A LIT ITEM: a ring in the accent that breathes, two seconds a breath, under the
 * pill and never in the way of the press. Still when the reader has asked for less motion; the
 * ring and the chevron still say it without moving.
 */
function Glow() {
  const pulse = useMemo(() => new Animated.Value(0), []);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => active && setReduceMotion(on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => (active ? setReduceMotion(on) : undefined));
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);
  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.6);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, reduceMotion]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.glowRing, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]}
    />
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
  group: { paddingBottom: Spacing.three },
  // The rule sits above the label, not under it: a line under a heading cuts it off from its own
  // rows, a line above it closes the group before.
  groupRuled: { borderTopWidth: 1, borderTopColor: Palette.hairline, paddingTop: Spacing.three },
  groupLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: FontSize.xs,
    lineHeight: 14,
    opacity: 0.8,
    paddingHorizontal: Spacing.two + Spacing.half,
    marginBottom: Spacing.one + Spacing.half,
  },
  items: { gap: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.half,
    minHeight: 32,
    paddingVertical: Spacing.one + Spacing.half,
    paddingHorizontal: Spacing.two + Spacing.half,
    borderRadius: Radius.control,
    position: 'relative',
    overflow: 'hidden',
  },
  itemHover: { backgroundColor: Palette.selectionSoft },
  itemActive: { backgroundColor: Palette.panel },
  itemBar: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: Palette.accent,
  },
  glowRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.accent,
    boxShadow: `0 0 12px ${Palette.accent}`,
  },
  // The glyph takes the row's text colour: it is a ThemedText around an SVG in currentColor.
  itemIcon: { width: 16, height: 16, lineHeight: 16 },
  itemText: { fontSize: FontSize.label, flexShrink: 1 },
  itemTextGlow: { color: Palette.accent },
  external: { fontSize: FontSize.sm, lineHeight: 14, marginLeft: 'auto', opacity: 0.7 },
  tag: { fontSize: 10, lineHeight: 14, fontWeight: Weight.bold, letterSpacing: 0.5, textTransform: 'uppercase', color: Palette.accent, backgroundColor: Palette.panel, borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 6 },
  chevron: { fontSize: FontSize.md, lineHeight: 18, marginLeft: 'auto' },
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
