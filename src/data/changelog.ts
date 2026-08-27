/**
 * The public changelog behind `/whats-new`: what shipped, in the user's language, grouped by
 * date, newest first.
 *
 * HOUSE RULES for entries, so the page stays worth reading:
 *   - User-facing outcomes only. "Binders start out public once you turn sharing on", never
 *     "refactored the provenance gate". If a change has no visible effect, it does not belong.
 *   - Honest about scope: if existing data is untouched, say so; if a feature needs a plan or an
 *     account, say so.
 *   - One entry per shipped batch, dated by the day it reached michi-maker.com. Append at the
 *     TOP; the page renders this array in order.
 *   - Plain punctuation. No em-dashes, no decorative emoji.
 */

export interface ChangelogItem {
  head: string;
  body: string;
}

export interface ChangelogEntry {
  /** ISO date (the day it went live). */
  date: string;
  /** Short name for the batch. */
  title: string;
  items: ChangelogItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-08-26',
    title: 'Sharing, opened up',
    items: [
      {
        head: 'Your profile photo is yours to give',
        body:
          'Signing in with Google used to copy your account photo across, and when profile pages '
          + 'arrived it started showing publicly without anyone asking you. We have taken every '
          + 'copied photo down. Next time you sign in we will show you yours and ask: put it on '
          + 'your profile, or leave it off. Either answer sticks, and you can change it whenever '
          + 'you like from Account settings.',
      },
      {
        head: 'Share once, and new binders start out public',
        body:
          'Turn on sharing (a one-time confirmation that you have the rights to the art you '
          + 'share) and every binder you create from then on starts out public: it can be '
          + 'discovered, liked, and entered in contests. Existing binders are untouched, and any '
          + 'binder can be made private again from Share. Find the switch in Account settings, '
          + 'or accept it when we ask.',
      },
      {
        head: 'Profiles get a face and a voice',
        body:
          'Add a photo and a short bio from your account sheet. Both show on your public profile '
          + 'and in people search, so a shared binder finally lands somewhere that feels like '
          + 'yours.',
      },
      {
        head: 'Imported art can be shared',
        body:
          'Art you bring in from a link can now appear in your public binders, shown with its '
          + 'credit. If older art in a binder is not saved to your account yet, Share offers to '
          + 'save copies for you in one tap.',
      },
      {
        head: 'Better reporting',
        body:
          'Profiles can be reported as well as binders, and reports now reach us faster, so '
          + 'takedown requests get acted on sooner.',
      },
    ],
  },
  {
    date: '2026-08-23',
    title: 'Discover',
    items: [
      {
        head: 'A place to browse everything public',
        body:
          'The Discover page shows public binders newest-first or most-liked, with current '
          + 'contest entries up front.',
      },
    ],
  },
  {
    date: '2026-08-04',
    title: 'Link previews, your pick',
    items: [
      {
        head: 'Choose the pages your share link shows',
        body:
          'Pick up to two pages to feature in the preview image when you share a binder link, '
          + 'or leave it on auto and we pick your fullest pages.',
      },
    ],
  },
  {
    date: '2026-07-25',
    title: 'The contest, and search',
    items: [
      {
        head: 'The First Annual Binder Contest',
        body:
          'Enter a public binder, pick a category, and climb the leaderboard on likes.',
      },
      {
        head: 'Search public binders',
        body: 'Find binders by title, description, or the builder’s @username.',
      },
    ],
  },
  {
    date: '2026-07-22',
    title: 'Pro plans',
    items: [
      {
        head: 'michi Pro launched',
        body:
          'Higher binder, page, and artwork caps, plus a bigger print allowance, for the '
          + 'collectors who build in bulk.',
      },
    ],
  },
  {
    date: '2026-07-16',
    title: 'Print-ready exports',
    items: [
      {
        head: 'From screen to sleeve',
        body:
          'Export binder pages as print-ready PDFs at true card size, built in your browser and '
          + 'ready for home printing.',
      },
    ],
  },
  {
    date: '2026-07-11',
    title: 'Community basics',
    items: [
      {
        head: 'Likes, featured binders, and people search',
        body:
          'Like public binders, see a rolling shelf of the community’s favorites on the '
          + 'home page, and find (and upvote) other builders in people search.',
      },
    ],
  },
];
