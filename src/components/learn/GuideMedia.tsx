/**
 * A guide's moving picture — on native, the still that stands in for it.
 *
 * The web variant (GuideMedia.web.tsx) plays the demo clip inline, muted and looping, the way the
 * landing page does. michi-maker does not ship natively, but the file has to compile there, and a
 * poster is the honest fallback: the same frame, not moving.
 */
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';

export interface GuideMediaProps {
  /** A video (mp4) or an image; decided by the extension. Root-relative paths resolve from public/. */
  src: string;
  /** For a video: the still shown until it plays, and on native instead of it. */
  poster?: string;
  alt: string;
}

export function GuideMedia({ src, poster, alt }: GuideMediaProps) {
  const still = src.endsWith('.mp4') || src.endsWith('.webm') ? poster : src;
  if (!still) return null;
  return (
    <View style={styles.frame}>
      <Image source={{ uri: still }} style={styles.image} contentFit="cover" accessibilityLabel={alt} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: Radius.panel, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 16 / 9 },
});
