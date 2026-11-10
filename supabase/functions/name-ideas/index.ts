/**
 * name-ideas — MIC-034 part 2, the ✨ beside a page's or binder's title and description: three
 * short options from Claude Haiku, written from TEXT FACTS about the cards (names, types, artists,
 * sets, scenes, an evolution line) that the device already worked out. No image is sent.
 *
 *  POST { kind: 'page' | 'binder', field: 'title' | 'description', subjectId, facts }
 *    → { options: string[] }            three options
 *    → 429 { error: 'limit', which }    a daily cap is reached (which: 'subject' | 'account')
 *
 * CAPS (owner-approved plan, 2026-11-10): 5 presses per page or binder per day, 10 per account per
 * day, 3 per guest (anonymous session) per day. Counted from this function's own rows in
 * analytics_events (name 'names.ideas', written here with the secret key, one per answered press),
 * so no table or migration is needed; a day is UTC. Cost: about $0.00014 per press.
 *
 * Secrets: ANTHROPIC_API_KEY (already set for image-review), plus APP_SECRET_KEY (_shared/keys.ts).
 * Deploy: `supabase functions deploy name-ideas` (JWT verification ON: every caller has a session,
 * guests included).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@1';
import { publishableKey, secretKey } from '../_shared/keys.ts';

const MODEL = 'claude-haiku-5-5';
const CAP_SUBJECT = 5;
const CAP_ACCOUNT = 10;
const CAP_GUEST = 3;
const MAX_FACTS = 2000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = `You suggest names for a collector's digital Pokemon card binder.
You get plain facts about the cards on one page (or across a whole binder) and write exactly three options for the field asked.
Titles: 2 to 5 words, title case, no quotation marks, no ending punctuation. Make them specific to these cards and pleasant to read; vary the three (one plain, one playful, one evocative).
Descriptions: two or three sentences, at most 320 characters. Describe the ART first: the scenery, the most common characters and what they are doing, and how the art connects across the cards (for example along an evolution line). Then, only if the facts show one to three rarities or one to three sets, you may add a short note about them. Example of the style: "Three evolution lines for the Kanto starters: Charmander, Squirtle and Bulbasaur. Illustration Rares only. Squirtle sinks deeper into the ocean as he evolves, Charmander rises into the clouds as he becomes Charizard, and Bulbasaur grows into Venusaur in the jungle."
Rules: no em dashes or en dashes; no emoji; never mention AI, tags, data, or how the binder was made; do not invent cards, people or facts that are not given; English.`;

/** What to write, said plainly per field (a first live run asked for descriptions and got titles). */
const ASK = {
  title: (kind: string) => `Write three short TITLES for this ${kind} (2 to 5 words each).`,
  description: (kind: string) =>
    `Write three DESCRIPTIONS for this ${kind}. Each one is two or three full sentences about the art and the characters, never a title or a phrase.`,
} as const;

const SCHEMA = {
  type: 'object',
  properties: { options: { type: 'array', items: { type: 'string' } } },
  required: ['options'],
  additionalProperties: false,
} as const;

/** Clean one option: trim, drop quotes and dashes the model was told not to use, cap the length. */
function clean(s: string, field: 'title' | 'description'): string {
  let t = s.replace(/[—–]/g, ',').replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').trim();
  if (field === 'title') t = t.replace(/[.!]+$/, '').slice(0, 60);
  else t = t.slice(0, 360);
  return t;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const asCaller = createClient(url, publishableKey(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: who } = await asCaller.auth.getUser(token);
  const user = who?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: { kind?: string; field?: string; subjectId?: string; facts?: string; dev?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const kind = body.kind === 'binder' ? 'binder' : body.kind === 'page' ? 'page' : null;
  const field = body.field === 'title' ? 'title' : body.field === 'description' ? 'description' : null;
  const subjectId = typeof body.subjectId === 'string' && /^[0-9a-f-]{8,64}$/i.test(body.subjectId) ? body.subjectId : null;
  const facts = typeof body.facts === 'string' ? body.facts.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, MAX_FACTS) : '';
  if (!kind || !field || !subjectId || !facts) return json({ error: 'bad_request' }, 400);

  const aiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!aiKey) return json({ error: 'not_configured' }, 500);

  // The caps, from this function's own rows today (UTC).
  const admin = createClient(url, secretKey(), { auth: { persistSession: false } });
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data: used, error: usedErr } = await admin
    .from('analytics_events')
    .select('props')
    .eq('user_id', user.id)
    .eq('name', 'names.ideas')
    .gte('ts', since.toISOString())
    .limit(50);
  if (usedErr) return json({ error: 'unavailable' }, 503);
  const rows = (used ?? []) as { props: { subject?: string } | null }[];
  const accountCap = user.is_anonymous ? CAP_GUEST : CAP_ACCOUNT;
  if (rows.length >= accountCap) return json({ error: 'limit', which: 'account', cap: accountCap }, 429);
  if (rows.filter((r) => r.props?.subject === subjectId).length >= CAP_SUBJECT) return json({ error: 'limit', which: 'subject', cap: CAP_SUBJECT }, 429);

  const ai = new Anthropic({ apiKey: aiKey });
  let options: string[] = [];
  try {
    const res = await ai.messages.create({
      model: MODEL,
      max_tokens: 300,
      thinking: { type: 'disabled' },
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: 'user', content: `${ASK[field](kind)}\n\nFacts:\n${facts}` }],
    });
    const text = res.content.find((c) => c.type === 'text');
    const parsed = text && text.type === 'text' ? (JSON.parse(text.text) as { options?: unknown }) : null;
    options = Array.isArray(parsed?.options)
      ? parsed!.options.filter((o): o is string => typeof o === 'string').map((o) => clean(o, field)).filter(Boolean)
      : [];
  } catch (e) {
    console.warn('[name-ideas] model call failed', String((e as Error)?.message ?? e).slice(0, 200));
    return json({ error: 'unavailable' }, 503);
  }
  options = [...new Set(options)].slice(0, 3);
  if (!options.length) return json({ error: 'unavailable' }, 503);

  // One row per answered press: the cap's count, and analytics' event.
  await admin.from('analytics_events').insert({ app: 'michi', name: 'names.ideas', user_id: user.id, props: { subject: subjectId, kind, field, guest: !!user.is_anonymous, model: MODEL, ...(body.dev === true ? { dev: true } : {}) } });
  return json({ options });
});
