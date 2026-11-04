/**
 * ARTISTS (owner, 2026-11-03): real artists share pieces for collectors to preview on the
 * surfaces the app decorates. Preview only; nothing here can be printed or bought. The data
 * side is supabase/migrations/20261103100000_artists.sql: profiles.is_artist (admin-granted),
 * artist_pieces (every upload is pending until an admin approves it), and the artist_shelf view
 * that the pickers read (approved pieces only, with the artist's name and link).
 *
 * Attribution on a placed piece is origin 'artist': public-eligible (the artist offered it for
 * exactly this), credited by username with the artist's link, and printed as a placeholder unless
 * the artist allows printing (profiles.artist_prints, 2026-11-03; the owner's own account first):
 * then `printable` is stamped on the attribution and the piece prints as the picture.
 */
import type { ArtAttribution } from './artworkLibrary.ts';
import { requireSupabase } from '@/lib/supabase';

export const ARTIST_SURFACES = ['slot', 'sleeve', 'backing', 'background', 'cover', 'mat'] as const;
export type ArtistSurface = (typeof ARTIST_SURFACES)[number];

export const ARTIST_SURFACE_LABELS: Record<ArtistSurface, string> = {
  slot: 'Art slots and inserts',
  sleeve: 'Sleeves',
  backing: 'Art backings',
  background: 'Page backgrounds',
  cover: 'Binder covers',
  mat: 'Art window mats',
};

export type PieceStatus = 'pending' | 'approved' | 'rejected' | 'removed';

/** One approved piece as the pickers see it. */
export interface ShelfPiece {
  id: string;
  title: string;
  url: string;
  width: number | null;
  height: number | null;
  surfaces: ArtistSurface[];
  artistId: string;
  artistUsername: string | null;
  artistName: string | null;
  artistLink: string | null;
  /** The artist allows printing: a placed piece prints as the picture. */
  prints: boolean;
}

/** One of the signed-in artist's own pieces, at any status. */
export interface MyPiece {
  id: string;
  title: string;
  url: string;
  width: number | null;
  height: number | null;
  surfaces: ArtistSurface[];
  status: PieceStatus;
  reviewNote: string | null;
  createdAt: string;
}

/** The Studio queue row. */
export interface AdminPiece extends MyPiece {
  artistId: string;
  artistUsername: string | null;
  artistName: string | null;
}

/** How a placed piece is credited: "@username" with their link, origin 'artist'. */
export function artistAttribution(p: Pick<ShelfPiece, 'artistUsername' | 'artistName' | 'artistLink' | 'title'> & Partial<Pick<ShelfPiece, 'prints'>>): ArtAttribution {
  const name = p.artistUsername ? `@${p.artistUsername}` : (p.artistName ?? 'an artist');
  return { artist: name, sourceName: p.title, sourceUrl: p.artistLink ?? undefined, origin: 'artist', ...(p.prints ? { printable: true } : {}) };
}

export { printsAsPicture } from './artworkLibrary.ts';

/** "@username" or the display name, for a credit line. */
export function artistLabel(p: Pick<ShelfPiece, 'artistUsername' | 'artistName'>): string {
  return p.artistUsername ? `@${p.artistUsername}` : (p.artistName ?? 'an artist');
}

// ── the shelf (everyone) ────────────────────────────────────────────────────────────────────
// One fetch per app load, shared by every picker: the shelf is small and changes rarely.
let shelfCache: { at: number; pieces: ShelfPiece[] } | null = null;
let shelfInflight: Promise<ShelfPiece[]> | null = null;
const SHELF_TTL_MS = 5 * 60 * 1000;

type ShelfRow = {
  id: string; title: string; url: string; width: number | null; height: number | null; surfaces: string[];
  artist_id: string; artist_username: string | null; artist_name: string | null; artist_link: string | null;
  prints?: boolean | null;
};

export async function fetchArtistShelf(): Promise<ShelfPiece[]> {
  if (shelfCache && Date.now() - shelfCache.at < SHELF_TTL_MS) return shelfCache.pieces;
  if (shelfInflight) return shelfInflight;
  shelfInflight = (async () => {
    try {
      const supabase = requireSupabase();
      const { data, error } = await supabase.from('artist_shelf' as never).select('*').order('created_at', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      const pieces = ((data ?? []) as unknown as ShelfRow[]).map((r) => ({
        id: r.id, title: r.title, url: r.url, width: r.width, height: r.height,
        surfaces: r.surfaces.filter((s): s is ArtistSurface => (ARTIST_SURFACES as readonly string[]).includes(s)),
        artistId: r.artist_id, artistUsername: r.artist_username, artistName: r.artist_name, artistLink: r.artist_link,
        prints: r.prints === true,
      }));
      shelfCache = { at: Date.now(), pieces };
      return pieces;
    } catch {
      // No shelf is an empty shelf: the pickers simply show nothing extra.
      return shelfCache?.pieces ?? [];
    } finally {
      shelfInflight = null;
    }
  })();
  return shelfInflight;
}

export function invalidateArtistShelf() {
  shelfCache = null;
}

export function piecesFor(pieces: readonly ShelfPiece[], surface: ArtistSurface): ShelfPiece[] {
  return pieces.filter((p) => p.surfaces.includes(surface));
}

/** The shelf piece a stored address came from, if any. */
export function shelfPieceFor(pieces: readonly ShelfPiece[], url: string | null | undefined): ShelfPiece | undefined {
  return url ? pieces.find((p) => p.url === url) : undefined;
}

// ── the artist's own pieces ─────────────────────────────────────────────────────────────────
type PieceRow = {
  id: string; title: string; url: string; width: number | null; height: number | null; surfaces: string[];
  status: PieceStatus; review_note: string | null; created_at: string;
};

const toMine = (r: PieceRow): MyPiece => ({
  id: r.id, title: r.title, url: r.url, width: r.width, height: r.height,
  surfaces: r.surfaces.filter((s): s is ArtistSurface => (ARTIST_SURFACES as readonly string[]).includes(s)),
  status: r.status, reviewNote: r.review_note, createdAt: r.created_at,
});

export async function fetchMyPieces(): Promise<MyPiece[]> {
  const supabase = requireSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('artist_pieces' as never)
    .select('id, title, url, width, height, surfaces, status, review_note, created_at')
    .eq('artist_id', user.id)
    .neq('status', 'removed')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`your pieces: ${error.message}`);
  return ((data ?? []) as unknown as PieceRow[]).map(toMine);
}

export async function addPiece(input: { title: string; url: string; width?: number | null; height?: number | null; surfaces: ArtistSurface[] }): Promise<MyPiece> {
  const supabase = requireSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to add a piece.');
  const { data, error } = await supabase
    .from('artist_pieces' as never)
    .insert({ artist_id: user.id, title: input.title.trim(), url: input.url, width: input.width ?? null, height: input.height ?? null, surfaces: input.surfaces, status: 'pending' } as never)
    .select('id, title, url, width, height, surfaces, status, review_note, created_at')
    .single();
  if (error) throw new Error(/is_artist|policy/i.test(error.message) ? 'Your account is not an artist account yet.' : error.message);
  return toMine(data as unknown as PieceRow);
}

export async function updatePiece(id: string, patch: { title?: string; surfaces?: ArtistSurface[] }): Promise<MyPiece> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('artist_pieces' as never)
    .update({ ...(patch.title !== undefined ? { title: patch.title.trim() } : {}), ...(patch.surfaces ? { surfaces: patch.surfaces } : {}) } as never)
    .eq('id', id)
    .select('id, title, url, width, height, surfaces, status, review_note, created_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That piece is gone.');
  invalidateArtistShelf();
  return toMine(data as unknown as PieceRow);
}

/** Withdraw a piece: it leaves every shelf at once (the guard allows an artist to set 'removed'). */
export async function withdrawPiece(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('artist_pieces' as never).update({ status: 'removed' } as never).eq('id', id);
  if (error) throw new Error(error.message);
  invalidateArtistShelf();
}

// ── admin ───────────────────────────────────────────────────────────────────────────────────
type AdminRow = PieceRow & { artist_id: string; artist_username: string | null; artist_name: string | null };

export async function adminArtistPieces(status: PieceStatus | 'all' = 'pending'): Promise<AdminPiece[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('admin_artist_pieces' as never, { p_status: status, p_limit: 200 } as never);
  if (error) throw new Error(`artist queue: ${error.message}`);
  return ((data ?? []) as unknown as AdminRow[]).map((r) => ({ ...toMine(r), artistId: r.artist_id, artistUsername: r.artist_username, artistName: r.artist_name }));
}

export async function adminReviewPiece(id: string, status: PieceStatus, note?: string | null): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('admin_review_piece' as never, { p_piece: id, p_status: status, p_note: note ?? null } as never);
  if (error) throw new Error(`review: ${error.message}`);
  invalidateArtistShelf();
}

/** Grant or revoke the artist flag by username. Resolves the id through the public profile read. */
export async function adminSetArtistByUsername(username: string, on: boolean): Promise<{ id: string; username: string }> {
  const supabase = requireSupabase();
  const handle = username.trim().replace(/^@/, '');
  const { data: prof, error: lookErr } = await supabase.from('profiles').select('id, username').ilike('username', handle).maybeSingle();
  if (lookErr) throw new Error(lookErr.message);
  if (!prof) throw new Error(`No account is named @${handle}.`);
  const { error } = await supabase.rpc('admin_set_artist' as never, { p_user: prof.id, p_on: on } as never);
  if (error) throw new Error(`set artist: ${error.message}`);
  return { id: prof.id, username: prof.username ?? handle };
}

export interface AdminArtist {
  id: string;
  username: string | null;
  displayName: string | null;
  artistLink: string | null;
  /** The artist allows printing (profiles.artist_prints). */
  prints: boolean;
}

export async function adminListArtists(): Promise<AdminArtist[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from('profiles').select('id, username, display_name, artist_link, artist_prints').eq('is_artist', true).order('username');
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ id: p.id, username: p.username, displayName: p.display_name, artistLink: p.artist_link, prints: p.artist_prints === true }));
}

/** Allow or stop an artist's pieces printing as pictures. Pieces already placed keep the stamp they were placed with. */
export async function adminSetArtistPrints(userId: string, on: boolean): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('admin_set_artist_prints' as never, { p_user: userId, p_on: on } as never);
  if (error) throw new Error(`set prints: ${error.message}`);
  invalidateArtistShelf();
}
