/**
 * WHICH FEATURES ARE LIVE FOR EACH GAME, for the /coverage page (owner, 2026-10-29: "start showing
 * the page on michi-maker.com ... under EXPLORE with a tab button named Coverage").
 *
 * The rows are NOT typed here. They come from tcgscan-data's coverage report, copied into
 * gameCoverage.json by `node scripts/coverage-sync.mjs`, and judged by coverageRule.ts: LIVE means
 * at least 70% of the game's released cards AND switched on where people reach it (the scanner's
 * chip in tcgscan-app, the theme registry, the published colour and similar files). Owner,
 * 2026-11-03: "make sure things are not only 70% covered, but live and accessible to be marked
 * Live", after Cyberpunk read all-live with its scanner off and half its cards uncovered.
 *
 * Refreshing: run the report in tcgscan-data (`python orchestration/scripts/coverage_report.py`),
 * then the sync here, then `node scripts/lab/print-coverage-pdf.mjs` for the PDF. The page shows
 * statuses only, never the counts behind them.
 */
import { FEATURE_KEYS, statusOf, type CoverageStatus, type FeatureKey } from './coverageRule.ts';
import coverage from './gameCoverage.json' with { type: 'json' };

export type { CoverageStatus, FeatureKey };

export type CoverageFeature = { key: FeatureKey; label: string; blurb: string };

export const COVERAGE_AS_OF: string = coverage.asOf;

export const COVERAGE_FEATURES: CoverageFeature[] = [
  { key: 'search', label: 'Card search', blurb: 'find any card' },
  { key: 'colour', label: 'Colour fill', blurb: 'match by colour' },
  { key: 'similar', label: 'Similar fill', blurb: 'cards that look alike' },
  { key: 'theme', label: 'Theme search', blurb: 'search by what’s in the art' },
  { key: 'scanner', label: 'Card scanner', blurb: 'identify from a photo' },
];

export type CoverageRow = { game: string; note?: string; status: Record<FeatureKey, CoverageStatus> };

type StoredGame = {
  key: string;
  game: string;
  note?: string;
  inApp: boolean;
  share: Record<FeatureKey, number>;
  on: Record<FeatureKey, boolean>;
  status: Record<FeatureKey, CoverageStatus>;
};

/**
 * Most live first, as the sync wrote them. The status is re-derived from the stored share and
 * switch, so a hand edit of one without the other cannot show (gameCoverage.test.ts pins both ways).
 */
export const COVERAGE_ROWS: CoverageRow[] = (coverage.games as StoredGame[]).map((g) => ({
  game: g.game,
  ...(g.note ? { note: g.note } : {}),
  status: Object.fromEntries(FEATURE_KEYS.map((k) => [k, statusOf(g.share[k] / 100, g.on[k])])) as Record<FeatureKey, CoverageStatus>,
}));

/** Where the printable copy lives (public/downloads/; not public/coverage/, which would shadow the /coverage route). */
export const COVERAGE_PDF = '/downloads/game-feature-coverage.pdf';
