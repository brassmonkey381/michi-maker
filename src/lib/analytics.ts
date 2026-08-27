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

/** Shape of the persisted web session entry. `code` carries the landing campaign code across a
 *  reload so a signup after a refresh still attributes (see CAMPAIGN_PARAMS below). */
type StoredSession = { id: string; userId: string; lastSeen: number; code?: string };

/**
 * Durable device id (see ../tcgscan repo root: ANALYTICS-GUEST-DEVICE-ID.md). A RANDOM, OPAQUE
 * UUID minted once on first use and never regenerated — deliberately derived from nothing about
 * the device (no hardware, IP, or UA), so it is a coincidence key, not a fingerprint. It survives
 * reloads, sign-outs and guest upgrades; it dies only with the storage that holds it (cleared
 * site data / reinstall), which is exactly the churn it exists to measure. Web: localStorage —
 * NOT sessionStorage, which dies with the tab. Native: AsyncStorage. Distinct from StoredSession
 * by design: never expires, never scoped to a userId, never cleared on sign-out or in endSession.
 */
const DEVICE_STORAGE_KEY = 'mm_analytics_device';

/** Resolved device id: undefined = not yet resolved, null = storage unavailable. */
let deviceId: string | null | undefined;

/** A v4 UUID. crypto.randomUUID is absent on Hermes; fall back to getRandomValues, then
 *  Math.random — this is a coincidence key, not a security boundary. */
function uuidv4(): string {
  const c = globalThis.crypto as
    | { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array }
    | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h
    .slice(8, 10)
    .join('')}-${h.slice(10, 16).join('')}`;
}

/** Read-or-mint the device id. Returns null when storage is unavailable — a storage failure must
 *  never cost the session row. Never throws. */
async function getDeviceId(): Promise<string | null> {
  if (deviceId !== undefined) return deviceId;
  try {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') return (deviceId = null);
      const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (existing) return (deviceId = existing);
      const minted = uuidv4();
      localStorage.setItem(DEVICE_STORAGE_KEY, minted);
      return (deviceId = minted);
    }
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const existing = await AsyncStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing) return (deviceId = existing);
    const minted = uuidv4();
    await AsyncStorage.setItem(DEVICE_STORAGE_KEY, minted);
    return (deviceId = minted);
  } catch {
    return (deviceId = null);
  }
}

/**
 * Print/QR campaign attribution (the analytics studio's
 * requests/2026-08-14-print-campaign-attribution.md). STRICT allowlist: only these self-chosen
 * params ever reach the database, so an arbitrary third-party parameter can never ride in. This
 * is the narrow campaign-code carve-out — general referrer capture stays deferred
 * (config/events.json → gaps.referrer in the studio).
 */
const CAMPAIGN_PARAMS = ['code', 'utm_source', 'utm_medium', 'utm_campaign'] as const;

/**
 * Parsed ONCE at module load (web only): the only moment the URL is guaranteed to still be the
 * printed URL — expo-router strips the query from usePathname(), and by the first page.view the
 * SPA may already have navigated. `suffix` is the sanitized query for landing_route; `code` rides
 * on account.created.
 */
const landingCampaign = (() => {
  try {
    if (typeof window === 'undefined' || !window.location?.search) return null;
    const q = new URLSearchParams(window.location.search);
    const kept = new URLSearchParams();
    for (const k of CAMPAIGN_PARAMS) {
      const v = q.get(k);
      if (v && v.length <= 64) kept.append(k, v); // printed codes are short; anything huge is not ours
    }
    const s = kept.toString();
    return s ? { suffix: `?${s}`, code: kept.get('code') } : null;
  } catch {
    return null; // never throw at module load
  }
})();

/** The campaign code a signup attributes to: this page load's landing code, or one persisted with
 *  the reused web session (a reload loses the query string but must not lose the attribution). */
let campaignCode: string | null = landingCampaign?.code ?? null;

/** The current auth identity, mirrored from the auth store via resetSessionUser(). */
let cachedUser: { id: string; isGuest: boolean } | null = null;
/** Has ANY identity ever been cached this page load? Distinguishes "signed out" (wipe the
 *  buffer) from "bootstrap settled before the guest was minted" (keep it — see resetSessionUser). */
let everHadIdentity = false;

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
        // A fresh landing code wins; else inherit the one persisted with the session, so a signup
        // after a reload still attributes to the QR scan that started the visit.
        campaignCode = landingCampaign?.code ?? stored.code ?? null;
        writeStoredSession({ ...stored, lastSeen: Date.now(), ...(campaignCode ? { code: campaignCode } : {}) });
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
          // Session-level, set on insert only (never on the reuse path — the row already has it).
          device_id: await getDeviceId(),
          ...(appVersion ? { app_version: appVersion } : {}),
        })
        .select('id')
        .single();
      if (error || !data) return null;
      sessionId = data.id;
      landingRouteRecorded = false; // a brand-new session captures its own first page.view
      // Persist so a web reload reuses this session (no-op on native), carrying the campaign code.
      writeStoredSession({
        id: sessionId,
        userId: user.id,
        lastSeen: Date.now(),
        ...(campaignCode ? { code: campaignCode } : {}),
      });
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
  // The landing URL's allowlisted campaign query (if any) rides into landing_route, so a printed
  // QR scan is distinguishable from someone typing the URL. No params → no suffix, unchanged.
  const landing = landingCampaign ? `${route}${landingCampaign.suffix}` : route;
  void (async () => {
    try {
      await supabase?.from('analytics_sessions').update({ landing_route: landing }).eq('id', id).is('landing_route', null);
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
 * Where a gate was shown. A FIXED enum, never free text and never a route string — the studio
 * segments on it, so a new value is a deliberate contract change. Deliberately the union across
 * BOTH apps (michi uses the binder surfaces, tcgscan the collection/scan ones) so the two
 * emitters stay the near-identical mirrors AGENTS.md requires. Values shared with TrialCta's
 * `surface` ('plans', 'print_gate') must keep spelling exactly, or the funnel stops joining.
 */
export type CapSurface =
  | 'home'
  | 'browse'
  | 'my_binders'
  | 'binder_editor'
  | 'build_wizard'
  | 'slice_studio'
  | 'print_gate'
  | 'plans'
  | 'collection_list'
  | 'add_to_collection'
  | 'scan_quota'
  /** A cap met during a live scan / auto-add run, as opposed to the manual add sheet. */
  | 'scan'
  /** The server refused an attempt, as opposed to the client warning someone they're at the cap.
   *  Kept distinct so the two can never double-count one impression. */
  | 'scan_quota_refused';

/**
 * A cap-gate impression: the moment a plan limit was actually SHOWN to the user, not merely
 * computed. Hitting a wall is the highest-intent moment the product has, and it was the one moment
 * the stream could not see (ANALYTICS-CAP-GATES.md).
 *
 * `limit` MUST be the tier_caps limit_key verbatim ('binders', 'pagesPerBinder', 'artUploads', …)
 * — the studio joins on it directly, and a prettier name means a lookup table that will drift.
 * `surface` is a fixed enum chosen at the call site (see CapSurface), never a route string; where a
 * gate also renders TrialCta, pass the SAME string so the gate→offer→trial funnel is a join.
 *
 * `tier` is stamped HERE, at the moment of the gate, rather than inferred later: tier is read from
 * the entitlements ledger as of now, so a user who upgrades next week would be retro-labelled and
 * their guest-era gate would silently move funnels.
 */
export function trackCapGate(input: {
  limit: string;
  surface: CapSurface;
  tier: string;
  /** Their count at the moment of the gate. */
  used: number;
  /** The limit they hit. */
  cap: number;
  /**
   * How it was shown. A wall opens a dialog on its first hit of the day and toasts after that
   * (src/lib/capPromptPacing.ts), and the two are not the same impression: one stops the user and
   * one can be missed entirely. Without this the change that introduced the dialog could never be
   * judged. Absent on events recorded before 2026-08-27.
   */
  as?: 'dialog' | 'toast';
}): void {
  track('cap.gate_shown', { ...input, used: capCount(input.used), cap: capCount(input.cap) });
}

/** The user backed out of a gate without acting. Pairs with trackCapGate on {limit, surface}. */
export function trackCapGateDismissed(limit: string, surface: CapSurface): void {
  track('cap.gate_dismissed', { limit, surface });
}

/**
 * Counts are Infinity for an unlimited tier (and for every tier when LIMITS_ENFORCED is off).
 * JSON.stringify(Infinity) is `null`, which would land in props indistinguishable from "not
 * captured" — so unlimited becomes an explicit -1 sentinel. In practice a gate cannot fire on an
 * unlimited cap; this exists so a future one can't silently write nulls.
 */
function capCount(n: number): number {
  return Number.isFinite(n) ? n : -1;
}

/**
 * Insert one event now. `ts` overrides the server `now()` default so a buffered event keeps the
 * time it actually happened. Assumes an identity is present. Fire-and-forget; never throws.
 */
function emit(name: string, props?: Record<string, unknown>, ts?: string): void {
  // A signup carries its campaign attribution. Merged HERE, centrally, so every account.created
  // call site (password / oauth / guest_upgrade) attributes without repeating it — and an explicit
  // `code` prop from a call site still wins.
  if (name === 'account.created' && campaignCode && !(props && 'code' in props)) {
    props = { ...props, code: campaignCode };
  }
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
    // Wipe the buffer ONLY when an identity existed to sign out of. For a brand-new visitor the
    // bootstrap settles signed-out (INITIAL_SESSION null) BEFORE the guest is minted, and wiping
    // here deleted the landing page.view of every first-time visitor — with it landing_route and
    // the QR campaign code, i.e. the one event campaign attribution exists for. Found live: two
    // fresh-context scans wrote session.start and nothing else.
    if (everHadIdentity) {
      pending = []; // a buffered event never outlives the sign-out that cleared its identity
      droppedPending = 0;
    }
    return;
  }
  everHadIdentity = true;
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
  // Same guard as resetSessionUser(null): the auth store calls endSession on the signed-out
  // bootstrap path too, and a fresh visitor's buffered landing must survive until their guest
  // identity arrives moments later.
  if (everHadIdentity) {
    pending = [];
    droppedPending = 0;
  }
  lastSeenAt = 0;
  landingRouteRecorded = false;
  accessToken = null;
  unbindLifecycleListeners();
  clearStoredSession();
}
