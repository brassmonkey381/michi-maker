/**
 * theme-search — the PAID path for artwork theme search (`theme:` / `art:` / `scene:`).
 *
 *  POST <search_cards RPC body> → <search_cards RPC rows>
 *
 * WHY THIS EXISTS. Card data and the `search_cards` RPC live on the DATA project
 * (bmhjizcmwtmcrstadqto); sign-in and the entitlements ledger live on THIS project. The data
 * project cannot see a user's tier — there is no JWT trust between the two, by design — but it
 * can see the ROLE a request arrives with, because that comes from the API key:
 *
 *   anon key, straight from the client  → role 'anon'         → themed results are CLAMPED to
 *                                                                 search_config.free_theme_depth
 *   data-project secret key, from here   → role 'service_role' → unclamped
 *
 * So a free account keeps calling the data project directly and gets the top few rows plus the
 * TRUE total (the meter: "top 3, +38 more"), while a paying account's themed query comes through
 * this function, which checks the ledger and forwards with the data-project key. Tier logic stays
 * beside the ledger that defines it; no claim is stamped, no secret crosses projects. Only THEMED
 * queries take this hop — ordinary word/facet search never touches it.
 *
 * WHAT IT REFUSES. Guests (anonymous sessions) and accounts without an active tcgscan_pro or
 * tcgscan_vip grant get 403, and the client then falls back to the direct, clamped call — the
 * same degrade as the kit's other locked features. A body that is not the RPC's shape is refused
 * before anything is forwarded: this is a forwarder, not an open proxy to the data project.
 *
 * SECRETS. `DATA_SECRET_KEY` (sb_secret_… or the legacy service_role JWT) for the data project,
 * set with `supabase secrets set` on THIS project. `DATA_SUPABASE_URL` is optional (public value,
 * defaults to the data project). Never returned to a caller.
 *
 * Deploy: `supabase functions deploy theme-search` (JWT verification ON, the default — every
 * caller is a user of this project; guests pass the gateway and are refused below).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { publishableKey, secretKey } from '../_shared/keys.ts';

const DATA_URL = Deno.env.get('DATA_SUPABASE_URL') ?? 'https://bmhjizcmwtmcrstadqto.supabase.co';
/** The products whose holders search unmetered. Mirrors tcgscan-app lib/entitlements
 *  FEATURE_PRODUCT.artThemeSearch — keep the two in step. */
const ENTITLED_PRODUCTS = new Set(['tcgscan_pro', 'tcgscan_vip']);
/** The RPC's parameters, and nothing else, may be forwarded. */
const RPC_KEYS = new Set([
  'p_words', 'p_fields', 'p_compares', 'p_facets', 'p_min_price', 'p_max_price',
  'p_sort', 'p_dir', 'p_limit', 'p_offset', 'p_lang',
]);
const MAX_LIMIT = 200;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Is a grant currently in effect? Lifetime rows (null expiry) always are — tcgscan-app's isActive. */
function isActive(row: { expires_at: string | null }, nowMs: number): boolean {
  if (!row.expires_at) return true;
  const end = Date.parse(row.expires_at);
  return Number.isNaN(end) ? true : end > nowMs;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  // 1) Who is asking. The token is passed EXPLICITLY (see stripe-checkout): the no-arg getUser
  //    reads a stored session, which an edge function never has.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'not signed in' });
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey());
  const { data: { user } } = await authClient.auth.getUser(token);
  if (!user) return json(401, { error: 'not signed in' });
  if ((user as { is_anonymous?: boolean }).is_anonymous) {
    return json(403, { error: 'theme search is a PRO feature' });
  }

  // 2) Do they hold it. Read with the service client so a ledger RLS change can never turn
  //    this into a silent "everyone is free".
  const service = createClient(Deno.env.get('SUPABASE_URL')!, secretKey());
  const { data: rows, error: ledgerErr } = await service
    .from('entitlements')
    .select('product, expires_at')
    .eq('user_id', user.id);
  if (ledgerErr) return json(503, { error: 'entitlements unavailable' });
  const now = Date.now();
  const entitled = (rows ?? []).some(
    (r: { product: string; expires_at: string | null }) => ENTITLED_PRODUCTS.has(r.product) && isActive(r, now),
  );
  if (!entitled) return json(403, { error: 'theme search is a PRO feature' });

  // 3) The RPC body, checked for shape before it is forwarded anywhere.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body must be JSON' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'bad body' });
  const forward: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!RPC_KEYS.has(k)) return json(400, { error: `unknown parameter ${k}` });
    forward[k] = v;
  }
  if (typeof forward.p_limit === 'number') forward.p_limit = Math.min(MAX_LIMIT, Math.max(1, forward.p_limit));
  // A body with no theme field has no business here: the direct path serves it unclamped
  // already, and forwarding it would only spend service-role calls on ordinary searches.
  const fields = Array.isArray(forward.p_fields) ? (forward.p_fields as { key?: string }[]) : [];
  if (!fields.some((f) => f && f.key === 'theme')) return json(400, { error: 'not a themed query' });

  // 4) Forward as service_role, which is what the data project's depth clamp keys off.
  let dataKey: string;
  try {
    dataKey = Deno.env.get('DATA_SECRET_KEY') ?? '';
    if (!dataKey) throw new Error('DATA_SECRET_KEY is not set');
  } catch (e) {
    return json(503, { error: (e as Error).message });
  }
  const res = await fetch(`${DATA_URL}/rest/v1/rpc/search_cards`, {
    method: 'POST',
    headers: {
      apikey: dataKey,
      Authorization: `Bearer ${dataKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(forward),
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
