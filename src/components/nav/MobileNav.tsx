/**
 * THE PHONE'S NAVIGATION. A pinned button, and a drawer of every destination.
 *
 * WHY THIS EXISTS. AppRail.web hides itself below 900px and AppRail (native) is a no-op, so on a
 * phone the app had NO navigation at all: measured on the live site at 375px, /my-binders,
 * /discover and /browse contained zero links, and the only way off any of them was a "‹ Home"
 * text link, which on /browse was itself clipped off the right edge. Every other page relied on
 * the site footer, which is below the fold of a page you have not scrolled.
 *
 * WHY A DRAWER AND NOT TABS (owner, 2026-09-22). There are eleven destinations. A bottom tab bar
 * holds four or five, so it would mean picking favourites and hiding the rest behind a "More"
 * sheet anyway, and it costs permanent vertical space on a screen that is only 812 points tall.
 * A drawer holds all eleven, costs one tap, and reuses the rail's own list (nav/navItems).
 *
 * WHY THE BUTTON IS BOTTOM-RIGHT and not a top bar. Every route already owns its top row and each
 * one differently: a back link and a wordmark on the document pages, a "Sign in" pill on My
 * Binders, a three-line title plus a Cheatsheet button on Browse. Anything pinned to the top
 * collides with one of them. The bottom-right corner is empty on every route, it is where a thumb
 * already rests, and it means this component changes no page's layout at all.
 */
import { usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/brand/LogoMark';
import { useTcgscanOpen } from '@/components/monetization/BundleOffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Breakpoints, FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { SHOW_CROSS_APP } from '@/lib/crossApp';
import { TCGSCAN_URL } from '@/data/subscriptions';
import { freshPinned } from '@/data/changelog';
import { NAV_EXPLORE, NAV_YOU, navHiddenOn, type NavItem } from '@/components/nav/navItems';

export function MobileNav() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const { opening, open: openTcgscan } = useTcgscanOpen();

  /**
   * THE BUTTON GETS OUT OF THE WAY WHILE YOU READ.
   *
   * It is pinned bottom-right, which is the one corner no route's own chrome uses, but a page
   * whose content is right-aligned puts something under it on every scroll: on /plans it sat on
   * the value column and hid a row's answer. Rather than move it somewhere that collides with a
   * header, it hides on the way DOWN and comes back the moment you scroll UP, which is where a
   * person reaches for navigation anyway.
   *
   * The listener is on `document` in the CAPTURE phase, because scroll events do not bubble and
   * nothing here scrolls the window: every routed screen scrolls an inner element (PageShell's
   * ScrollView). Capture is what sees a nested scroller's events at all.
   *
   * Web only. On native the rail does not exist at any width, so this button is the ONLY way
   * between pages and hiding it on a flick would be taking the menu away.
   */
  const [hidden, setHidden] = useState(false);
  const slide = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let lastY = 0;
    let queued = false;
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const y = target && typeof target.scrollTop === 'number' ? target.scrollTop : 0;
      if (queued) return;
      queued = true;
      // One decision per frame: a scroll handler that runs on every event is a scroll handler
      // that makes the scroll itself stutter.
      requestAnimationFrame(() => {
        queued = false;
        const dy = y - lastY;
        // Ignore the jitter of a finger resting on the glass.
        if (Math.abs(dy) < 8) return;
        lastY = y;
        // Near the top it is always shown: a page you have just opened must offer its menu.
        setHidden(y > 120 && dy > 0);
      });
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: hidden ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [hidden, slide]);

  // Closing on navigation is done by `go` below, at the moment of the tap, rather than by an
  // effect watching the pathname: a setState in an effect is a second render the compiler rightly
  // refuses, and the tap already knows it is leaving.

  const go = useCallback(
    (item: NavItem) => {
      if (item.external) {
        openTcgscan();
        return;
      }
      setOpen(false);
      router.push(item.href);
    },
    [openTcgscan, router],
  );

  // EXACTLY WHERE THE RAIL IS NOT. One condition, so the two can never both show or both hide.
  const railShowing = Platform.OS === 'web' && width >= Breakpoints.rail;
  if (railShowing || navHiddenOn(pathname)) return null;

  const explore: NavItem[] = [
    ...NAV_EXPLORE.map((i) => (i.label === 'What’s New' ? { ...i, glow: freshPinned().length > 0 } : i)),
    ...(SHOW_CROSS_APP ? [{ label: 'TCGScan ↗', href: TCGSCAN_URL as Href, match: () => false, external: true }] : []),
  ];

  return (
    <>
      <Animated.View
        // Not just faded: it slides out past its own corner, so a half-finished transition never
        // leaves a ghost button sitting over the text.
        pointerEvents={hidden ? 'none' : 'auto'}
        style={[
          styles.fabWrap,
          { bottom: Spacing.four + insets.bottom, right: Spacing.three + insets.right },
          {
            opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 96] }) }],
          },
        ]}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open the menu"
          accessibilityState={{ expanded: open }}
          testID="mobile-nav-open"
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
          <View style={styles.bars}>
            <View style={styles.bar} />
            <View style={styles.bar} />
            <View style={styles.bar} />
          </View>
        </Pressable>
      </Animated.View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        {/* SCRIM AND DRAWER ARE SIBLINGS, not parent and child. Nesting them meant a Pressable
            inside a Pressable, and react-native-web renders a Pressable with a button role as a
            real <button>, so the DOM held a button inside a button: invalid HTML and a hydration
            error on every open. The scrim fills the layer underneath and the drawer sits on top
            of it, which absorbs its own taps without needing a no-op handler. */}
        <View style={styles.scrim}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close the menu"
            testID="mobile-nav-scrim"
            onPress={() => setOpen(false)}
          />
          <View style={[styles.drawerWrap, { paddingTop: insets.top }]}>
            <ThemedView type="backgroundElement" style={styles.drawer} testID="mobile-nav-drawer">
              <View style={styles.head}>
                <LogoMark size={22} />
                <ThemedText type="smallBold" style={styles.headText}>
                  Michi-Maker
                </ThemedText>
                <View style={styles.grow} />
                <Pressable
                  onPress={() => setOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close the menu"
                  hitSlop={10}
                  testID="mobile-nav-close">
                  <ThemedText style={styles.close}>✕</ThemedText>
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={[styles.list, { paddingBottom: Spacing.four + insets.bottom }]}>
                <Group label="Explore" items={explore} pathname={pathname} onGo={go} opening={opening} />
                <Group label="You" items={NAV_YOU} pathname={pathname} onGo={go} opening={opening} />
              </ScrollView>
            </ThemedView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Group({
  label,
  items,
  pathname,
  onGo,
  opening,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  onGo: (item: NavItem) => void;
  opening: boolean;
}) {
  return (
    <View style={styles.group}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupLabel}>
        {label.toUpperCase()}
      </ThemedText>
      {items.map((item) => {
        const active = item.match(pathname);
        const busy = !!item.external && opening;
        return (
          <Pressable
            key={item.label}
            onPress={() => onGo(item)}
            disabled={busy}
            accessibilityRole="link"
            accessibilityState={{ selected: active, busy }}
            testID={`mobile-nav-${item.label}`}
            style={({ pressed }) => [styles.item, active && styles.itemActive, (pressed || busy) && styles.pressed]}>
            <ThemedText
              type={active || item.glow ? 'smallBold' : 'default'}
              style={[styles.itemText, item.glow && styles.itemGlow]}>
              {busy ? 'Opening…' : item.label}
            </ThemedText>
            {item.glow ? <ThemedText style={[styles.itemText, styles.itemGlow]}>›</ThemedText> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Position and the hide animation live here; the pill below is only the look. */
  fabWrap: { position: 'absolute', zIndex: 40 },
  /** 52pt: comfortably past the 44pt minimum, and still small enough to ignore. */
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.28)',
  },
  bars: { gap: 4 },
  bar: { width: 20, height: 2, borderRadius: 1, backgroundColor: Palette.accentText },
  pressed: { opacity: 0.75 },

  scrim: { flex: 1, backgroundColor: Palette.scrim45, flexDirection: 'row', justifyContent: 'flex-end' },
  // Capped so the page stays visible behind it: a drawer that covers everything is a screen, and
  // a screen needs a back button rather than a scrim.
  drawerWrap: { width: '82%', maxWidth: 320, height: '100%' },
  drawer: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: Palette.hairlineStrong,
    paddingHorizontal: Spacing.three,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headText: { fontSize: FontSize.md },
  grow: { flexGrow: 1 },
  close: { fontSize: FontSize.lg, color: Palette.muted, paddingHorizontal: Spacing.one },

  list: { paddingTop: Spacing.three, gap: Spacing.four },
  group: { gap: 2 },
  groupLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.one,
  },
  /** 48pt rows: a nav list is the one place a mis-tap costs a whole page load. */
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.control,
  },
  // The drawer's own ground IS `backgroundElement`, and Palette.panel sits within a hair of it, so
  // an active row styled like the rail's was simply invisible here. A tinted accent plus a rule
  // down the edge says "you are here" against a raised surface in both schemes.
  itemActive: { backgroundColor: Palette.selectionSoft, borderLeftWidth: 3, borderLeftColor: Palette.accent },
  itemText: { fontSize: FontSize.control, fontWeight: Weight.medium },
  itemGlow: { color: Palette.accent, fontWeight: Weight.semibold },
});
