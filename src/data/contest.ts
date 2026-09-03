/**
 * Binder contest — the ONE place for contest tunables (docs/CONTEST.md). The /contest rules
 * page, the ShareSheet entry UI, and the Discover leaderboards all render from this config, so
 * changing a date / prize / blurb here changes every surface at once.
 */

export type ContestCategory = 'aesthetic' | 'trainer' | 'artist' | 'creativity' | 'meme' | '2x2';

export interface PrizeRow {
  /** e.g. "1st", "2nd", "3rd–5th". */
  place: string;
  prize: string;
}

export interface CategorySpec {
  slug: ContestCategory;
  label: string;
  blurb: string;
  flagship?: boolean;
  prizes: PrizeRow[];
}

export const CONTEST = {
  id: 'first-annual-2026',
  name: 'First Annual Michi Binder Contest',
  // THREE INSTANTS (UTC), and every surface derives from them.
  //
  //   opensAt ──── stage 1, the open field ────> finalsOpenAt ──── stage 2, the final ────> endsAt
  //
  // Stage 1 is voted with ordinary binder likes and any public binder can enter. At finalsOpenAt
  // entries close, the top `finalistsPerCategory` of each category are frozen into
  // contest_finalists, locked against edits, and voted again FROM ZERO for a week — a separate
  // ballot (contest_finals_votes), so stage 1's likes are never rewritten to stage the rematch.
  opensAt: '2026-08-01T00:00:00Z',
  finalsOpenAt: '2026-10-10T00:00:00Z',
  endsAt: '2026-10-17T23:59:59Z',
  /** How many of each category carry into the stage-2 final. */
  finalistsPerCategory: 10,
  /** Submission cap on PUBLIC pages — any size binder can enter with ≤N pages public; only the
   *  first N public pages show in contest views. */
  pageCap: 16,
  headline: 'Over $1,700 in prizes, including a once-ever LIFETIME VIP grand prize.',
  subhead: '60 winners across 6 categories. Winners are decided purely by community votes.',
} as const;

export type ContestPhase = 'upcoming' | 'open' | 'finals' | 'ended';

/** Where the contest is in its lifecycle right now. */
export function contestPhase(nowMs = Date.now()): ContestPhase {
  if (nowMs < Date.parse(CONTEST.opensAt)) return 'upcoming';
  if (nowMs > Date.parse(CONTEST.endsAt)) return 'ended';
  if (nowMs >= Date.parse(CONTEST.finalsOpenAt)) return 'finals';
  return 'open';
}

/**
 * Can a binder still be entered (or withdrawn, or have its category changed)?
 *
 * Stage 1 only. The finalists are picked from the field as it stands at finalsOpenAt, so an entry
 * arriving during the final has nothing to qualify for, and a withdrawal would leave a frozen
 * finalist row on the board with no entry behind it.
 */
export function entriesOpen(phase: ContestPhase = contestPhase()): boolean {
  return phase === 'open';
}

/** Is stage-2 voting running right now? The server re-checks this against its own clock. */
export function finalsVotingOpen(phase: ContestPhase = contestPhase()): boolean {
  return phase === 'finals';
}

const STANDARD_PRIZES: PrizeRow[] = [
  { place: '1st', prize: '1 Year VIP' },
  { place: '2nd', prize: '1 Year PRO' },
  { place: '3rd–5th', prize: '3 Months PRO' },
  { place: '6th–10th', prize: '1 Month PRO' },
];

export const CATEGORIES: CategorySpec[] = [
  {
    slug: 'aesthetic',
    label: 'Best Aesthetic',
    blurb: 'The most beautiful binder, full stop. Color flow, page composition, the whole vibe.',
    flagship: true,
    prizes: [
      { place: '1st', prize: 'LIFETIME VIP' },
      { place: '2nd', prize: '1 Year VIP' },
      { place: '3rd–5th', prize: '3 Months PRO' },
      { place: '6th–10th', prize: '1 Month PRO' },
    ],
  },
  {
    slug: 'trainer',
    label: 'Best Trainer Showcase',
    blurb: 'A binder built around trainers: supporters, gym leaders, rivals, the humans of the hobby.',
    prizes: STANDARD_PRIZES,
  },
  {
    slug: 'artist',
    label: 'Best Artist Showcase',
    blurb: 'Celebrate one illustrator (or a school of them): their cards, their style, their story.',
    prizes: STANDARD_PRIZES,
  },
  {
    slug: 'creativity',
    label: 'Best Creativity',
    blurb: 'The most inventive concept: themes, stories, layouts nobody has tried before.',
    prizes: STANDARD_PRIZES,
  },
  {
    slug: 'meme',
    label: 'Best Meme',
    blurb: 'Make us laugh. The funniest binder wins: in-jokes, absurdity, perfect timing.',
    prizes: STANDARD_PRIZES,
  },
  {
    slug: '2x2',
    label: 'Best 2×2',
    blurb: 'The four-pocket format: tiny canvas, big statement. Best use of a 2×2 page layout.',
    prizes: STANDARD_PRIZES,
  },
];

export function categoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}
