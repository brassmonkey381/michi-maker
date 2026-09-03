/**
 * Binder contest data access (docs/CONTEST.md). Entries are owner-managed rows in
 * `contest_entries` (one binder → exactly one category; RLS enforces ownership and the
 * page cap); leaderboards come from the `contest_leaderboard` RPC (vote-ranked, public
 * entries only) and hydrate through the shared ranked-binder path; winners (the Hall of
 * Fame) are read-only rows we insert after the contest.
 *
 * STAGE 2 IS ITS OWN BALLOT. The final's field (`contest_finalists`) and its votes
 * (`contest_finals_votes`) are separate tables from entries and likes, so stage 1's result is
 * never overwritten to run stage 2 and both rounds stay auditable afterwards. Everything below
 * the `fetchContestWinners` block belongs to the final; the server re-checks the voting window
 * and the edit lock on its own clock, so these functions are a UI convenience, not the gate.
 */
import { CONTEST, type ContestCategory } from '@/data/contest';
import { hydrateRankedBinders } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { requireSupabase } from '@/lib/supabase';

export interface ContestEntry {
  binderId: string;
  category: ContestCategory;
  createdAt: string;
}

/**
 * Enter a binder. Category choice is FINAL — there is no update path (the DB has no UPDATE
 * policy); the only way to re-pick is withdraw + re-enter, which resets created_at (the final
 * tie-breaker), so flip-flopping costs ranking priority.
 */
export async function enterContest(binderId: string, category: ContestCategory): Promise<void> {
  const supabase = requireSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in to enter the contest.');
  const { error } = await supabase
    .from('contest_entries')
    .insert({ binder_id: binderId, owner_id: uid, contest: CONTEST.id, category });
  if (error) {
    if (error.code === '23505') throw new Error('This binder is already entered.');
    // The RLS page-cap gate surfaces as a bare policy violation — translate it for people.
    if (error.message.includes('row-level security')) {
      throw new Error(
        `Couldn't enter. Check the binder is yours and has at most ${CONTEST.pageCap} pages.`,
      );
    }
    throw new Error(`enter contest: ${error.message}`);
  }
}

export async function withdrawEntry(binderId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('contest_entries').delete().eq('binder_id', binderId);
  if (error) throw new Error(`withdraw entry: ${error.message}`);
}

/** The current user's entries for the running contest, keyed by binder id. */
export async function fetchMyEntries(ownerId: string): Promise<Map<string, ContestEntry>> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('contest_entries')
    .select('binder_id, category, created_at')
    .eq('owner_id', ownerId)
    .eq('contest', CONTEST.id);
  if (error) throw new Error(`my entries: ${error.message}`);
  return new Map(
    (data ?? []).map((r) => [
      r.binder_id,
      { binderId: r.binder_id, category: r.category as ContestCategory, createdAt: r.created_at },
    ]),
  );
}

/** One binder's entry (any owner — RLS shows public entries + your own), or null. */
export async function fetchEntry(binderId: string): Promise<ContestEntry | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('contest_entries')
    .select('binder_id, category, created_at')
    .eq('binder_id', binderId)
    .eq('contest', CONTEST.id)
    .maybeSingle();
  if (error) throw new Error(`entry: ${error.message}`);
  if (!data) return null;
  return { binderId: data.binder_id, category: data.category as ContestCategory, createdAt: data.created_at };
}

/**
 * Vote-ranked public entries for one category — or ALL entries (category null) for the derived
 * Community's Choice board. Vote-count TIES are shuffled per call so a new entry at 0 votes
 * isn't forever last: the ranking stays purely by votes, but equal-vote binders trade places
 * between page loads and everyone gets eyes.
 */
export async function fetchContestLeaderboard(
  category: ContestCategory | null,
  limit = 100,
): Promise<DemoBinder[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('contest_leaderboard', {
    p_contest: CONTEST.id,
    p_category: category,
    p_limit: limit,
  });
  if (error) throw new Error(`leaderboard: ${error.message}`);
  const rows = (data ?? []) as {
    binder_id: string;
    like_count: number;
    author_name: string | null;
    category: string;
  }[];

  // Shuffle within each vote-count tier (Fisher–Yates per group), keeping tiers in order.
  const byVotes = new Map<number, typeof rows>();
  for (const r of rows) {
    const k = Number(r.like_count);
    const g = byVotes.get(k);
    if (g) g.push(r);
    else byVotes.set(k, [r]);
  }
  const shuffled: typeof rows = [];
  for (const votes of [...byVotes.keys()].sort((a, b) => b - a)) {
    const g = byVotes.get(votes)!;
    for (let i = g.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [g[i], g[j]] = [g[j], g[i]];
    }
    shuffled.push(...g);
  }

  return hydrateRankedBinders(shuffled);
}

export interface ContestWinner {
  contest: string;
  category: string; // a category slug, or 'community'
  place: number;
  binderId: string;
  ownerId: string;
}

/** Hall of Fame rows (empty until we declare winners post-contest). */
export async function fetchContestWinners(contest = CONTEST.id): Promise<ContestWinner[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('contest_winners')
    .select('contest, category, place, binder_id, owner_id')
    .eq('contest', contest)
    .order('category')
    .order('place');
  if (error) throw new Error(`winners: ${error.message}`);
  return (data ?? []).map((r) => ({
    contest: r.contest,
    category: r.category,
    place: r.place,
    binderId: r.binder_id,
    ownerId: r.owner_id,
  }));
}

/** One entry in the Discover feed: the binder plus which category it was entered in. */
export interface FeedEntry {
  binder: DemoBinder;
  category: ContestCategory;
  enteredAt: string;
}

/**
 * Every public entry in the running contest, NEWEST FIRST — the feed at the top of Discover.
 *
 * Deliberately not the leaderboard. `fetchContestLeaderboard(null)` returns the same entries
 * ranked by votes, which leaves the same binders parked at the top until the voting moves and
 * gives a brand new entry nowhere to appear. A feed ordered by entry time means entering a
 * binder puts it in front of people straight away, and the vote-ranked view is still one chip
 * away.
 *
 * Falls back to the leaderboard when the RPC is absent (PGRST202 — migration not applied yet).
 */
export async function fetchContestEntryFeed(limit = 60): Promise<FeedEntry[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('contest_entry_feed', {
    p_contest: CONTEST.id,
    p_limit: limit,
  });
  if (error) {
    if (error.code === 'PGRST202') {
      const binders = await fetchContestLeaderboard(null, limit);
      return binders.map((b) => ({ binder: b, category: 'aesthetic' as ContestCategory, enteredAt: '' }));
    }
    throw new Error(`entry feed: ${error.message}`);
  }
  const rows = (data ?? []) as {
    binder_id: string;
    like_count: number;
    author_name: string | null;
    category: string;
    entered_at: string;
  }[];
  const binders = await hydrateRankedBinders(rows);
  // hydrateRankedBinders drops binders that vanished between ranking and fetch, so match on id
  // rather than assuming the two arrays line up.
  const meta = new Map(rows.map((r) => [r.binder_id, r]));
  return binders.flatMap((b) => {
    const r = meta.get(b.id);
    return r ? [{ binder: b, category: r.category as ContestCategory, enteredAt: r.entered_at }] : [];
  });
}


// ═══════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — the final
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface Finalist {
  binderId: string;
  category: ContestCategory;
  /** Stage-1 finishing position, 1..CONTEST.finalistsPerCategory. */
  seed: number;
  /** What it finished stage 1 with. Never a stage-2 score; shown as "how it qualified". */
  stage1Votes: number;
  locked: boolean;
}

/**
 * The frozen field. Readable by everyone the moment the snapshot lands, which is also how the UI
 * knows the final has really started: a `finals` phase with no finalist rows means the cutoff
 * script has not been run yet, and the boards say so rather than rendering an empty final.
 */
export async function fetchFinalists(contest = CONTEST.id): Promise<Finalist[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('contest_finalists')
    .select('binder_id, category, seed, stage1_votes, locked')
    .eq('contest', contest)
    .order('category')
    .order('seed');
  if (error) {
    // The table does not exist until the stage-2 migration is applied. An un-migrated database is
    // a deploy state, not a user error: the caller renders stage 1 rather than an error.
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw new Error(`finalists: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    binderId: r.binder_id,
    category: r.category as ContestCategory,
    seed: r.seed,
    stage1Votes: r.stage1_votes,
    locked: r.locked,
  }));
}

/** Is this binder a locked finalist? Drives the editor's read-only banner. */
export async function fetchLockState(binderId: string): Promise<Finalist | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('contest_finalists')
    .select('binder_id, category, seed, stage1_votes, locked')
    .eq('contest', CONTEST.id)
    .eq('binder_id', binderId)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw new Error(`lock state: ${error.message}`);
  }
  if (!data) return null;
  return {
    binderId: data.binder_id,
    category: data.category as ContestCategory,
    seed: data.seed,
    stage1Votes: data.stage1_votes,
    locked: data.locked,
  };
}

/**
 * Finalists ranked by STAGE-2 votes. Ties fall back to the stage-1 seed rather than to a shuffle:
 * on the first morning of the final every binder is on zero, and a board that reorders itself on
 * every page load at that moment reads as broken rather than as fair. The qualifying order is the
 * one thing that is both stable and earned.
 */
export async function fetchFinalsLeaderboard(
  category: ContestCategory | null,
  limit = 100,
): Promise<DemoBinder[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('contest_finals_leaderboard', {
    p_contest: CONTEST.id,
    p_category: category,
    p_limit: limit,
  });
  if (error) {
    if (error.code === 'PGRST202') return [];
    throw new Error(`finals leaderboard: ${error.message}`);
  }
  const rows = (data ?? []) as {
    binder_id: string;
    vote_count: number;
    author_name: string | null;
    category: string;
    seed: number;
  }[];
  // hydrateRankedBinders speaks `like_count` (the shared ranked-binder contract). A stage-2 vote
  // lands in the same `likeCount` field on the hydrated binder, which is what every tile already
  // renders as a vote count.
  return hydrateRankedBinders(
    rows.map((r) => ({
      binder_id: r.binder_id,
      like_count: Number(r.vote_count),
      author_name: r.author_name,
    })),
  );
}

/** Which finalists the signed-in account has already voted for, as a set of binder ids. */
export async function fetchMyFinalsVotes(): Promise<Set<string>> {
  const supabase = requireSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) return new Set();
  const { data, error } = await supabase
    .from('contest_finals_votes')
    .select('binder_id')
    .eq('contest', CONTEST.id);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return new Set();
    throw new Error(`my votes: ${error.message}`);
  }
  return new Set((data ?? []).map((r) => r.binder_id as string));
}

/**
 * Cast a stage-2 vote. The window, the finalist gate, the one-vote-per-binder rule and the
 * not-your-own-binder rule are all enforced by RLS on a clock the voter cannot set — this only
 * translates the refusals into something a person can act on.
 */
export async function castFinalsVote(binderId: string): Promise<void> {
  const supabase = requireSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in to vote.');
  const { error } = await supabase
    .from('contest_finals_votes')
    .insert({ contest: CONTEST.id, binder_id: binderId, voter_id: uid });
  if (!error) return;
  if (error.code === '23505') throw new Error('You have already voted for this binder.');
  if (error.message.includes('row-level security')) {
    throw new Error(
      'Voting is open to signed-in accounts, for finalists other than your own, while the final ' +
        'is running.',
    );
  }
  throw new Error(`vote: ${error.message}`);
}

/** Take a vote back while the window is open. Past the close the server refuses. */
export async function withdrawFinalsVote(binderId: string): Promise<void> {
  const supabase = requireSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in to vote.');
  const { data, error } = await supabase
    .from('contest_finals_votes')
    .delete()
    .eq('binder_id', binderId)
    .eq('voter_id', uid)
    .select('binder_id');
  if (error) throw new Error(`unvote: ${error.message}`);
  // A DELETE matching nothing under RLS succeeds silently, so an out-of-window take-back would
  // otherwise report success and leave the vote standing.
  if (!data || data.length === 0) throw new Error('Voting has closed, this vote is final.');
}
