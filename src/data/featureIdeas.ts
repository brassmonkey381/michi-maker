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
  // Pruned 2026-10-27 (owner: "prune things we already kind of have"): prices on the page (the
  // edit view has a value badge), more card games (Collect builds every game), print the whole
  // binder (the print files cover it). Their ids keep their rows; they are just not shown.
  // Cut to twelve 2026-10-27 (owner): pin a card, deck binders, follow collectors, build together,
  // new set alerts, slab pockets. Same rule: rows stay, ids never reused for something else.
  // Then (owner): remix and import cut too, duplicate and CSV import exist; mats reworded as the
  // improvement it is (colour and pattern), deck binders and build together back in.
  { id: 'carousel-export', label: 'Instagram carousel export', blurb: 'Every page as a square picture, ready to post as one carousel.' },
  { id: 'price-alerts', label: 'Price alerts on your cards', blurb: 'A note when a card in your binder jumps or drops, with its history.' },
  { id: 'mat-styles', label: 'Mats in colour and pattern', blurb: 'Palettes and patterns for the cut-out mats, beyond black and white.' },
  { id: 'deck-binders', label: 'Deck binders', blurb: 'Pages shaped for a 60-card deck and its sideboard, one deck per binder.' },
  { id: 'build-together', label: 'Build a binder together', blurb: 'Invite a friend to edit the same binder.' },
  { id: 'own-layouts', label: 'Design your own layouts', blurb: 'Save a page shape and its art panels as a layout you can reuse.' },
  { id: 'want-list', label: 'Want list and trade list', blurb: 'What each set still needs, and the cards you can spare, as one list.' },
  { id: 'scan-to-pocket', label: 'Scan a card into a pocket', blurb: 'Point your phone at a card and it lands in the pocket you chose.' },
  { id: 'binder-comments', label: 'Comments on shared binders', blurb: 'Leave a note on a public binder, and read what people say about yours.' },
  { id: 'binder-stats', label: 'Binder stats', blurb: 'Total value, rarest card, most used artist, and how complete each set is.' },
  { id: 'page-turn-video', label: 'A page-turn video', blurb: 'Your binder as a short clip, ready for a post.' },
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
