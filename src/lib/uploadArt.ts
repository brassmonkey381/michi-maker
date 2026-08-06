/**
 * Upload a user-supplied image to the `binder-art` Storage bucket and return its public URL.
 *
 * Files land under `{uid}/…` so the bucket's RLS (owner-only write, public read via URL) applies.
 * The returned URL is stored on the artwork slot (`DemoSlot.imageUrl`) and persists like any other
 * image. Requires a signed-in user — anonymous guests are disabled on this project.
 */

import { uuidv4 } from '@/data/binderTypes';
import { extForMime, needsTranscode, sniffImageMime } from '@/lib/imageBytes';
import { requireSupabase } from '@/lib/supabase';
import { transcodeToRenderable } from '@/lib/transcodeArt';

const BUCKET = 'binder-art';

/**
 * Settle what actually gets stored: the real format from the bytes (never the declared type — see
 * `imageBytes.ts`), re-encoded to PNG/JPEG when it's a format the share-image renderer can't read.
 * Every art upload funnels through here, so neither the picker nor the remote import can put a
 * mislabelled object in the bucket.
 */
async function prepareArt(file: Blob, filename?: string) {
  const declared = file.type && file.type.startsWith('image/') ? file.type : null;
  let blob = file;
  let mime = declared;

  // `slice` keeps this to the header — no need to buffer a whole image to identify it. Guarded
  // because React Native's Blob has no arrayBuffer(); there we simply keep the declared type.
  let sniffed: string | null = null;
  try {
    if (typeof file.slice === 'function' && typeof file.arrayBuffer === 'function') {
      sniffed = sniffImageMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    }
  } catch {
    /* unreadable head — fall back to the declared type */
  }
  if (sniffed) mime = sniffed;

  if (needsTranscode(sniffed)) {
    const out = await transcodeToRenderable(file);
    if (out) {
      blob = out.blob;
      mime = out.mime;
    }
  }

  const ext = extForMime(mime) ?? (filename?.split('.').pop() || 'png').toLowerCase();
  return { blob, mime, ext };
}

/** Upload an image blob; resolves to its public URL. Throws with a user-facing message on failure. */
export async function uploadArtImage(file: Blob, filename?: string): Promise<string> {
  const supabase = requireSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to upload your own images.');

  const { blob, mime, ext } = await prepareArt(file, filename);
  const path = `${user.id}/${uuidv4()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: mime || undefined,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
