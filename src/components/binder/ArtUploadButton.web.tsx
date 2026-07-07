/**
 * Upload-your-own-image button — web.
 *
 * Opens the browser file picker, uploads the chosen image to the `binder-art` Storage bucket, and
 * hands back its public URL (so the caller can place it exactly like a pasted URL — but persisted).
 */

import { useRef, useState, type ChangeEvent } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { uploadArtImage } from '@/lib/uploadArt';
import { studioButton } from '@/constants/ui';

export interface ArtUploadButtonProps {
  onUploaded: (url: string) => void;
  onError?: (message: string) => void;
}

export function ArtUploadButton({ onUploaded, onError }: ArtUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ''; // let the user re-pick the same file later
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadArtImage(file, file.name);
      onUploaded(url);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onChange}
        style={{ display: 'none' }}
      />
      <Pressable
        onPress={() => inputRef.current?.click()}
        disabled={busy}
        style={({ pressed }) => [studioButton.base, (busy || pressed) && styles.pressed]}>
        <Text style={studioButton.text}>{busy ? 'Uploading…' : '⬆ Upload'}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
});
