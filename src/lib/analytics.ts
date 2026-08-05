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
import { Platform } from 'react-native';

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

/** The active app-open session row id, created lazily on first use. */
let sessionId: string | null = null;
/** In-flight session creation, so concurrent tracks share one insert. */
let starting: Promise<string | null> | null = null;
/** Timestamp (ms) of the last `last_seen_at` write, for throttling. */
let lastSeenAt = 0;

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
      // Persist so a web reload reuses this session (no-op on native).
      writeStoredSession({ id: sessionId, userId: user.id, lastSeen: Date.now() });
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
 * Record an event. Fire-and-forget: returns immediately, does the work on a floating promise,
 * and swallows every error. Skips silently when there's no backend or no auth user yet.
 */
export function track(name: string, props?: Record<string, unknown>): void {
  try {
    if (!supabase || !cachedUser) return;
    void (async () => {
      try {
        const sid = await ensureSession();
        await supabase!
          .from('analytics_events')
          .insert({ app: APP, name, props: (props ?? {}) as Json, session_id: sid });
        if (sid) void touchSession(sid);
      } catch {
        // swallow — analytics failures must never surface
      }
    })();
  } catch {
    // swallow — even the synchronous setup must not throw
  }
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
 * updates the live session's is_guest in place.
 */
export function resetSessionUser(
  user: { id: string; is_anonymous?: boolean; email?: string | null } | null,
): void {
  if (!user) {
    cachedUser = null;
    return;
  }
  const isGuest = guestOf(user);
  const prev = cachedUser;
  cachedUser = { id: user.id, isGuest };

  if (prev && prev.id !== user.id) {
    // A genuinely different account — drop the old session (in-memory AND the persisted web entry)
    // so the next event mints a new session row and a fresh session.start.
    sessionId = null;
    starting = null;
    lastSeenAt = 0;
    clearStoredSession();
  } else if (prev && prev.id === user.id && prev.isGuest !== isGuest && sessionId) {
    // Same uid, guest upgraded to a real account: reflect it on the existing session row.
    void (async () => {
      try {
        await supabase?.from('analytics_sessions').update({ is_guest: isGuest }).eq('id', sessionId!);
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
  lastSeenAt = 0;
  clearStoredSession();
}
