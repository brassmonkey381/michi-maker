/**
 * THE VOTES ON THE SERVER (feature_votes, migration 20261027150000). Counts come from the
 * feature_vote_counts RPC and are readable by anyone; the account's own rows are readable only
 * by it; a vote is an insert and taking it back is a delete. Same session rule as surveyRepo: a
 * visitor without a session gets a guest one minted before the first write, and the page says so.
 */
import { requireSupabase } from '@/lib/supabase';
import { FEEDBACK_APP } from '@/data/surveys/michiFeedback';
import type { VoteState } from './featureIdeas';

export async function loadVotes(hasSession: boolean): Promise<VoteState> {
  const supabase = requireSupabase();
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  const [tally, own] = await Promise.all([
    supabase.rpc('feature_vote_counts', { p_app: FEEDBACK_APP }),
    hasSession ? supabase.from('feature_votes').select('feature').eq('app', FEEDBACK_APP) : Promise.resolve({ data: null, error: null }),
  ]);
  if (tally.error) throw new Error(tally.error.message);
  for (const row of tally.data ?? []) counts.set(row.feature, Number(row.votes));
  for (const row of own.data ?? []) mine.add(row.feature);
  return { counts, mine };
}

export type VoteOutcome = { ok: true } | { ok: false; reason: 'rate-limited' | 'error'; message: string };

/** Cast (`on`) or take back a vote. The caller has made sure a session exists. */
export async function writeVote(feature: string, on: boolean): Promise<VoteOutcome> {
  const supabase = requireSupabase();
  const { error } = on
    ? await supabase.from('feature_votes').insert({ app: FEEDBACK_APP, feature })
    : await supabase.from('feature_votes').delete().eq('app', FEEDBACK_APP).eq('feature', feature);
  if (!error) return { ok: true };
  // A second insert of the same vote is the page and the server disagreeing about state, not a
  // failure the voter can act on: the vote is there, which is what they asked for.
  if (on && error.code === '23505') return { ok: true };
  const rls = error.code === '42501' || /row-level security|violates row-level/i.test(error.message);
  if (rls) return { ok: false, reason: 'rate-limited', message: 'That is as many votes as one account can hold. Take one back to cast another.' };
  return { ok: false, reason: 'error', message: error.message };
}
