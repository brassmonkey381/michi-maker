/**
 * Upload a profile avatar to the `avatars` bucket and return its public URL.
 *
 * Same funnel discipline as binder art (prepareArt: byte-sniffed mime, transcode when needed),
 * with two avatar-specific differences:
 *
 *   DOWNSCALED before upload. An avatar renders at 36-72px; shipping a 4MB photo to serve a
 *   circle is bandwidth for nothing. On web the image is drawn onto a 256px canvas; anywhere a
 *   canvas is unavailable the original goes up as-is and the bucket's 2MB cap is the backstop.
 *
 *   OLD FILES ARE DELETED. Uploads use a fresh uuid name (so the URL changes and every cached
 *   render busts naturally), and the rest of the user's folder is removed after a successful
 *   upload. Without that, every avatar change would strand the previous file in a public bucket
 *   forever; delete-account purges the folder wholesale either way.
 */
import { uuidv4 } from '@/data/binderTypes';
import { requireSupabase } from '@/lib/supabase';
import { prepareArt } from '@/lib/uploadArt';

const BUCKET = 'avatars';
const MAX_EDGE = 256;

/** Downscale to MAX_EDGE on the long side, when a canvas exists to do it with. */
async function downscale(blob: Blob, mime: string | null): Promise<Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale >= 1) return blob;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime === 'image/png' ? 'image/png' : 'image/jpeg', 0.9),
    );
    return out ?? blob;
  } catch {
    return blob; // an undecodable image still gets its chance at the original size
  }
}

/** Upload an avatar; resolves to its public URL. Throws with a user-facing message on failure. */
export async function uploadAvatarImage(file: Blob, filename?: string): Promise<string> {
  const supabase = requireSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to set an avatar.');

  const prepared = await prepareArt(file, filename);
  const blob = await downscale(prepared.blob, prepared.mime);
  const path = `${user.id}/${uuidv4()}.${prepared.ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: prepared.mime || undefined,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  // Best-effort cleanup of prior avatars. The new file is already in place, so a failure here
  // costs an orphaned old image, not the change.
  try {
    const { data: existing } = await supabase.storage.from(BUCKET).list(user.id);
    const stale = (existing ?? [])
      .map((f) => `${user.id}/${f.name}`)
      .filter((p) => p !== path);
    if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
  } catch {
    /* orphaned old avatar; delete-account still purges the folder */
  }

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
