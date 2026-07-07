/**
 * Upload a user-supplied image to the `binder-art` Storage bucket and return its public URL.
 *
 * Files land under `{uid}/…` so the bucket's RLS (owner-only write, public read via URL) applies.
 * The returned URL is stored on the artwork slot (`DemoSlot.imageUrl`) and persists like any other
 * image. Requires a signed-in user — anonymous guests are disabled on this project.
 */

import { uuidv4 } from '@/data/binderTypes';
import { requireSupabase } from '@/lib/supabase';

const BUCKET = 'binder-art';

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Upload an image blob; resolves to its public URL. Throws with a user-facing message on failure. */
export async function uploadArtImage(file: Blob, filename?: string): Promise<string> {
  const supabase = requireSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to upload your own images.');

  const ext = EXT_BY_TYPE[file.type] ?? (filename?.split('.').pop() || 'png').toLowerCase();
  const path = `${user.id}/${uuidv4()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
