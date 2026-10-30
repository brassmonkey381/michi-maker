/**
 * WHAT THE PAGE KNEW before a web sign-in left it.
 *
 * OAuth on web is a full-page round trip, and the page that comes back knows nothing the page that
 * left knew: the URL is /auth-callback?code=<token>, so the campaign that brought the person here
 * is gone, and when the provider mints a NEW user (a guest who chose "Sign in", or whose Google
 * account already existed) the anonymous uid and its analytics session are gone with it.
 * analytics-studio (2026-10-29): three Reddit arrivals became accounts six seconds after their
 * taps and none of the three could be attributed, because the uid, the session and the campaign
 * all changed at the hop.
 *
 * So the tap writes a note, and the return reads it: the campaign params are adopted as this page
 * load's landing campaign (lib/analytics), and the guest uid and session ride on session.start and
 * account.created as `from_uid` / `from_session`, so the studio can stitch the two halves.
 *
 * sessionStorage and a ten-minute shelf life, like lib/authReturn: one tab, one round trip. Native
 * has no sessionStorage and every function is a no-op. Pure parsing lives in `parseHop` so
 * `node --test` reaches it.
 */
const KEY = 'michi.auth.hop';
export const HOP_TTL_MS = 10 * 60 * 1000;

export interface AuthHop {
  /** The uid that tapped (a guest's anonymous uid, or null when signed out). */
  uid: string | null;
  /** The analytics session that was live at the tap. */
  sessionId: string | null;
  /** The allowlisted campaign params this page load arrived with (lib/analytics CAMPAIGN_PARAMS). */
  params: Record<string, string>;
  /** The outside referrer of that page load, already trimmed to origin + path. */
  referrer: string | null;
  at: number;
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

/** Parse a stored note; null when malformed or older than the shelf life. */
export function parseHop(raw: string | null, now = Date.now()): AuthHop | null {
  if (!raw) return null;
  try {
    const n = JSON.parse(raw) as Partial<AuthHop>;
    if (typeof n.at !== 'number' || now - n.at > HOP_TTL_MS || now - n.at < 0) return null;
    const params: Record<string, string> = {};
    if (n.params && typeof n.params === 'object') {
      for (const [k, v] of Object.entries(n.params)) {
        if (typeof v === 'string' && v.length <= (k === 'rdt_cid' ? 128 : 64) && /^[a-z0-9_]{1,32}$/i.test(k)) params[k] = v;
      }
    }
    return {
      uid: typeof n.uid === 'string' ? n.uid : null,
      sessionId: typeof n.sessionId === 'string' ? n.sessionId : null,
      params,
      referrer: typeof n.referrer === 'string' ? n.referrer.slice(0, 200) : null,
      at: n.at,
    };
  } catch {
    return null;
  }
}

/** Written by the auth store right before the browser leaves for the provider. */
export function rememberAuthHop(hop: Omit<AuthHop, 'at'>): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify({ ...hop, at: Date.now() } satisfies AuthHop));
  } catch {
    // a bookkeeping write must never break a sign-in
  }
}

/** Read without clearing: analytics adopts it at module load, the auth store stamps it on the return. */
export function readAuthHop(): AuthHop | null {
  const s = storage();
  if (!s) return null;
  try {
    return parseHop(s.getItem(KEY));
  } catch {
    return null;
  }
}

export function forgetAuthHop(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // ignore
  }
}
