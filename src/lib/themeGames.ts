/**
 * WHICH OTHER GAMES SEARCH THEIR ARTWORK — the theme-search registry, read once per session.
 *
 * The data project serves a game's artwork themes (`theme_search`, data migration 79) only while
 * its row in `public.theme_search_games` is enabled, and that row also carries the toolbar switch
 * and the type chips' labels and colours. Games go live one at a time by flipping that row, so the
 * card picker asks the registry rather than carrying a list: no per-game theme code lives here.
 *
 * FAILS CLOSED. Any error leaves the map empty, and an absent row is a locked game, exactly as
 * before this existed. A failure is retried after a cooldown, like lib/otherGame.
 *
 * The URL and key are the kit's own getters, read AT FETCH TIME: michi configures the kit once at
 * startup, and the API URL is derived there from the browse URL, so nothing on this side can know
 * it at import time (`EXPO_PUBLIC_CATALOG_API_URL` is not set in michi).
 */
import { getApiKey, getApiUrl } from 'tcgscan-browse';

import { parseRegistry, registryUrl, type ThemeGameRow } from '@/lib/themeGamesCore';

export type { ThemeGameRow, ThemeTypeGroupRow } from '@/lib/themeGamesCore';

/** After a failure, wait this long before another attempt (lib/otherGame's RETRY_MS). */
const RETRY_MS = 60_000;

let games = new Map<string, ThemeGameRow>();
let state: 'loading' | 'ready' | 'failed' = 'loading';
let load: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function bump(): void {
  listeners.forEach((l) => l());
}

function fetchRegistry(): Promise<void> {
  if (load || state === 'ready') return load ?? Promise.resolve();
  const url = getApiUrl();
  const key = getApiKey();
  if (state !== 'loading') {
    state = 'loading';
    bump();
  }
  load = (url && key ? fetch(registryUrl(url), { headers: { apikey: key } }) : Promise.reject(new Error('kit not configured')))
    .then((r) => {
      if (!r.ok) throw new Error(`registry ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then((rows) => {
      games = parseRegistry(rows);
      state = 'ready';
    })
    .catch((e: unknown) => {
      // SAID OUT LOUD (lib/otherGame learnt this): a silent failure here is every game locked
      // with nothing anywhere saying why.
      console.warn('[themeGames] registry failed:', e instanceof Error ? e.message : e);
      games = new Map();
      state = 'failed';
      retry ??= setTimeout(() => {
        retry = null;
        if (listeners.size) void fetchRegistry();
      }, RETRY_MS);
    })
    .finally(() => {
      load = null;
      bump();
    });
  return load;
}

/**
 * Subscribe for `useSyncExternalStore`. The first subscriber starts the one fetch; a subscriber
 * arriving after a failure retries once the cooldown has run (the timer also retries on its own
 * while anyone is listening).
 */
export function subscribeThemeGames(cb: () => void): () => void {
  listeners.add(cb);
  if (state === 'loading' || !retry) void fetchRegistry();
  return () => listeners.delete(cb);
}

/** One game's registry row, or undefined (unknown, not loaded yet, or the read failed). A stable
 *  reference until the registry is re-read, as a snapshot must be. */
export function themeGame(game: string): ThemeGameRow | undefined {
  return games.get(game);
}

/** Where the read stands: the picker says "checking" rather than "not available" while loading. */
export function themeGamesState(): 'loading' | 'ready' | 'failed' {
  return state;
}
