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
} as const satisfies Record<string, FlagState>;

export type FlagName = keyof typeof FLAGS;

/** Whether the piece shows for this visitor. Constant for the page load. */
export function flag(name: FlagName): boolean {
  return flagOn((FLAGS as Record<string, FlagState>)[name], DEV_MODE);
}

export { DEV_MODE };
