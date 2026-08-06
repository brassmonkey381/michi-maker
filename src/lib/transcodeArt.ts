/**
 * Re-encode art the share-image renderer can't read — native placeholder.
 *
 * Art upload/import is web-only today (see `ArtUploadButton.tsx`), and there's no canvas here, so
 * this always declines. The caller stores the original bytes with a correctly sniffed content
 * type, which is the important half. If native art upload lands, this is where an
 * `expo-image-manipulator` re-encode goes.
 */

export async function transcodeToRenderable(
  _blob: Blob,
): Promise<{ blob: Blob; mime: string } | null> {
  return null;
}
