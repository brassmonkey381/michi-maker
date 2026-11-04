/**
 * THE RULE BEHIND /coverage (owner, 2026-11-03: "make sure things are not only 70% covered, but
 * live and accessible to be marked Live"). A feature is LIVE for a game when BOTH hold:
 *
 *   1. it covers at least LIVE_SHARE of the game's released cards, and
 *   2. it is switched on where people reach it: the theme registry has the game enabled, the
 *      scanner's game chip is on in tcgscan-app, the colour and similar files are published.
 *
 * Anything else is WIP. The numbers come from tcgscan-data's coverage report
 * (orchestration/scripts/coverage_report.py), copied into data/gameCoverage.json by
 * scripts/coverage-sync.mjs; the page shows statuses only. Before this rule the rows were typed by
 * hand and Cyberpunk read all-live while its scanner was not in the app and its similar and theme
 * coverage sat under half.
 *
 * PURE: no react-native, so `node --test` reaches it and the sync script can import it.
 */
export type CoverageStatus = 'live' | 'wip';

export type FeatureKey = 'search' | 'colour' | 'similar' | 'theme' | 'scanner';

export const FEATURE_KEYS: readonly FeatureKey[] = ['search', 'colour', 'similar', 'theme', 'scanner'];

/** The share of released cards a feature must cover. */
export const LIVE_SHARE = 0.7;

/** One game as the report describes it: counts, or a word when a feature lives elsewhere. */
export interface ReportGame {
  key: string;
  /** The scanner's game chip is on in tcgscan-app. */
  in_app: boolean;
  /** Released (not presale) cards in the TCGplayer corpus. */
  released: number;
  /** Cards in the public catalog, and how many of those are released. */
  browse: number;
  browse_released: number;
  /** Cards with a colour signature. */
  colour: number;
  /** Cards in similar-compact.json; "server" when a game ranks neighbours live (Pokémon). */
  similar: number | string;
  /** Cards in the theme registry (0 when the game is not enabled); "own path" for Pokémon. */
  theme: number | string;
  /** Cards the newest scanner model answers. */
  scanner: number;
}

/** What the page stores per game: each feature's share of released cards and whether it is switched on. */
export interface GameShares {
  share: Record<FeatureKey, number>;
  on: Record<FeatureKey, boolean>;
}

/**
 * Shares are of RELEASED cards. The corpus can lag the catalog (Cyberpunk's local corpus named
 * 240 cards while the catalog carried 504), so the denominator is the larger of the two: a
 * feature is never credited with more than the cards that exist. A feature that lives on a server
 * rather than in a file ("server", "own path") is counted as covering everything, on.
 */
export function sharesOf(r: ReportGame): GameShares {
  const total = Math.max(r.released, r.browse, 1);
  const share = (v: number | string): number => (typeof v === 'number' ? Math.min(1, v / total) : 1);
  const on = (v: number | string): boolean => (typeof v === 'number' ? v > 0 : true);
  return {
    share: {
      search: Math.min(1, r.browse_released / Math.max(r.released, 1)),
      colour: share(r.colour),
      similar: share(r.similar),
      theme: share(r.theme),
      scanner: share(r.scanner),
    },
    on: {
      search: r.browse > 0,
      colour: on(r.colour),
      similar: on(r.similar),
      theme: on(r.theme),
      scanner: r.in_app && r.scanner > 0,
    },
  };
}

export function statusOf(share: number, on: boolean): CoverageStatus {
  return on && share >= LIVE_SHARE ? 'live' : 'wip';
}

export function statusesOf(g: GameShares): Record<FeatureKey, CoverageStatus> {
  return {
    search: statusOf(g.share.search, g.on.search),
    colour: statusOf(g.share.colour, g.on.colour),
    similar: statusOf(g.share.similar, g.on.similar),
    theme: statusOf(g.share.theme, g.on.theme),
    scanner: statusOf(g.share.scanner, g.on.scanner),
  };
}

export function liveCountOf(s: Record<FeatureKey, CoverageStatus>): number {
  return FEATURE_KEYS.filter((k) => s[k] === 'live').length;
}
