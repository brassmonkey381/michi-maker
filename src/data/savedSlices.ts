/**
 * The saved-slice tray — art pieces cut in the Slice Studio and kept for placing into binder
 * pockets later. Unlike the in-session saved *art* library (src/data/savedArt.ts), slices persist
 * to the user's account (Supabase, guests included) via src/data/sliceRepo.ts.
 *
 * A tiny external store (useSyncExternalStore) so any component — the editor tray, the studio —
 * reads the list and re-renders on change without a provider. Mutations are optimistic: the memory
 * list updates immediately and the write is fired off; a failed write only warns (the piece stays
 * in the tray for this session). `useSavedSlicesSync()` hydrates the list on sign-in and resets it
 * on any identity change, so no slice from a previous account survives (mirrors the binders store).
 */

import { useEffect, useSyncExternalStore } from 'react';

import type { ImageTransform } from '@/data/binderTypes';
import * as repo from '@/data/sliceRepo';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

/** One insertable art piece: an (imageUrl, crop, transform) window at a 1x1 or folded-1x2 footprint. */
export interface SavedSlice {
  id: string;
  imageUrl: string;
  /** Sub-rectangle of the image as fractions 0–1 (absent ⇒ whole image). */
  crop?: { x: number; y: number; w: number; h: number } | null;
  fit?: 'cover' | 'contain';
  transform?: ImageTransform;
  /** Footprint: rows is always 1 (side-load pockets don't span rows); cols is 1 or 2. */
  rs: number;
  cs: number;
  /** Ties the pieces cut from one artwork together (for grouping in the tray). */
  groupId?: string;
  /** Human hint, e.g. the source domain. */
  label?: string;
  createdAt?: string;
}

let saved: SavedSlice[] = [];
let currentOwner: string | null = null;
let syncGen = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((notify) => notify());
}
function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
function snapshot(): SavedSlice[] {
  return saved;
}

/** Reactive list of the current user's saved slices, newest first. */
export function useSavedSlices(): SavedSlice[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Add freshly-cut slices to the front of the tray (optimistic) and persist them. */
export function addSavedSlices(slices: SavedSlice[]): void {
  if (!slices.length) return;
  saved = [...slices, ...saved];
  emit();
  if (supabase) {
    void repo
      .insertSavedSlices(slices)
      .catch((e) => console.warn(`[poke-michi] slice save failed: ${(e as Error).message}`));
  }
}

/** Remove one slice from the tray (optimistic) and delete it. */
export function removeSavedSlice(id: string): void {
  const next = saved.filter((s) => s.id !== id);
  if (next === saved || next.length === saved.length) {
    if (!saved.some((s) => s.id === id)) return;
  }
  saved = next;
  emit();
  if (supabase) {
    void repo
      .deleteSavedSlice(id)
      .catch((e) => console.warn(`[poke-michi] slice delete failed: ${(e as Error).message}`));
  }
}

/**
 * Load the current owner's slices when the identity settles, and reset the tray on every identity
 * change so a previous account's slices can't be seen or re-persisted. A stale in-flight load is
 * discarded via the generation counter.
 */
export async function syncSavedSlices(ownerId: string | null): Promise<void> {
  if (ownerId === currentOwner) return;
  currentOwner = ownerId;
  const gen = ++syncGen;
  saved = [];
  emit();
  if (!supabase || !ownerId) return;
  try {
    const fetched = await repo.fetchSavedSlices();
    if (gen !== syncGen) return; // a newer sync superseded this one
    // Keep any slices saved locally while the fetch was in flight (not yet in the fetched set).
    const localOnly = saved.filter((s) => !fetched.some((f) => f.id === s.id));
    saved = [...localOnly, ...fetched];
    emit();
  } catch (e) {
    console.warn(`[poke-michi] slice load failed: ${(e as Error).message}`);
  }
}

/** Mount once inside the editor: keeps the tray synced to the signed-in (or guest) user. */
export function useSavedSlicesSync(): void {
  const { ready, user } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!ready) return;
    void syncSavedSlices(userId);
  }, [ready, userId]);
}
