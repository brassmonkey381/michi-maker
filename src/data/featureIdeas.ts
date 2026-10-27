/**
 * THE IDEAS ON THE WHAT-NEXT PAGE (/wishlist), and the pure vote arithmetic. The server keeps
 * one row per (voter, idea) in feature_votes and knows nothing about what an id means; this list
 * is the vocabulary. Adding an idea is one entry here. REMOVING one keeps its rows (they are the
 * record of what people asked for); the page just stops showing it.
 *
 * Ids are the schema: once an id has votes it is never renamed. Labels and blurbs may change.
 * Copy rules: no em-dashes, nothing about how a binder is made behind the scenes, and nothing
 * here promises a feature: a vote is a wish, and the page says so.
 */
export interface FeatureIdea {
  /** Stored in feature_votes.feature. `^[a-z][a-z0-9_-]{1,63}$`. */
  id: string;
  label: string;
  /** One line of scope, so two people voting for it mean the same thing. */
  blurb: string;
}

export const FEATURE_IDEAS: readonly FeatureIdea[] = [
  { id: 'prices-on-pages', label: 'Prices on the page', blurb: 'What each pocket is worth, and the page total, as you build.' },
  { id: 'more-games', label: 'More card games', blurb: 'Full binders for One Piece, Lorcana, Riftbound, Digimon and Magic, not only sets.' },
  { id: 'mat-styles', label: 'Printable mat styles', blurb: 'Patterns and palettes for the cut-out mats behind your cards.' },
  { id: 'pin-a-card', label: 'Pin a card while arranging', blurb: 'Hold one pocket in place and let Arrange seat the rest around it.' },
  { id: 'own-layouts', label: 'Design your own layouts', blurb: 'Save a page shape and its art panels as a layout you can reuse.' },
  { id: 'want-list', label: 'Want list and trade list', blurb: 'The cards your binder still needs, and the ones you can spare, as one list.' },
  { id: 'spreadsheet-import', label: 'Import a collection', blurb: 'Bring a spreadsheet or an export from another app into your binders.' },
  { id: 'page-turn-video', label: 'A page-turn video', blurb: 'Your binder as a short clip, ready for a post.' },
  { id: 'print-whole-binder', label: 'Print the whole binder', blurb: 'Every page as one PDF, with the mats and dividers in order.' },
  { id: 'build-together', label: 'Build a binder together', blurb: 'Invite a friend to edit the same binder.' },
  { id: 'set-alerts', label: 'New set alerts', blurb: 'A note the day a new set’s cards arrive, with a binder ready to start.' },
  { id: 'slab-pockets', label: 'Pockets for graded slabs', blurb: 'Pages shaped for slabs, alongside the card pages.' },
  { id: 'phone-app', label: 'A phone app', blurb: 'The editor in the app stores, with your binders synced.' },
];

/** The most votes one account may hold per app. Mirrors feature_votes_quota_left() on the server. */
export const VOTE_CAP = 24;

export interface VoteState {
  /** Ideas this account has voted for. */
  mine: ReadonlySet<string>;
  /** Votes per idea, everybody's. */
  counts: ReadonlyMap<string, number>;
}

/**
 * The page's optimistic step: what the state is after a click, before the server answers. A vote
 * on an idea already chosen takes it back. Counts never go below zero, whatever the tally said.
 */
export function applyToggle(state: VoteState, id: string): VoteState & { on: boolean } {
  const on = !state.mine.has(id);
  const mine = new Set(state.mine);
  if (on) mine.add(id);
  else mine.delete(id);
  const counts = new Map(state.counts);
  counts.set(id, Math.max(0, (counts.get(id) ?? 0) + (on ? 1 : -1)));
  return { mine, counts, on };
}

/** The list as the page shows it: most voted first, ties in the order written here. */
export function rankedIdeas(counts: ReadonlyMap<string, number>, ideas: readonly FeatureIdea[] = FEATURE_IDEAS): FeatureIdea[] {
  return ideas
    .map((idea, i) => ({ idea, i, n: counts.get(idea.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.idea);
}
