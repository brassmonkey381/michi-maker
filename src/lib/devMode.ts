/**
 * DEV MODE (MIC-017, owner 2026-11-09). `?dev=1` on any web address turns it on and this browser
 * remembers it across pages and reloads; `?dev=0`, or tapping the DEV badge, turns it off. While on:
 * pieces whose lib/flags state is 'dev' show, every analytics event carries `dev: true`, and no
 * Reddit pixel or conversion is sent. Native has no address bar and is always off.
 *
 * Read ONCE at module load, imported from the root layout so it sees the address exactly as typed
 * (the router can rewrite the query before a lazy route loads; see lib/games for the same rule).
 *
 * HARD RULE: dev mode hides UI only. A database or API change under a flagged piece reaches everyone
 * the moment it ships, so it must be additive and safe for the current UI. docs/DEV-FLAGS.md.
 */
import { Platform } from 'react-native';

import { DEV_KEY, DEV_STORED, resolveDev, withoutDevParam } from '@/lib/devFlagRules';

function read(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    let stored: string | null = null;
    try {
      stored = window.localStorage?.getItem(DEV_KEY) ?? null;
    } catch {
      // storage blocked: the address alone decides, for this load
    }
    const { on, write } = resolveDev(window.location?.search ?? '', stored);
    try {
      if (write === DEV_STORED) window.localStorage?.setItem(DEV_KEY, DEV_STORED);
      else if (write === null) window.localStorage?.removeItem(DEV_KEY);
    } catch {
      // cannot remember: dev mode still holds for this load
    }
    return on;
  } catch {
    return false; // never throw at module load
  }
}

/** True when this browser is in dev mode. Constant for the page load. */
export const DEV_MODE: boolean = read();

/** Turn dev mode off and reload without `?dev`, so the page comes back exactly as everyone sees it. */
export function leaveDevMode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem(DEV_KEY);
  } catch {
    // ignore
  }
  try {
    window.location.replace(withoutDevParam(window.location.href));
  } catch {
    window.location.reload();
  }
}
