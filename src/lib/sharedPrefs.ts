/**
 * MIC-072: ONE COPY OF EACH SETTING FOR THE WHOLE APP.
 *
 * `useViewPrefs` and `useCardLabelPrefs` each kept "what you just chose" in their own component
 * state. Every screen that called them had a private copy, so turning Owned on in a binder did not
 * reach My Binders until a reload, and a binder opened after a change on My Binders read the account
 * copy from a profile loaded before the change. This module holds the one in-memory copy, per key and
 * per account, and every hook instance reads it through useSyncExternalStore.
 *
 * It also fixes the account writes clobbering each other. Each writer spread the profile's
 * `preferences` as loaded at sign-in and added its own key, so turning Owned on and then Prices on
 * wrote the labels with the OLD view bag inside, and the second write undid the first. Writes now
 * merge every key written this session over the loaded bag, and go out one at a time, so the row
 * always ends with every choice in it.
 */
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

// The in-memory copy and its hook live in editedPrefs (MIC-077: testable under the React Compiler).
export { setEditedPref, useEditedPref } from './editedPrefs';

/** Per account: every preference key written this session, and the write chain. */
const written = new Map<string, Record<string, unknown>>();
const chain = new Map<string, Promise<unknown>>();

/**
 * Save `bag` under `key` in `profiles.preferences`. Real accounts only (an anonymous session's
 * profile is thrown away with it). FAIL-SOFT: a lost write costs a re-tapped chip.
 */
export function saveAccountPref(
  user: { id: string; is_anonymous?: boolean } | null | undefined,
  loaded: unknown,
  key: string,
  bag: unknown,
): void {
  if (!supabase || !user || user.is_anonymous) return;
  const client = supabase;
  const mine = { ...(written.get(user.id) ?? {}), [key]: bag };
  written.set(user.id, mine);
  const base = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? (loaded as Record<string, unknown>) : {};
  const merged = { ...base, ...mine } as Json;
  const prev = chain.get(user.id) ?? Promise.resolve();
  const next = prev.then(
    () => client.from('profiles').update({ preferences: merged }).eq('id', user.id).then(() => {}, () => {}),
    () => {},
  );
  chain.set(user.id, next);
}
