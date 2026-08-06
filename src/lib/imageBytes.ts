/**
 * Image format identification from the BYTES.
 *
 * Neither a filename nor a `Content-Type` can be trusted for user-supplied art. Real case from
 * the `binder-art` bucket: AVIF bytes stored as `.jpg` and served as `image/jpeg`, because the
 * import path believed the header a remote host sent. Browsers cope (they sniff too), but the
 * share-image renderer does not — Satori decodes PNG/JPEG only, and it doesn't throw on a format
 * it can't read, it silently draws nothing. So the pocket unfurled black on Discord.
 *
 * Bytes are the authority everywhere art enters: `importArt.ts` (remote import) and
 * `uploadArt.ts` (file picker). Pure and dependency-free so `npm test` can exercise it.
 */

/** Formats the share-image renderer (Satori, in `api/og-image-binder.js`) can rasterise. */
const RENDERABLE = new Set(['image/png', 'image/jpeg']);

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
};

const at = (b: Uint8Array, i: number, ...want: number[]) =>
  b.length >= i + want.length && want.every((v, k) => b[i + k] === v);

/**
 * The real MIME of an image from its leading bytes, or null if unrecognised (caller should then
 * fall back to whatever the source declared). Only the first 12 bytes are read, so a `blob.slice`
 * head is enough — no need to buffer a whole image to identify it.
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (at(bytes, 0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png'; // \x89PNG
  if (at(bytes, 0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(bytes, 0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif'; // GIF8
  // RIFF....WEBP
  if (at(bytes, 0, 0x52, 0x49, 0x46, 0x46) && at(bytes, 8, 0x57, 0x45, 0x42, 0x50)) {
    return 'image/webp';
  }
  // ISO-BMFF: `....ftyp<brand>`. AVIF and HEIC share the container; the brand separates them.
  if (at(bytes, 4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heic';
    }
  }
  return null;
}

/**
 * Should this format be re-encoded before it's stored? True for the modern still formats browsers
 * decode but Satori can't (WebP/AVIF/HEIC). GIF is deliberately NOT transcoded — flattening it to
 * PNG would kill the animation, a worse trade than a pocket that doesn't appear in a share image.
 */
export function needsTranscode(mime: string | null): boolean {
  return !!mime && !RENDERABLE.has(mime) && mime !== 'image/gif';
}

/** Canonical file extension for a MIME, or null when we don't recognise it. */
export function extForMime(mime: string | null): string | null {
  return (mime && EXT_BY_MIME[mime]) || null;
}
