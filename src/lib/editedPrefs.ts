/**
 * MIC-072 / MIC-077: "what you just chose", one copy per setting for the whole app.
 *
 * Kept apart from sharedPrefs (which imports the Supabase client) so the test can compile this file
 * with the React Compiler and render the hook.
 *
 * MIC-077: THE SNAPSHOT IS THE VALUE. The first version subscribed with a version counter, threw
 * the counter away and read the Map afterwards. The React Compiler (on in app.json) memoizes that
 * read on `key` alone, so every hook kept the value from its first render: a tap wrote the new
 * setting, the chip re-rendered and showed the old one. Every view chip looked dead on the live
 * site. Returning the entry from getSnapshot makes the read part of the store, which the compiler
 * never caches. Each write stores a new entry object, so the snapshot changes exactly when it should.
 */
import { useCallback, useSyncExternalStore } from 'react';

type Entry = { userId: string | null; value: unknown };

const edited = new Map<string, Entry>();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** What this account last chose for `key` in this session, or null. Re-renders on any change. */
export function useEditedPref<T>(key: string, userId: string | null): T | null {
  const read = useCallback(() => edited.get(key), [key]);
  const e = useSyncExternalStore(subscribe, read, read);
  return e && e.userId === userId ? (e.value as T) : null;
}

export function setEditedPref(key: string, userId: string | null, value: unknown): void {
  edited.set(key, { userId, value });
  for (const fn of listeners) fn();
}
