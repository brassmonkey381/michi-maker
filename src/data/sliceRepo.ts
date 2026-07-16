/**
 * Supabase persistence for saved slices (the Slice Studio tray). The boundary between the
 * SavedSlice view-model (src/data/savedSlices.ts) and the `saved_slices` rows.
 *
 * RLS scopes every read/write to the current user, so no owner filter is needed on selects and
 * owner_id is omitted on inserts (the column defaults to auth.uid()). Mirrors src/data/binderRepo.ts.
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
    createdAt: r.created_at,
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
  };
}

/** The current user's slices, newest first (RLS scopes to the owner). */
export async function fetchSavedSlices(): Promise<SavedSlice[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('saved_slices')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toSlice);
}

export async function insertSavedSlices(slices: SavedSlice[]): Promise<void> {
  if (!slices.length) return;
  const supabase = requireSupabase();
  const { error } = await supabase.from('saved_slices').insert(slices.map(toInsert));
  if (error) throw error;
}

export async function deleteSavedSlice(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('saved_slices').delete().eq('id', id);
  if (error) throw error;
}
