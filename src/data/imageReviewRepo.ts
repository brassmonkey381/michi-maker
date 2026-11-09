/**
 * STUDIO'S IMAGE REVIEW LIST (MIC-029). Flagged and unchecked images from the light safety check,
 * waiting for a person. Reading is admin-only by RLS (image_reviews); decisions go through the
 * image-review edge function, which checks is_admin() and does what an admin cannot do under RLS
 * (clear another person's slot, delete the file from storage).
 */
import { requireSupabase } from '@/lib/supabase';

export type ReviewLabel = 'safe' | 'suggestive' | 'explicit' | 'refused' | 'unchecked';

export interface ImageReview {
  id: number;
  slotId: string;
  binderId: string;
  ownerId: string;
  imageUrl: string;
  label: ReviewLabel | null;
  minorConcern: boolean;
  reason: string | null;
  checkedAt: string | null;
}

/** Everything a person still has to decide, newest first. */
export async function listOpenImageReviews(limit = 100): Promise<ImageReview[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('image_reviews')
    .select('id, slot_id, binder_id, owner_id, image_url, label, minor_concern, reason, checked_at')
    .is('decision', null)
    .in('label', ['suggestive', 'explicit', 'refused', 'unchecked'])
    .order('checked_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`image reviews: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as number,
    slotId: r.slot_id as string,
    binderId: r.binder_id as string,
    ownerId: r.owner_id as string,
    imageUrl: r.image_url as string,
    label: (r.label as ReviewLabel | null) ?? null,
    minorConcern: r.minor_concern === true,
    reason: (r.reason as string | null) ?? null,
    checkedAt: (r.checked_at as string | null) ?? null,
  }));
}

/**
 * Decide one flagged image. approved: shown to visitors. removed: cleared from the slot and, when
 * the file is ours, deleted from storage (permanent); takedown also takes down every public binder
 * of the owner. Throws on refusal; read back nothing, the list reloads.
 */
export async function decideImageReview(id: number, decision: 'approved' | 'removed', takedown = false): Promise<void> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke('image-review', {
    body: { action: 'decide', id, decision, takedown },
  });
  if (error) throw new Error(`decide image: ${error.message}`);
  if (!data || (data as { ok?: boolean }).ok !== true) throw new Error(`decide image: ${JSON.stringify(data).slice(0, 120)}`);
}
