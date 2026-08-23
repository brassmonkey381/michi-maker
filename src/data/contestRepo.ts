/**
 * Binder contest data access (docs/CONTEST.md). Entries are owner-managed rows in
 * `contest_entries` (one binder → exactly one category; RLS enforces ownership and the
 * page cap); leaderboards come from the `contest_leaderboard` RPC (vote-ranked, public
 * entries only) and hydrate through the shared ranked-binder path; winners (the Hall of
 * Fame) are read-only rows we insert after the contest.
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
