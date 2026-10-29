/**
 * WHICH FEATURES ARE LIVE FOR EACH GAME, for the /coverage page (owner, 2026-10-29: "start showing
 * the page on michi-maker.com ... under EXPLORE with a tab button named Coverage").
 *
 * Hand-copied from tcgscan-data's `orchestration/scripts/coverage_report.py` ("coverage report").
 * The rule: a feature is LIVE when it covers at least 70% of the game's RELEASED cards (presale
 * cards have no picture yet, so they do not count against it); anything under that is WIP. The
 * page shows statuses only, never the counts behind them. Refresh `AS_OF` with the rows.
 */
export type CoverageStatus = 'live' | 'wip';

export type CoverageFeature = { key: FeatureKey; label: string; blurb: string };

type FeatureKey = 'search' | 'colour' | 'similar' | 'theme' | 'scanner';

export const COVERAGE_AS_OF = '2026-10-29';

export const COVERAGE_FEATURES: CoverageFeature[] = [
  { key: 'search', label: 'Card search', blurb: 'find any card' },
  { key: 'colour', label: 'Colour fill', blurb: 'match by colour' },
  { key: 'similar', label: 'Similar fill', blurb: 'cards that look alike' },
  { key: 'theme', label: 'Theme search', blurb: 'search by what’s in the art' },
  { key: 'scanner', label: 'Card scanner', blurb: 'identify from a photo' },
];

export type CoverageRow = { game: string; note?: string; status: Record<FeatureKey, CoverageStatus> };

const ALL_LIVE: Record<FeatureKey, CoverageStatus> = { search: 'live', colour: 'live', similar: 'live', theme: 'live', scanner: 'live' };

/** Most live first, so the table reads from finished to in progress. */
export const COVERAGE_ROWS: CoverageRow[] = [
  { game: 'Pokémon', note: 'English', status: ALL_LIVE },
  { game: 'One Piece', status: ALL_LIVE },
  { game: 'Disney Lorcana', status: ALL_LIVE },
  { game: 'Cyberpunk TCG', status: ALL_LIVE },
  { game: 'Riftbound', status: { ...ALL_LIVE, theme: 'wip' } },
  { game: 'Digimon', status: { search: 'live', colour: 'live', similar: 'wip', theme: 'wip', scanner: 'wip' } },
  { game: 'Magic: The Gathering', status: { search: 'wip', colour: 'live', similar: 'wip', theme: 'wip', scanner: 'wip' } },
  { game: 'Yu-Gi-Oh!', status: { search: 'live', colour: 'wip', similar: 'wip', theme: 'wip', scanner: 'wip' } },
];

/** Where the printable copy lives (public/downloads/; not public/coverage/, which would shadow the /coverage route). */
export const COVERAGE_PDF = '/downloads/game-feature-coverage.pdf';
