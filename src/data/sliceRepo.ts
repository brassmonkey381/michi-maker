/**
 * Supabase persistence for saved slices (the Slice Studio tray). The boundary between the
 * SavedSlice view-model (src/data/savedSlices.ts) and the `saved_slices` rows.
 *
 * RLS scopes every read/write to the current user, so no owner filter is needed on selects and
 * owner_id is omitted on inserts (the column defaults to auth.uid()). Mirrors src/data/binderRepo.ts.
 *
 * Deletes are soft (`deleted_at`): the tray also imports binder artwork slots the account has
 * never seen (fetchBinderArtSlices + the signature match in savedSlices.ts), and a hard delete
 * would let that import resurrect a slice the user removed on the very next sync.
 */

import type { ImageTransform } from '@/data/binderTypes';
import type { SavedSlice } from '@/data/savedSlices';
import { requireSupabase } from '@/lib/supabase';
import type { Database, Json } from '@/types/database';

type Tables = Database['public']['Tables'];
type Row = Tables['saved_slices']['Row'];
type Insert = Tables['saved_slices']['Insert'];

function toSlice(r: Row): SavedSlice {
  return {
    id: r.id,
    imageUrl: r.image_url,
    crop: (r.crop as SavedSlice['crop']) ?? null,
    fit: (r.fit as 'cover' | 'contain' | null) ?? undefined,
    transform: (r.transform as ImageTransform | null) ?? undefined,
    rs: r.rs,
    cs: r.cs,
    groupId: r.group_id ?? undefined,
    label: r.label ?? undefined,
    attribution: (r.attribution as unknown as SavedSlice['attribution']) ?? undefined,
    createdAt: r.created_at,
    deletedAt: r.deleted_at ?? undefined,
  };
}

function toInsert(s: SavedSlice): Insert {
  // owner_id omitted so the DB default (auth.uid()) applies — see binderRepo.binderRow.
  return {
    id: s.id,
    image_url: s.imageUrl,
    crop: (s.crop ?? null) as Json,
    fit: s.fit ?? 'cover',
    transform: (s.transform ?? null) as Json,
    rs: s.rs,
    cs: s.cs,
    group_id: s.groupId ?? null,
    label: s.label ?? null,
    attribution: (s.attribution ?? null) as Json,
    ...(s.createdAt ? { created_at: s.createdAt } : {}),
  };
}

/**
 * ALL of the current user's slices, newest first, tombstones included (RLS scopes to the owner).
 * The caller shows only the live ones; deleted rows feed the import's "already seen" set.
 */
export async function fetchSavedSlices(): Promise<SavedSlice[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('saved_slices')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toSlice);
}

/** Live (non-tombstoned) slices in the tray — the "artworks kept in your account" count. */
export async function countLiveSavedSlices(): Promise<number> {
  const supabase = requireSupabase();
  const { count, error } = await supabase
    .from('saved_slices')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function insertSavedSlices(slices: SavedSlice[]): Promise<void> {
  if (!slices.length) return;
  const supabase = requireSupabase();
  const { error } = await supabase.from('saved_slices').insert(slices.map(toInsert));
  if (error) throw error;
}

/** Soft delete: tombstone the row so the binder-art import never resurrects it. */
export async function deleteSavedSlice(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('saved_slices')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Every artwork piece placed anywhere in the owner's binders, as unsaved SavedSlice candidates
 * (no id — the caller mints one if it decides to import). The explicit owner filter matters:
 * RLS also lets us read slots of *public* binders, which must not leak into a private tray.
 */
export async function fetchBinderArtSlices(ownerId: string): Promise<Omit<SavedSlice, 'id'>[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('binder_slots')
    .select(
      'image_url, image_crop, image_fit, image_transform, image_attribution, row_span, col_span, created_at, binder_pages!inner(binders!inner(owner_id))'
    )
    .eq('slot_type', 'artwork')
    .not('image_url', 'is', null)
    .eq('binder_pages.binders.owner_id', ownerId);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    imageUrl: s.image_url as string,
    crop: (s.image_crop as SavedSlice['crop']) ?? null,
    fit: (s.image_fit as 'cover' | 'contain' | null) ?? undefined,
    transform: (s.image_transform as ImageTransform | null) ?? undefined,
    attribution: (s.image_attribution as unknown as SavedSlice['attribution']) ?? undefined,
    rs: s.row_span,
    cs: s.col_span,
    createdAt: s.created_at,
  }));
}
