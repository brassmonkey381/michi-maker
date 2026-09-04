/**
 * Upload a soundtrack to the user's own folder in the `binder-audio` bucket and return the public
 * URL. Mirrors uploadArt: owner-folder path, no upsert, the bucket's own size and type limits as
 * the last line (they are enforced server-side whatever this file checks).
 */
import { uuidv4 } from '@/data/binderTypes';
import { requireSupabase } from '@/lib/supabase';

const BUCKET = 'binder-audio';
/** Matches the bucket's file_size_limit; checked here so the refusal is a sentence, not a 413. */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

export function audioExtFor(mime: string, filename?: string): string | null {
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  const fromName = filename?.split('.').pop()?.toLowerCase();
  return fromName && Object.values(EXT_BY_MIME).includes(fromName) ? fromName : null;
}

export async function uploadAudio(file: Blob, filename?: string): Promise<{ url: string; bytes: number }> {
  const supabase = requireSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to add a soundtrack.');
  if (file.size > MAX_AUDIO_BYTES) throw new Error('That file is over 8 MB. A three-minute MP3 is usually 3 to 5.');
  const ext = audioExtFor(file.type, filename);
  if (!ext) throw new Error('Use an MP3, M4A, AAC, OGG, WAV or WebM file.');
  const path = `${user.id}/${uuidv4()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, bytes: file.size };
}
