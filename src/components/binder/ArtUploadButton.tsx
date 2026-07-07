/**
 * Upload-your-own-image button — native placeholder.
 *
 * File upload is web-only for now (uses the DOM file picker in `ArtUploadButton.web.tsx`). A native
 * implementation with `expo-image-picker` is a follow-up, so this renders nothing on iOS/Android.
 */

export interface ArtUploadButtonProps {
  /** Called with the uploaded image's public URL. */
  onUploaded: (url: string) => void;
  /** Called with a user-facing message if the upload fails. */
  onError?: (message: string) => void;
}

export function ArtUploadButton(_props: ArtUploadButtonProps) {
  return null;
}
