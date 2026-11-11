/**
 * discover-search — Discover's one search box (MIC-017 piece 8, owner 2026-11-11: "Let the users
 * search the binders via theme, scenery, art style, set, palette, etc. via our understanding of
 * each binder and binder page's cards. The user does not need special access").
 *
 *  POST { rpc: <search_cards RPC body> }  →  { rows: <search_binder_pages_by_cards rows> }
 *
 * The search runs in full on the card server (the data project's search_cards, with this
 * project's DATA_SECRET_KEY, so a theme or scene query is not clamped), and its card ids rank the
 * PUBLIC binders here by how much of each one those cards fill (search_binders_by_cards). Only
 * binders come back, never the card list: the card browser's own theme meter (free: top matches,
 * PRO: every match) is untouched, because nothing here hands a card result to the caller.
 *
 * Callers: anyone with this project's key (guests included). The body is checked against the
 * RPC's own parameters and the limit is capped.
 *
 * Secrets: DATA_SECRET_KEY (set for theme-search), DATA_SUPABASE_URL optional, APP_SECRET_KEY.
 * Deploy: `supabase functions deploy discover-search`.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { secretKey } from '../_shared/keys.ts';

const DATA_URL = Deno.env.get('DATA_SUPABASE_URL') ?? 'https://bmhjizcmwtmcrstadqto.supabase.co';
const RPC_KEYS = new Set(['p_words', 'p_fields', 'p_compares', 'p_facets', 'p_min_price', 'p_max_price', 'p_sort', 'p_dir', 'p_limit', 'p_offset', 'p_lang']);
const MAX_CARDS = 400;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  let body: { rpc?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const rpc = body.rpc;
  if (!rpc || typeof rpc !== 'object') return json(400, { error: 'bad_request' });
  const fwd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rpc)) {
    if (!RPC_KEYS.has(k)) return json(400, { error: `unknown parameter ${k}` });
    fwd[k] = v;
  }
  fwd.p_limit = MAX_CARDS;
  fwd.p_offset = 0;
  const dataKey = Deno.env.get('DATA_SECRET_KEY');
  if (!dataKey) return json(500, { error: 'not_configured' });

  // 1. The cards the search finds, in full (ids only are used).
  const res = await fetch(`${DATA_URL}/rest/v1/rpc/search_cards`, {
    method: 'POST',
    headers: { apikey: dataKey, Authorization: `Bearer ${dataKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fwd),
  });
  if (!res.ok) return json(502, { error: 'card search failed' });
  const cards = ((await res.json()) ?? []) as { id?: string | number }[];
  const ids = [...new Set(cards.map((c) => String(c.id ?? '')).filter(Boolean))].slice(0, MAX_CARDS);
  if (!ids.length) return json(200, { rows: [] });

  // 2. The public binders those cards fill most.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false } });
  // Through their pages (search_binder_pages_by_cards): each row also names the pages holding the
  // search's cards (match_pages, the post-it) and shows the best one. Every page with a found card
  // counts; the binder ranking is the same whole-binder fill as before. Until that migration runs,
  // the older binder-only ranking answers (no post-it, opens at the start).
  const paged = await admin.rpc('search_binder_pages_by_cards', {
    p_card_ids: ids,
    p_min_share: 0.0001,
    p_min_cards: 1,
    p_rank: 'binder',
    p_limit: 60,
  });
  if (!paged.error) return json(200, { rows: paged.data ?? [] });
  const { data, error } = await admin.rpc('search_binders_by_cards', { p_card_ids: ids, p_limit: 60 });
  if (error) return json(502, { error: 'binder ranking failed' });
  return json(200, { rows: data ?? [] });
});
