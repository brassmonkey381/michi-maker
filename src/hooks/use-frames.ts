/**
 * The frame table for React (lib/frames): a snapshot that re-renders when the table lands, and
 * starts the one fetch when `enabled`. An art-view page passes true; a plain page passes false
 * and only listens, so a binder that never shows art never pays for the file.
 */
import { useEffect, useSyncExternalStore } from 'react';

import type { FrameTable } from '@/data/artView';
import { getFrames, loadFrames, subscribeFrames } from '@/lib/frames';

export function useFrames(enabled = true): FrameTable | null {
  const frames = useSyncExternalStore(subscribeFrames, getFrames, getFrames);
  useEffect(() => {
    if (enabled && !frames) void loadFrames();
  }, [enabled, frames]);
  return frames;
}
