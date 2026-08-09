/**
 * First-party in-app analytics emitter (michi-maker side).
 *
 * A tiny, fire-and-forget `track()` plus in-memory session management. Everything here is
 * best-effort and swallows its own errors: analytics must NEVER block the UI or throw into the
 * app. When Supabase isn't configured, or no auth user exists yet, events are skipped gracefully.
 *
 * The database contract (see supabase/migrations/20260805100000_analytics_events.sql):
 *   - `analytics_sessions` — one row per app-open. RLS: own insert/select/update.
 *   - `analytics_events`   — append-only. RLS: own insert/select. `user_id` and `ts` default
 *     server-side (auth.uid() / now()), so the client sends only { app, name, props, session_id }.
 *
 * NO PII: only ids and counts belong in props — never emails, tokens, or full card lists.
 */
import Constants from 'expo-constants';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { supabasePublishableKey, supabaseUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

/** This app always reports as 'michi' (tcgscan-app shares the same tables under 'tcgscan'). */
const APP = 'michi' as const;

/** Throttle window for opportunistic session `last_seen_at` touches. */
const LAST_SEEN_THROTTLE_MS = 60_000;

/**
 * Web-only: where the active session is persisted across full page loads, so a browser reload
 * reuses the same session instead of minting a new row (native keeps the in-memory session, which
 * already survives because the RN process persists).
 */
const SESSION_STORAGE_KEY = 'mm_analytics_session';
/** Reuse a persisted web session only if its last activity was within this idle window. */
const IDLE_MS = 30 * 60 * 1000;

/** Shape of the persisted web session entry. */
type StoredSession = { id: string; userId: string; lastSeen: number };

/** The current auth identity, mirrored from the auth store via resetSessionUser(). */
let cachedUser: { id: string; isGuest: boolean } | null = null;

/**
 * Events that arrived before the identity did. supabase-js can hold a valid session for seconds
 * before the auth store calls resetSessionUser(), and track() used to DROP everything in that
 * window silently — which is how a real trial.start never reached the stream. Buffer instead, then
 * flush in resetSessionUser() with each event's original time. Bounded; oldest dropped on overflow.
 */
const PENDING_MAX = 20;
let pending: { name: string; props?: Record<string, unknown>; at: string }[] = [];
/** Events dropped on overflow since the last flush — surfaced once in dev so the loss isn't silent. */
let droppedPending = 0;

/** The active app-open session row id, created lazily on first use. */
let sessionId: string | null = null;
/** In-flight session creation, so concurrent tracks share one insert. */
let starting: Promise<string | null> | null = null;
/** Timestamp (ms) of the last `last_seen_at` write, for throttling. */
let lastSeenAt = 0;
/** Have we already recorded this session's landing_route (its first page.view)? Once per session. */
let landingRouteRecorded = false;
/** Cached access token for the web `pagehide` keepalive PATCH (a supabase-js call is often
 *  cancelled during unload). Refreshed on every auth change; null when signed out / unknown. */
let accessToken: string | null = null;
/** Whether the app-lifecycle listeners (visibility/pagehide on web, AppState on native) are bound. */
let listenersBound = false;
/** Teardown for the web listeners; null when unbound or off web. */
let webUnbind: (() => void) | null = null;
/** Native AppState subscription; null when unbound or off native. */
let appStateSub: { remove: () => void } | null = null;

/** Is this Supabase user an anonymous guest? Prefer the flag, fall back to the missing email. */
function guestOf(user: { is_anonymous?: boolean; email?: string | null }): boolean {
  return user.is_anonymous ?? !user.email;
}

/** Web sessionStorage, or null when unavailable (native, SSR prerender, or a privacy mode that
 *  throws on access). All persistence helpers below no-op when this returns null. Never throws. */
function webStore(): Storage | null {
  try {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    // access itself can throw under strict privacy settings — treat as unavailable
  }
  return null;
}

/** Read the persisted web session, or null if absent/unavailable/malformed. Never throws. */
function readStoredSession(): StoredSession | null {
  const store = webStore();
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.userId === 'string' &&
      typeof parsed.lastSeen === 'number'
    ) {
      return parsed;
    }
  } catch {
    // ignore malformed / unreadable entries
  }
  return null;
}

/** Persist the web session entry. No-op off web. Never throws. */
function writeStoredSession(entry: StoredSession): void {
  const store = webStore();
  if (!store) return;
  try {
    store.setItem(SESSION_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // swallow — never throw out of analytics
  }
}

/** Forget the persisted web session (sign-out, or a different user in the same tab). Never throws. */
function clearStoredSession(): void {
  const store = webStore();
  if (!store) return;
  try {
    store.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // swallow
  }
}

/** Bump `lastSeen` on the persisted web session so the reload-reuse window tracks real activity. */
function touchStoredSession(): void {
  const entry = readStoredSession();
  if (!entry) return;
  writeStoredSession({ ...entry, lastSeen: Date.now() });
}

/**
 * Create the session row for the current user (once). Returns its id, or null if it can't be
 * made (no backend, no user, or the insert failed). Never throws.
 */
async function ensureSession(): Promise<string | null> {
  if (!supabase || !cachedUser) return null;
  if (sessionId) return sessionId;
  if (starting) return starting;

  const user = cachedUser;
  starting = (async () => {
    try {
      // Web reload-reuse: if a persisted session belongs to this same user and was active within
      // the idle window, adopt it rather than minting a new row. A page refresh keeps ONE session
      // (and does NOT re-emit session.start). Native never has a stored entry, so it falls through.
      const stored = readStoredSession();
      if (stored && stored.userId === user.id && Date.now() - stored.lastSeen < IDLE_MS) {
        sessionId = stored.id;
        writeStoredSession({ ...stored, lastSeen: Date.now() });
        bindLifecycleListeners(); // flush last_seen_at when this reused session's app goes away
        return sessionId;
      }

      // app_version is a nice-to-have; omit the key entirely when Constants doesn't expose it.
      const appVersion = Constants.expoConfig?.version;
      const { data, error } = await supabase!
        .from('analytics_sessions')
        .insert({
          app: APP,
          is_guest: user.isGuest,
          platform: Platform.OS,
          ...(appVersion ? { app_version: appVersion } : {}),
        })
        .select('id')
        .single();
      if (error || !data) return null;
      sessionId = data.id;
      landingRouteRecorded = false; // a brand-new session captures its own first page.view
      // Persist so a web reload reuses this session (no-op on native).
      writeStoredSession({ id: sessionId, userId: user.id, lastSeen: Date.now() });
      bindLifecycleListeners(); // flush last_seen_at when this session's app goes away
      // The emitter owns session.start now: emit it EXACTLY ONCE, here, when a brand-new session
      // row is created (never on reuse). Insert directly rather than via track(), which would
      // recurse back through ensureSession.
      try {
        await supabase!
          .from('analytics_events')
          .insert({
            app: APP,
            name: 'session.start',
            props: { is_guest: user.isGuest } as Json,
            session_id: sessionId,
          });
      } catch {
        // swallow — a missed session.start must never surface
      }
      return sessionId;
    } catch {
      return null;
    } finally {
      starting = null;
    }
  })();
  return starting;
}

/** Best-effort, throttled `last_seen_at` bump so a session's tail reflects real activity. */
async function touchSession(id: string): Promise<void> {
  if (!supabase) return;
  const now = Date.now();
  if (now - lastSeenAt < LAST_SEEN_THROTTLE_MS) return;
  lastSeenAt = now;
  touchStoredSession(); // keep the web reload-reuse window fresh (no-op on native)
  try {
    await supabase.from('analytics_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', id);
  } catch {
    // swallow — a missed heartbeat is harmless
  }
}

/**
 * Cache the current access token for the `pagehide` keepalive PATCH. Refreshed on every auth
 * change (resetSessionUser). Fire-and-forget; never throws.
 */
function refreshAccessToken(): void {
  try {
    void supabase?.auth
      .getSession()
      .then(({ data }) => {
        accessToken = data.session?.access_token ?? null;
      })
      .catch(() => {
        // swallow — a stale/absent token just means the beacon falls back to the client call
      });
  } catch {
    // swallow
  }
}

/**
 * Force `last_seen_at = now` for the live session, bypassing LAST_SEEN_THROTTLE_MS. No-op when
 * there's no session or backend. Fire-and-forget; never throws. Called when the app goes away
 * (tab hidden / native background) so a session's tail reflects real time-in-app, not the last
 * tracked action.
 */
export function flushLastSeen(): void {
  try {
    const id = sessionId;
    if (!supabase || !id) return;
    lastSeenAt = Date.now(); // count as a heartbeat so a following throttled touch doesn't double-write
    touchStoredSession(); // keep the web reload-reuse window fresh (no-op on native)
    // MUST be awaited, even though we discard the result. A PostgrestFilterBuilder is a lazy
    // thenable: it only issues its HTTP request when something calls .then(). `void builder`
    // never does, so the write silently never happens. See recordLandingRoute for the bug this
    // caused there.
    void (async () => {
      try {
        await supabase!.from('analytics_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', id);
      } catch {
        // swallow — a missed flush is harmless
      }
    })();
  } catch {
    // swallow — a missed flush is harmless
  }
}

/**
 * `pagehide`-only flush. A normal supabase-js call is usually cancelled as the page unloads, so
 * prefer a keepalive fetch straight at PostgREST with the cached access token; fall back to the
 * client call when no token (or no fetch) is available. Never throws.
 */
function flushLastSeenBeacon(): void {
  try {
    const id = sessionId;
    if (!id) return;
    if (typeof fetch === 'function' && supabaseUrl && supabasePublishableKey && accessToken) {
      void fetch(`${supabaseUrl}/rest/v1/analytics_sessions?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        keepalive: true,
        headers: {
          apikey: supabasePublishableKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
      }).catch(() => {
        // swallow — best effort on unload
      });
      return;
    }
    // No cached token / no fetch: the client call may still be cancelled, but it's the best we have.
    flushLastSeen();
  } catch {
    // swallow — never throw out of an unload handler
  }
}

/**
 * Record this session's landing_route from its FIRST page.view, exactly once. The `.is(null)`
 * filter makes it idempotent across a web reload (which reuses the row) so it never overwrites the
 * real entry point. Fire-and-forget; never throws.
 *
 * The update MUST be awaited even though nothing reads the result. supabase-js returns a
 * PostgrestFilterBuilder, which is a LAZY thenable — it only issues its HTTP request when
 * something calls .then() on it. `void builder` builds the query and drops it on the floor, so
 * the request is never sent and nothing errors, because there is nothing to error. That is
 * exactly what happened: landing_route was null on all 91 sessions while last_seen_at (written
 * through an awaited call in touchSession) updated normally.
 *
 * The flag is set BEFORE the await deliberately, so two page.views racing on the same tick
 * cannot both fire. A lost write here is preferable to overwriting a real entry point.
 */
function recordLandingRoute(id: string, route: unknown): void {
  if (landingRouteRecorded) return;
  if (typeof route !== 'string' || !route) return;
  landingRouteRecorded = true;
  void (async () => {
    try {
      await supabase?.from('analytics_sessions').update({ landing_route: route }).eq('id', id).is('landing_route', null);
    } catch {
      // swallow — a missed landing route is harmless
    }
  })();
}

/**
 * Bind the app-lifecycle listeners that flush `last_seen_at` when the app goes away. Web gets
 * `visibilitychange` (the reliable one mobile browsers fire before freezing a tab) plus `pagehide`
 * (best-effort on real navigation away); native gets AppState background/inactive. Bound once when
 * the session is created, torn down in endSession(). Guarded and never throws.
 */
function bindLifecycleListeners(): void {
  if (listenersBound) return;
  try {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const onVisibility = () => {
        try {
          if (document.visibilityState === 'hidden') flushLastSeen();
        } catch {
          // swallow — a listener must never throw
        }
      };
      const onPageHide = () => {
        try {
          flushLastSeenBeacon();
        } catch {
          // swallow
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onPageHide);
      webUnbind = () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
      };
      listenersBound = true;
    } else {
      appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
        try {
          if (state === 'background' || state === 'inactive') flushLastSeen();
        } catch {
          // swallow — a listener must never throw
        }
      });
      listenersBound = true;
    }
  } catch {
    // swallow — a failed bind must never surface
  }
}

/** Remove the lifecycle listeners bound by bindLifecycleListeners(). Never throws. */
function unbindLifecycleListeners(): void {
  try {
    webUnbind?.();
  } catch {
    // swallow
  }
  try {
    appStateSub?.remove();
  } catch {
    // swallow
  }
  webUnbind = null;
  appStateSub = null;
  listenersBound = false;
}

/**
 * Record an event. Fire-and-forget: returns immediately, does the work on a floating promise,
 * and swallows every error. Skips silently when there's no backend or no auth user yet.
 */
export function track(name: string, props?: Record<string, unknown>): void {
  try {
    if (!supabase) return;
    if (!cachedUser) {
      // No identity yet. Buffer rather than drop (the trial.start hole), keeping the real time so a
      // later flush can't reorder the funnel by stamping everything now().
      pending.push({ name, props, at: new Date().toISOString() });
      if (pending.length > PENDING_MAX) {
        pending.shift();
        droppedPending += 1;
        if (__DEV__) console.warn(`[analytics] event buffer full, dropped oldest (${droppedPending} since last flush)`);
      }
      return;
    }
    emit(name, props);
  } catch {
    // swallow — even the synchronous setup must not throw
  }
}

/**
 * Insert one event now. `ts` overrides the server `now()` default so a buffered event keeps the
 * time it actually happened. Assumes an identity is present. Fire-and-forget; never throws.
 */
function emit(name: string, props?: Record<string, unknown>, ts?: string): void {
  void (async () => {
    try {
      const sid = await ensureSession();
      // `ts` is undefined for live events (supabase-js omits it, so the server default now() wins)
      // and set only for a buffered event being flushed, to keep the time it actually happened.
      await supabase!
        .from('analytics_events')
        .insert({ app: APP, name, props: (props ?? {}) as Json, session_id: sid, ts });
      if (sid) {
        // The first page.view of the session backfills landing_route (once, cheaply).
        if (name === 'page.view') recordLandingRoute(sid, props?.route);
        void touchSession(sid);
      }
    } catch {
      // swallow — analytics failures must never surface
    }
  })();
}

/**
 * Ensure a session exists for the current user. The auth store calls this on cold-start /
 * session bootstrap; idempotent, so extra calls are no-ops.
 */
export function startSession(): void {
  void ensureSession();
}

/**
 * Point the emitter at a new (or cleared) auth identity. Called by the auth store on every auth
 * change. A different uid starts a fresh session on next use; a same-uid guest→account upgrade
 * records the transition on the live session's `upgraded_at` (is_guest is immutable — it means
 * "this session STARTED anonymous").
 */
export function resetSessionUser(
  user: { id: string; is_anonymous?: boolean; email?: string | null } | null,
): void {
  if (!user) {
    cachedUser = null;
    pending = []; // a buffered event never outlives the sign-out that cleared its identity
    droppedPending = 0;
    return;
  }
  const isGuest = guestOf(user);
  const prev = cachedUser;
  cachedUser = { id: user.id, isGuest };
  refreshAccessToken(); // keep the pagehide-beacon token in step with the current identity

  // Drain events that arrived before this identity landed (see track()'s buffer), keeping each
  // event's captured time so the funnel order is preserved.
  if (pending.length) {
    const drained = pending;
    pending = [];
    droppedPending = 0;
    for (const e of drained) emit(e.name, e.props, e.at);
  }

  if (prev && prev.id !== user.id) {
    // A genuinely different account — drop the old session (in-memory AND the persisted web entry)
    // so the next event mints a new session row and a fresh session.start.
    sessionId = null;
    starting = null;
    lastSeenAt = 0;
    landingRouteRecorded = false;
    clearStoredSession();
  } else if (prev && prev.id === user.id && prev.isGuest !== isGuest && sessionId) {
    // Same uid, a guest upgraded to a real account in place. is_guest is IMMUTABLE (it records that
    // this session started anonymous); stamp the transition on upgraded_at instead of overwriting
    // it. cachedUser above already reflects the new reality, so a later NEW session's session.start
    // props are still correct.
    void (async () => {
      try {
        await supabase?.from('analytics_sessions').update({ upgraded_at: new Date().toISOString() }).eq('id', sessionId!);
      } catch {
        // swallow
      }
    })();
  }
}

/** Forget the current session and user (e.g. on sign-out). The next user starts fresh. */
export function endSession(): void {
  sessionId = null;
  starting = null;
  cachedUser = null;
  pending = [];
  droppedPending = 0;
  lastSeenAt = 0;
  landingRouteRecorded = false;
  accessToken = null;
  unbindLifecycleListeners();
  clearStoredSession();
}
