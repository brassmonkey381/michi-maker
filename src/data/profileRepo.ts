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
  bio: string | null;
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

/**
 * A UUID, as opposed to a username. The two can never be confused: a username is constrained to
 * `^[a-z0-9_]{3,20}$` (20260711010000), so it carries no dashes and is far too short to be a UUID.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a profile is addressed by in a URL: the username when there is one, else the id.
 *
 * Username is the better key, and not only because it is readable — it is UNIQUE and IMMUTABLE
 * (20260711010000: once set, a username can never change), so a link built from it cannot rot the
 * way one built from a renameable handle would. It is already lowercase `[a-z0-9_]`, so it needs
 * no slugging or escaping either.
 *
 * The id fallback is not decoration: most accounts have no username, and one of those still needs
 * a working page.
 */
export function profileHandle(profile: { id: string; username?: string | null }): string {
  return profile.username || profile.id;
}

/**
 * One profile's public detail, or null if it doesn't exist.
 *
 * Takes EITHER a username or an id, because both are live: links are built from usernames now, and
 * every /u/<uuid> link shared before that is still out there and has to keep resolving.
 */
export async function fetchProfile(handle: string): Promise<PublicProfile | null> {
  const base = requireSupabase().from('profiles').select('id, username, avatar_url, bio, is_public');
  // Usernames are stored lowercase by the format constraint, so a typed-in capital still has to
  // match — hence ilike (an exact match; the value carries no wildcards) rather than eq.
  const { data, error } = await (UUID.test(handle)
    ? base.eq('id', handle)
    : base.ilike('username', handle)
  ).maybeSingle();
  if (error) throw new Error(`load profile: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    avatarUrl: data.avatar_url,
    bio: data.bio,
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
