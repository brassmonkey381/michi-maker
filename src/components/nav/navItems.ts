/**
 * THE SITE'S DESTINATIONS, IN ONE PLACE.
 *
 * Extracted from AppRail.web because there are now two things that draw them: the wide-web left
 * rail, and the phone drawer. A nav list kept twice is a nav list that drifts, and the drift is
 * always the same shape — somebody adds a page to the one they were looking at, and it is missing
 * from the other for months without anything failing.
 *
 * The groups are "Explore" (anywhere you might go) and "You" (your own account's things), and the
 * order inside each is deliberate: My Binders sits directly above My Purchases, and Leave Feedback
 * under that.
 */
import type { Href } from 'expo-router';

import { TCGSCAN_URL } from '@/data/subscriptions';

export type NavItem = {
  label: string;
  href: Href;
  /** A function, not a string compare, so a child route keeps its parent lit (/contest-binders). */
  match: (path: string) => boolean;
  /** Leaves for the sister app: minted sign-in ticket first, so it cannot be a plain link. */
  external?: boolean;
  /** Opens in a new tab, so this site stays where it was. Only meaningful with `external`. */
  newTab?: boolean;
  /** A glow and a chevron while there is something unread. Today only What's New earns it. */
  glow?: boolean;
};

export const NAV_EXPLORE: NavItem[] = [
  { label: 'Home', href: '/', match: (p) => p === '/' },
  // ?from=nav so the puzzle page can tell a rail click from the home card and
  // from a direct hit. `match` still tests the path, so the query is invisible
  // to the active-item highlight.
  { label: 'Daily Puzzle', href: '/daily?from=nav' as Href, match: (p) => p.startsWith('/daily') },
  { label: 'Discover Binders', href: '/discover' as Href, match: (p) => p.startsWith('/discover') },
  // No contest line (owner call, 2026-10-11): the first contest is over and /contest is its
  // record, reached from the winning binders and by URL. Re-add here when the next one opens.
  { label: 'Browse Cards', href: '/browse' as Href, match: (p) => p.startsWith('/browse') },
  // COLLECTOR BINDERS (owner, 2026-10-26): a set or a binder type, built by rule: free placeholders or a binder.
  { label: 'Collector Binders', href: '/collect' as Href, match: (p) => p.startsWith('/collect') },
  // SCAN CARDS (owner, 2026-10-13): tcgscan.ai in a new tab, signed in as this account by way of
  // the one-time handoff ticket (data/handoff.ts), so a member does not sign in twice. Shown in
  // every build, NOT behind SHOW_CROSS_APP: the owner asked for the link itself; the bundle,
  // pairing card and the rest of the cross-selling stay behind that flag. `match` is never true
  // because this rail never shows tcgscan's pages.
  { label: 'Scan Cards', href: TCGSCAN_URL as Href, match: () => false, external: true, newTab: true },
  {
    label: 'Plans',
    href: '/plans' as Href,
    match: (p) => p.startsWith('/plans') || p.startsWith('/subscriptions') || p.startsWith('/pricing'),
  },
  { label: 'How-To', href: '/learn' as Href, match: (p) => p.startsWith('/learn') },
  { label: 'The Michi Method', href: '/michi-method', match: (p) => p.startsWith('/michi-method') },
  { label: 'What’s New', href: '/whats-new' as Href, match: (p) => p.startsWith('/whats-new') },
];

export const NAV_YOU: NavItem[] = [
  { label: 'My Binders', href: '/my-binders' as Href, match: (p) => p.startsWith('/my-binders') },
  { label: 'My Purchases', href: '/purchases' as Href, match: (p) => p.startsWith('/purchases') },
  { label: 'Leave Feedback', href: '/feedback' as Href, match: (p) => p.startsWith('/feedback') },
];

/**
 * Routes that own their whole chrome and must not have navigation laid over them: the landing
 * page has its own inline nav, and the binder editor and viewer are a full-bleed workbench where
 * a floating button would sit on top of the page you are composing.
 */
export function navHiddenOn(pathname: string): boolean {
  return pathname === '/welcome' || pathname.startsWith('/binder/');
}
