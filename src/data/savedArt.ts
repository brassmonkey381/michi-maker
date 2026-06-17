/**
 * In-session saved artwork — art the user saves from the Slice Studio. Lives in memory only
 * (resets on reload); persisting it (and binders) to AsyncStorage is a deliberate follow-up.
 *
 * A tiny external store so any component (e.g. the CardPicker) can read the saved list and
 * re-render when it changes, without threading a provider through the tree.
 */

import { useSyncExternalStore } from 'react';

import type { ArtworkAsset } from '@/data/artworkLibrary';

let saved: ArtworkAsset[] = [];
const listeners = new Set<() => void>();

/** Add (or move-to-front) an artwork to the in-session library. */
export function addSavedArt(asset: ArtworkAsset): void {
  saved = [asset, ...saved.filter((a) => a.url !== asset.url)];
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

function snapshot(): ArtworkAsset[] {
  return saved;
}

/** Reactive list of art saved this session. */
export function useSavedArt(): ArtworkAsset[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
