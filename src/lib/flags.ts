/**
 * THE FEATURE FLAG REGISTRY (MIC-017). One line per redesign piece:
 *   'off'   hidden from everyone
 *   'dev'   shown only to a browser in dev mode (`?dev=1`, lib/devMode)
 *   'live'  shown to everyone. "Make <piece> live" = change its word here and ship.
 * Gate UI with `flag('name')`; a name not listed here is a type error.
 * A flag hides UI only: see the HARD RULE in lib/devMode and docs/DEV-FLAGS.md.
 */
import { flagOn, type FlagState } from '@/lib/devFlagRules';
import { DEV_MODE } from '@/lib/devMode';

export const FLAGS = {
  // MIC-017 redesign pieces (owner's picks, 2026-11-10)
  'side-nav': 'dev',
  'pockets-sleeves': 'dev',
  'binder-book': 'dev',
  'editor-hand': 'dev',
  // Phone: pages turn by swipe (editing too) with small arrows over the page's edges; the page
  // strip is a Settings toggle, off by default (owner 2026-11-10).
  'phone-nav': 'dev',
  // MIC-034: page and binder names and descriptions fill themselves from the cards until the
  // owner edits or keeps one (owner 2026-11-10). Needs the name-lock migration (20261110120000).
  'auto-names': 'dev',
  // MIC-017 piece 5: Browse's compact header + theme dice + round-1 layout, the phone thumb dock,
  // results as binder pages, and no-results that explain (owner's picks, 2026-11-09/10).
  'browse-dock': 'dev',
  // Every button whose action takes a moment shows it and takes no second press (owner 2026-11-10).
  'busy-buttons': 'dev',
  // MIC-017 piece 6: My Binders gets a Grid / Shelf switch (grid the default, each viewer's choice
  // remembered on the device) and a quiet empty shelf (owner 2026-11-10: "shelf toggle").
  'mybinders-shelf': 'dev',
  // MIC-017 piece 7: /new-binder as a conversation; page one builds beside it.
  'newbinder-chat': 'dev',
  // MIC-017 piece 8: Discover ranks binders by how much of them a search's cards fill, searches by
  // colour and theme, and has a Binders | Makers switch.
  'discover-v2': 'dev',
  // MIC-017 piece 9: the Share sheet leads with Instagram (story / square / page + caption), a QR
  // code (and a printable QR card) and the page picture.
  'share-minimal': 'dev',
  // MIC-017 piece 10: the page-limit offer shows your own binder's next page; /plans as membership
  // cards. UI only: the same offers, checkout and prices.
  'plans-context': 'dev',
  // MIC-017 piece 11: a profile is a holo collector card with three featured cards (needs the
  // additive profiles.featured_card_ids column, migration 20261110160000; fails soft without it).
  'profile-card': 'dev',
} as const satisfies Record<string, FlagState>;

export type FlagName = keyof typeof FLAGS;

/** Whether the piece shows for this visitor. Constant for the page load. */
export function flag(name: FlagName): boolean {
  return flagOn((FLAGS as Record<string, FlagState>)[name], DEV_MODE);
}

export { DEV_MODE };
