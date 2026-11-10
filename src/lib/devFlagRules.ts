/**
 * THE DEV SWITCH'S RULES, with no imports so `node --test` can load them (devFlagRules.test.ts).
 * The browser side is lib/devMode; the per-feature registry is lib/flags.
 *
 * Owner, 2026-11-09 (MIC-017): redesign pieces ship to production hidden, and only a browser that
 * has visited a page with `?dev=1` sees them, until he says "make <piece> live".
 */

/** A flagged piece: hidden, shown only in dev mode, or shown to everyone. */
export type FlagState = 'off' | 'dev' | 'live';

/** Whether a piece shows, given its registry state and this browser's dev mode. */
export function flagOn(state: FlagState | undefined, dev: boolean): boolean {
  return state === 'live' || (state === 'dev' && dev);
}

/** The localStorage key and its one stored value. */
export const DEV_KEY = 'michi.dev';
export const DEV_STORED = '1';

/**
 * Dev mode for this page load, from the address and what this browser remembered.
 * `?dev=1` (also on/true/yes, or a bare `?dev`) turns it on, `?dev=0` (off/false/no) turns it off;
 * anything else in `dev` is ignored. `write` says what to store: '1' to remember, null to forget,
 * undefined to leave storage as it is.
 */
export function resolveDev(search: string, stored: string | null): { on: boolean; write: string | null | undefined } {
  const q = new URLSearchParams(search);
  if (q.has('dev')) {
    const v = (q.get('dev') ?? '').trim().toLowerCase();
    if (v === '' || v === '1' || v === 'on' || v === 'true' || v === 'yes') return { on: true, write: DEV_STORED };
    if (v === '0' || v === 'off' || v === 'false' || v === 'no') return { on: false, write: null };
  }
  return { on: stored === DEV_STORED, write: undefined };
}

/** The address with `dev` removed, for the badge's "turn off" reload. */
export function withoutDevParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('dev');
  return u.toString();
}
