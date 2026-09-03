/**
 * The demo clip, playing inline: muted, looping, no controls, starting when it scrolls into view
 * and stopping when it leaves — a moving screenshot, not a player. Same attributes the landing
 * page's clips use. An image source falls back to a plain picture at its own aspect.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import type { GuideMediaProps } from './GuideMedia';

export type { GuideMediaProps };

export function GuideMedia({ src, poster, alt }: GuideMediaProps) {
  const isVideo = src.endsWith('.mp4') || src.endsWith('.webm');
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !isVideo || typeof IntersectionObserver === 'undefined') return;
    // Six clips on one page would be six decoders running for pictures nobody is looking at.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) void el.play().catch(() => {});
          else el.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isVideo]);

  // Plain DOM elements: this file only ever renders on web, where react-dom owns the tree.
  const media = isVideo ? (
    <video ref={ref} src={src} poster={poster} muted loop playsInline preload="metadata" aria-label={alt} style={mediaStyle} />
  ) : (
    <img src={src} alt={alt} loading="lazy" style={mediaStyle} />
  );
  return <View style={styles.frame}>{media}</View>;
}

// Intrinsic aspect, full width: the clip decides its own height, so nothing is cropped.
const mediaStyle = { display: 'block', width: '100%', height: 'auto' } as const;

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: Radius.panel, overflow: 'hidden', backgroundColor: '#1D1A15' },
});
