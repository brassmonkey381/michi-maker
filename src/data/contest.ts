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
  // ⚠️ PLACEHOLDER DATES — set the real window before announcing. Everything derives from
  // these two instants (UTC): entries + category changes lock at endsAt, and winners are
  // computed from the vote counts at endsAt.
  opensAt: '2026-08-01T00:00:00Z',
  endsAt: '2026-09-30T23:59:59Z',
  /** Submission cap on PUBLIC pages — any size binder can enter with ≤N pages public; only the
   *  first N public pages show in contest views. */
  pageCap: 16,
  headline: 'Over $1,700 in prizes, including a once-ever LIFETIME VIP grand prize.',
  subhead: '60 winners across 6 categories. Winners are decided purely by community votes.',
} as const;

/** Where the contest is in its lifecycle right now. */
export function contestPhase(nowMs = Date.now()): 'upcoming' | 'open' | 'ended' {
  if (nowMs < Date.parse(CONTEST.opensAt)) return 'upcoming';
  if (nowMs > Date.parse(CONTEST.endsAt)) return 'ended';
  return 'open';
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
