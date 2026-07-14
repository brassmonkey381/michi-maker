/**
 * Supabase access for people / profiles — search, view, and upvote.
 *
 * Profile upvotes mirror binder likes: real-account-only, one per voter, never yourself, only on a
 * public profile (enforced by profile_upvotes RLS). Public counts + search go through SECURITY
 * DEFINER RPCs so anonymous visitors get results without reading individual upvote rows.
 */
import { requireSupabase } from '@/lib/supabase';

/** A profile as it appears in people search / lists. The @username is the one public name. */
export interface PersonResult {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  upvotes: number;
}

/** A public profile's own detail (for the profile page). */
export interface PublicProfile {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
}

/**
 * Search public profiles by username, ranked by upvotes. Empty query → top profiles.
 * Private + username-less (guest) profiles are excluded by the RPC.
 */
export async function searchProfiles(query: string, limit = 30): Promise<PersonResult[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('search_profiles', { p_query: query, p_limit: limit });
  if (error) throw new Error(`search profiles: ${error.message}`);
  return ((data ?? []) as {
    id: string;
    username: string | null;
    avatar_url: string | null;
    upvotes: number;
  }[]).map((r) => ({
    id: r.id,
    username: r.username,
    avatarUrl: r.avatar_url,
    upvotes: Number(r.upvotes) || 0,
  }));
}

/** One profile's public detail, or null if it doesn't exist. */
export async function fetchProfile(id: string): Promise<PublicProfile | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, is_public')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`load profile: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    avatarUrl: data.avatar_url,
    isPublic: data.is_public,
  };
}

/** Public upvote count for a profile (via SECURITY DEFINER RPC — works for anonymous viewers). */
export async function fetchUpvoteCount(profileId: string): Promise<number> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('profile_upvote_count', { p_profile_id: profileId });
  if (error) throw new Error(`upvote count: ${error.message}`);
  return (data as number | null) ?? 0;
}

/** Whether `voterId` has upvoted this profile (RLS lets a user read their own upvote row). */
export async function hasUpvoted(profileId: string, voterId: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('profile_upvotes')
    .select('profile_id')
    .eq('profile_id', profileId)
    .eq('voter_id', voterId)
    .maybeSingle();
  if (error) throw new Error(`upvote state: ${error.message}`);
  return !!data;
}

/** Which of `profileIds` the voter has already upvoted — for reflecting state in a search list. */
export async function fetchUpvotedSet(voterId: string, profileIds: string[]): Promise<Set<string>> {
  if (profileIds.length === 0) return new Set();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('profile_upvotes')
    .select('profile_id')
    .eq('voter_id', voterId)
    .in('profile_id', profileIds);
  if (error) throw new Error(`upvoted set: ${error.message}`);
  return new Set(((data ?? []) as { profile_id: string }[]).map((r) => r.profile_id));
}

/** Upvote a profile as the current user (voter_id/created_at default in the DB). */
export async function upvoteProfile(profileId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('profile_upvotes').insert({ profile_id: profileId });
  if (error) throw new Error(`upvote: ${error.message}`);
}

/** Remove the current user's upvote from a profile. */
export async function removeUpvote(profileId: string, voterId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('profile_upvotes')
    .delete()
    .eq('profile_id', profileId)
    .eq('voter_id', voterId);
  if (error) throw new Error(`remove upvote: ${error.message}`);
}
