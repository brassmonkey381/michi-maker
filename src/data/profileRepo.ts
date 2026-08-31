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
  /** Votes summed across their publicly visible binders; the second ranking term. */
  binderVotes: number;
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
 * Public profiles, ranked by profile upvotes then total binder votes. Private and username-less
 * (guest) profiles are excluded by the RPC, for a typed query exactly as for an empty one.
 *
 * The two modes differ in what they reach, not in what they permit. An EMPTY query browses, and
 * only shows profiles with at least one publicly visible binder, because walking into an empty
 * profile is a dead end. A TYPED query searches everyone, ranked by how well the name matches
 * before how popular the person is.
 *
 * `offset` pages the same ordering. The RPC's ORDER BY is total (it ends on username), so a page
 * boundary cannot drop or repeat a row the way it would under a partial sort.
 */
export async function searchProfiles(
  query: string,
  limit = 30,
  offset = 0,
): Promise<PersonResult[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('search_profiles', {
    p_query: query,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(`search profiles: ${error.message}`);
  return ((data ?? []) as {
    id: string;
    username: string | null;
    avatar_url: string | null;
    upvotes: number;
    binder_votes: number;
  }[]).map((r) => ({
    id: r.id,
    username: r.username,
    avatarUrl: r.avatar_url,
    upvotes: Number(r.upvotes) || 0,
    binderVotes: Number(r.binder_votes) || 0,
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

/**
 * username -> avatar url, for a batch of people. One query for a whole grid rather than one per
 * tile: Discover shows up to 40 binders and would otherwise fire 40 requests to draw 40 avatars.
 *
 * Only PUBLIC profiles are returned, which is also the gate on whether the avatar may be shown at
 * all. A username with no entry in the returned map simply has no picture, which is the common
 * case (see ProfileAvatarButton) and not an error.
 */
export async function fetchAvatarsByUsername(
  usernames: string[],
): Promise<Map<string, string | null>> {
  const names = [...new Set(usernames.filter(Boolean).map((n) => n.toLowerCase()))];
  if (names.length === 0) return new Map();
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('username, avatar_url')
    .eq('is_public', true)
    .in('username', names);
  if (error) throw new Error(`load avatars: ${error.message}`);
  return new Map(
    ((data ?? []) as { username: string | null; avatar_url: string | null }[])
      .filter((r) => r.username)
      .map((r) => [r.username!.toLowerCase(), r.avatar_url]),
  );
}

/**
 * The public profile of whoever owns a binder.
 *
 * Starts from the binder because that is what the binder page has — it loads a binder, not a
 * person, and `DemoBinder` carries no owner. Two hops rather than a join so it needs no change to
 * the binder read path, and RLS still decides both halves: a private profile yields null and the
 * page simply shows no author.
 */
export async function fetchBinderOwner(binderId: string): Promise<PublicProfile | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('binders')
    .select('owner_id')
    .eq('id', binderId)
    .maybeSingle();
  if (error) throw new Error(`load binder owner: ${error.message}`);
  const ownerId = (data as { owner_id?: string } | null)?.owner_id;
  return ownerId ? fetchProfile(ownerId) : null;
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
