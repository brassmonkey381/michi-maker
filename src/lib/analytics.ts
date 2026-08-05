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
    // A genuinely different account — drop the old session so the next event mints a new one.
    sessionId = null;
    starting = null;
    lastSeenAt = 0;
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
}
