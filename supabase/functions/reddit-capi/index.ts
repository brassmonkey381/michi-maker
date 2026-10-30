/**
 * reddit-capi — sends ONE Reddit Conversions API `SignUp` for the CALLER's own new account.
 *
 *  POST { click_id?: string, event_at?: string } → { ok: true, sent: boolean, status?: number }
 *
 * WHY (owner, 2026-10-30, via analytics-studio). The browser pixel (src/lib/redditPixel.ts) sends
 * SignUp on account.created, and Events Manager showed it landing for about five sign-ups in six:
 * blockers and the Reddit webview eat the rest. This is the same SignUp from the server, with the
 * SAME conversion_id (the uid), so Reddit dedupes the pair and the sixth one counts.
 *
 * ONCE PER ACCOUNT, enforced here rather than trusted from the client: the row in
 * public.reddit_conversions is inserted FIRST (primary key user_id + event_type) and the post to
 * Reddit happens only when that insert landed. The client is deliberately liberal (it calls on
 * every fresh sign-in, see src/lib/redditCapi.ts) and this makes that safe. A guest upgrade keeps
 * its uid, so it counts once, like the pixel.
 *
 * WHAT IS SENT. event_type SignUp, event_at (the client's, else now), click_id (the rdt_cid the
 * landing page captured, when there was one), user { ip_address, user_agent, external_id } from
 * THIS request (the account was just created from it), event_metadata { conversion_id }.
 * ip_address, external_id AND conversion_id are SHA-256 hex, as Reddit asks of the API: the pixel
 * sends the raw uid as its conversion_id and Reddit normalises the two for the dedupe (Segment's
 * destination hashes it the same way; analytics-studio checked, 2026-10-30). The email hash is sent ONLY when
 * REDDIT_CAPI_HASH_EMAIL=1 (default off: michi has no consent banner; the owner decides).
 *
 * FIRE AND FORGET. One retry on a network error, a 429 or a 5xx; a Reddit outage answers
 * { ok: true, sent: false } and the account is untouched. One log line per call with the uid and
 * Reddit's status, never the token, never the email.
 *
 * Auth: JWT verification is ON. The user is resolved from the caller's own token; anonymous
 * (guest) sessions are refused.
 *
 * Secrets (supabase secrets set): REDDIT_CAPI_TOKEN (the Conversions API access token from Events
 * Manager; the owner stores it himself), REDDIT_PIXEL_ID (the pixel/account id the API posts
 * under, the same value as EXPO_PUBLIC_REDDIT_PIXEL_ID), SUPABASE_SECRET_KEY (or the legacy
 * SUPABASE_SERVICE_ROLE_KEY, see _shared/keys.ts). Optional: REDDIT_CAPI_HASH_EMAIL=1,
 * REDDIT_CAPI_TEST_MODE=1 (Reddit's test_mode flag: validated, not attributed).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { publishableKey, secretKey } from '../_shared/keys.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The client's address as the edge sees it: the first hop of x-forwarded-for. */
function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  const first = fwd?.split(',')[0]?.trim();
  return first || req.headers.get('cf-connecting-ip') || null;
}

/** A click id as Reddit mints them: short, URL-safe. Anything else is dropped, never forwarded. */
const CLICK_ID = /^[A-Za-z0-9_-]{4,128}$/;

/** POST once, and once more on the failures a retry can fix. */
async function post(url: string, token: string, body: unknown): Promise<number> {
  let last = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'michi-maker reddit-capi/1' },
        body: JSON.stringify(body),
      });
      last = res.status;
      if (res.ok || (res.status < 500 && res.status !== 429)) return last;
    } catch {
      last = 0;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return last;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const token = Deno.env.get('REDDIT_CAPI_TOKEN');
  const pixelId = Deno.env.get('REDDIT_PIXEL_ID');
  let serviceKey: string;
  try {
    serviceKey = secretKey();
  } catch {
    return json({ error: 'server_misconfigured' }, 500);
  }
  if (!url) return json({ error: 'server_misconfigured' }, 500);

  // 1. Who is calling? From THEIR token, never the body. Guests have no sign-up to report.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, publishableKey(), { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ error: 'unauthorized' }, 401);
  if (user.is_anonymous) return json({ error: 'guest_account' }, 400);

  // Not configured is not an error for the caller: the pixel still runs, nothing else changes.
  if (!token || !pixelId) {
    console.log(`reddit-capi uid=${user.id} skipped=unconfigured`);
    return json({ ok: true, sent: false });
  }

  // 2. The once-per-account guard, BEFORE the post.
  let body: { click_id?: unknown; event_at?: unknown } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }
  const clickId = typeof body.click_id === 'string' && CLICK_ID.test(body.click_id) ? body.click_id : null;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: claimed, error: claimErr } = await admin
    .from('reddit_conversions')
    .upsert({ user_id: user.id, event_type: 'SignUp', had_click_id: !!clickId }, { onConflict: 'user_id,event_type', ignoreDuplicates: true })
    .select('user_id')
    .maybeSingle();
  if (claimErr) {
    console.log(`reddit-capi uid=${user.id} claim_error=${claimErr.code ?? claimErr.message}`);
    return json({ ok: true, sent: false });
  }
  if (!claimed) {
    console.log(`reddit-capi uid=${user.id} skipped=already_sent`);
    return json({ ok: true, sent: false });
  }

  // 3. The event. event_at from the client when it is a sane recent timestamp, else now.
  const at = typeof body.event_at === 'string' ? Date.parse(body.event_at) : NaN;
  const now = Date.now();
  const eventAt = Number.isFinite(at) && now - at >= 0 && now - at < 7 * 24 * 3600 * 1000 ? new Date(at) : new Date(now);
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent');
  const hashEmail = Deno.env.get('REDDIT_CAPI_HASH_EMAIL') === '1';
  const email = hashEmail && user.email ? user.email.trim().toLowerCase() : null;
  const userMatch: Record<string, string> = { external_id: await sha256Hex(user.id) };
  if (ip) userMatch.ip_address = await sha256Hex(ip);
  if (ua) userMatch.user_agent = ua.slice(0, 512);
  if (email) userMatch.email = await sha256Hex(email);
  const event: Record<string, unknown> = {
    event_at: eventAt.toISOString(),
    event_type: { tracking_type: 'SignUp' },
    user: userMatch,
    event_metadata: { conversion_id: await sha256Hex(user.id) },
  };
  if (clickId) event.click_id = clickId;
  const payload: Record<string, unknown> = { events: [event] };
  if (Deno.env.get('REDDIT_CAPI_TEST_MODE') === '1') payload.test_mode = true;

  const status = await post(`https://ads-api.reddit.com/api/v2.0/conversions/events/${encodeURIComponent(pixelId)}`, token, payload);
  await admin.from('reddit_conversions').update({ status }).eq('user_id', user.id).eq('event_type', 'SignUp');
  console.log(`reddit-capi uid=${user.id} status=${status} click_id=${clickId ? 'yes' : 'no'} email=${email ? 'hashed' : 'off'}`);
  return json({ ok: true, sent: status >= 200 && status < 300, status });
});
