/**
 * THE SITE'S DESTINATIONS, IN ONE PLACE.
 *
 * Extracted from AppRail.web because there are now two things that draw them: the wide-web left
 * rail, and the phone drawer. A nav list kept twice is a nav list that drifts, and the drift is
 * always the same shape — somebody adds a page to the one they were looking at, and it is missing
 * from the other for months without anything failing.
 *
 * FOUR GROUPS (owner, 2026-10-27: "EXPLORE is a section, YOU is a section ... reduced / combined /
 * renamed ... reorganized"). The old pair was Explore (eleven links) and You (four), which put My
 * Binders two thirds of the way down and mixed the member's own things with the company's asks.
 * Now the groups are the jobs a person opens the menu for, in the order they do them:
 *
 *   Make     the work: My Binders first, then the builders and the card sources.
 *   Explore  the things you go and look at.
 *   Learn    how-to, the method, and what changed.
 *   Account  billing, then the two asks: the what-next vote right above Leave Feedback
 *            (owner, 2026-10-27: "a link right above leave feedback").
 *
 * Home is not a link any more: the wordmark above the groups goes home, and so does the drawer's
 * head. Collector Binders is Set Binders here (three "… Binders" in a row read as one blur) and
 * the page still calls itself Collector Binders in its eyebrow.
 */
import type { Href } from 'expo-router';

import { TCGSCAN_URL } from '@/data/subscriptions';

/** The glyph beside a label. Drawn by nav/NavIcon (web only; the native drawer shows none). */
export type NavIconName =
  | 'binders'
  | 'set'
  | 'cards'
  | 'scan'
  | 'discover'
  | 'puzzle'
  | 'howto'
  | 'method'
  | 'news'
  | 'plans'
  | 'purchases'
  | 'vote'
  | 'feedback';

export type NavItem = {
  label: string;
  href: Href;
  icon: NavIconName;
  /** A function, not a string compare, so a child route keeps its parent lit (/contest-binders). */
  match: (path: string) => boolean;
  /** Leaves for the sister app: minted sign-in ticket first, so it cannot be a plain link. */
  external?: boolean;
  /** Opens in a new tab, so this site stays where it was. Only meaningful with `external`. */
  newTab?: boolean;
  /** A glow and a chevron while there is something unread. Today only What's New earns it. */
  glow?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_MAKE: NavItem[] = [
  { label: 'My Binders', href: '/my-binders' as Href, icon: 'binders', match: (p) => p.startsWith('/my-binders') },
  // SET BINDERS (owner, 2026-10-26, as Collector Binders): a set or a binder type, built by rule:
  // free placeholders or a binder. Renamed in the menu only, 2026-10-27.
  { label: 'Set Binders', href: '/collect' as Href, icon: 'set', match: (p) => p.startsWith('/collect') },
  { label: 'Browse Cards', href: '/browse' as Href, icon: 'cards', match: (p) => p.startsWith('/browse') },
  // SCAN CARDS (owner, 2026-10-13): tcgscan.ai in a new tab, signed in as this account by way of
  // the one-time handoff ticket (data/handoff.ts), so a member does not sign in twice. Shown in
  // every build, NOT behind SHOW_CROSS_APP: the owner asked for the link itself; the bundle,
  // pairing card and the rest of the cross-selling stay behind that flag. `match` is never true
  // because this rail never shows tcgscan's pages.
  { label: 'Scan Cards', href: TCGSCAN_URL as Href, icon: 'scan', match: () => false, external: true, newTab: true },
];

export const NAV_EXPLORE: NavItem[] = [
  { label: 'Discover Binders', href: '/discover' as Href, icon: 'discover', match: (p) => p.startsWith('/discover') },
  // No contest line (owner call, 2026-10-11): the first contest is over and /contest is its
  // record, reached from the winning binders and by URL. Re-add here when the next one opens.
  // ?from=nav so the puzzle page can tell a rail click from the home card and
  // from a direct hit. `match` still tests the path, so the query is invisible
  // to the active-item highlight.
  { label: 'Daily Puzzle', href: '/daily?from=nav' as Href, icon: 'puzzle', match: (p) => p.startsWith('/daily') },
];

export const NAV_LEARN: NavItem[] = [
  { label: 'How-To', href: '/learn' as Href, icon: 'howto', match: (p) => p.startsWith('/learn') },
  { label: 'The Michi Method', href: '/michi-method', icon: 'method', match: (p) => p.startsWith('/michi-method') },
  { label: 'What’s New', href: '/whats-new' as Href, icon: 'news', match: (p) => p.startsWith('/whats-new') },
];

export const NAV_ACCOUNT: NavItem[] = [
  {
    label: 'Plans',
    href: '/plans' as Href,
    icon: 'plans',
    match: (p) => p.startsWith('/plans') || p.startsWith('/subscriptions') || p.startsWith('/pricing'),
  },
  { label: 'My Purchases', href: '/purchases' as Href, icon: 'purchases', match: (p) => p.startsWith('/purchases') },
  { label: 'Vote on What’s Next', href: '/wishlist' as Href, icon: 'vote', match: (p) => p.startsWith('/wishlist') },
  { label: 'Leave Feedback', href: '/feedback' as Href, icon: 'feedback', match: (p) => p.startsWith('/feedback') },
];

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Make', items: NAV_MAKE },
  { label: 'Explore', items: NAV_EXPLORE },
  { label: 'Learn', items: NAV_LEARN },
  { label: 'Account', items: NAV_ACCOUNT },
];

/**
 * The groups with the What's New glow decided. The list itself must not carry it: it depends on
 * state (data/changelog: freshPinned) and both the rail and the drawer ask at render time.
 */
export function navGroups(whatsNewGlows: boolean): NavGroup[] {
  if (!whatsNewGlows) return NAV_GROUPS;
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((i) => (i.label === 'What’s New' ? { ...i, glow: true } : i)),
  }));
}

/**
 * Routes that own their whole chrome and must not have navigation laid over them: the landing
 * page has its own inline nav, and the binder editor and viewer are a full-bleed workbench where
 * a floating button would sit on top of the page you are composing.
 */
export function navHiddenOn(pathname: string): boolean {
  return pathname === '/welcome' || pathname.startsWith('/binder/');
}
