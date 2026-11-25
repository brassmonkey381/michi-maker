/**
 * page-tags — keeps public page search tags fresh (MIC-068). Two modes, both called by pg_cron
 * (migration 20261125130000) and safe to call by hand:
 *
 *  POST { mode: 'submit' }  -> { ok, queued, sent, unchanged, hidden, empty, batch_id? }
 *    Reads page_tag_queue (filled by triggers and the nightly sweep), keeps the pages a visitor can
 *    see, describes each one as text (title, background, each card's name, types, artist and art
 *    caption from the card server), and SKIPS every page whose text hash matches the tags it already
 *    has. The rest go to Claude Haiku as ONE Message Batch (half price, cached system prompt). The
 *    batch and each page's hash are recorded in page_tag_runs. At most MAX_PAGES per run.
 *
 *  POST { mode: 'collect' } -> { ok, runs: [{ batch_id, status, succeeded, errored, cost_usd }] }
 *    For each open run whose batch has ended: writes the tags (latest only, one row per page),
 *    puts failed pages back on the queue, and records the tokens and estimated cost on the run.
 *
 * Nothing here changes a binder or a page. Tags are only read by search_binders.
 *
 * Auth: a shared secret in `x-page-tags-secret`, matched against PAGE_TAGS_SECRET.
 * Secrets: PAGE_TAGS_SECRET, ANTHROPIC_API_KEY (Michi's, as image-review), DATA_SECRET_KEY (card
 * server, as discover-search), plus APP_SECRET_KEY (see _shared/keys.ts).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@1';
import { secretKey } from '../_shared/keys.ts';
import { cleanTags, hashInput, pageTagText, TAG_MODEL, TAG_SCHEMA, TAG_SYSTEM, tagTerms, usageCost, type TagCard, type TagUsage } from '../../../src/data/pageTags.ts';

/** Pages per submit run. The first runs work through the backlog four times a day. */
const MAX_PAGES = 2000;
/** Ids per PostgREST in() filter, to keep request URLs short. */
const CHUNK = 150;
const DATA_URL = Deno.env.get('DATA_SUPABASE_URL') ?? 'https://bmhjizcmwtmcrstadqto.supabase.co';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const chunks = <T>(xs: readonly T[], n = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type CardRow = { id: string; name?: string | null; types?: string[] | null; illustrator?: string | null; scene_caption?: string | null; scene_tags?: string[] | null };

/** Card names and art text from the card server; English rows first, any other card by name only. */
async function fetchCards(ids: string[], dataKey: string): Promise<Map<string, TagCard>> {
  const out = new Map<string, TagCard>();
  const get = async (table: string, select: string, part: string[]) => {
    const list = part.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
    const res = await fetch(`${DATA_URL}/rest/v1/${table}?select=${select}&id=in.(${encodeURIComponent(list)})`, {
      headers: { apikey: dataKey, Authorization: `Bearer ${dataKey}` },
    });
    if (!res.ok) throw new Error(`card server ${table} ${res.status}`);
    return (await res.json()) as CardRow[];
  };
  for (const part of chunks(ids, 100)) {
    for (const c of await get('cards_en', 'id,name,types,illustrator,scene_caption,scene_tags', part)) {
      out.set(String(c.id), { name: c.name ?? '', types: c.types, illustrator: c.illustrator, caption: c.scene_caption, sceneTags: c.scene_tags });
    }
  }
  const missing = ids.filter((id) => !out.has(id));
  for (const part of chunks(missing, 100)) {
    for (const c of await get('cards', 'id,name', part)) out.set(String(c.id), { name: c.name ?? '' });
  }
  return out;
}

async function submit(db: SupabaseClient, ai: Anthropic, dataKey: string) {
  const claimAt = new Date().toISOString();
  const { data: queued, error: qErr } = await db.from('page_tag_queue').select('page_id').order('dirty_at').limit(MAX_PAGES);
  if (qErr) throw new Error(`queue: ${qErr.message}`);
  const ids = (queued ?? []).map((r) => r.page_id as string);
  const result = { ok: true, queued: ids.length, sent: 0, unchanged: 0, hidden: 0, empty: 0, held_open: 0, batch_id: null as string | null };
  if (!ids.length) return result;

  // Pages already in an open batch wait for it, so an older answer never overwrites a newer one.
  const { data: open } = await db.from('page_tag_runs').select('page_hashes').eq('status', 'submitted');
  const inFlight = new Set((open ?? []).flatMap((r) => Object.keys((r.page_hashes ?? {}) as Record<string, unknown>)));

  type Page = { id: string; binder_id: string; title: string | null; background_color: string | null; is_public: boolean; moderation_hold: boolean };
  const pages: Page[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await db.from('binder_pages').select('id, binder_id, title, background_color, is_public, moderation_hold').in('id', part);
    if (error) throw new Error(`pages: ${error.message}`);
    pages.push(...((data ?? []) as Page[]));
  }
  const binderIds = [...new Set(pages.map((p) => p.binder_id))];
  const visibleBinders = new Set<string>();
  for (const part of chunks(binderIds)) {
    const { data, error } = await db.from('binders').select('id, is_public, removed_at, archived_at, is_demo, hidden_from_feeds').in('id', part);
    if (error) throw new Error(`binders: ${error.message}`);
    for (const b of data ?? []) {
      if (b.is_public && !b.removed_at && !b.archived_at && !b.is_demo && !b.hidden_from_feeds) visibleBinders.add(b.id as string);
    }
  }
  const visible = pages.filter((p) => p.is_public && !p.moderation_hold && visibleBinders.has(p.binder_id) && !inFlight.has(p.id));
  result.held_open = pages.filter((p) => inFlight.has(p.id)).length;
  const visibleIds = new Set(visible.map((p) => p.id));
  const done: string[] = ids.filter((id) => !visibleIds.has(id) && !inFlight.has(id));
  result.hidden = done.length;

  type Slot = { page_id: string; slot_type: string; card_id: string | null; row_index: number; col_index: number };
  const slots: Slot[] = [];
  for (const part of chunks(visible.map((p) => p.id))) {
    const { data, error } = await db.from('binder_slots').select('page_id, slot_type, card_id, row_index, col_index').in('page_id', part);
    if (error) throw new Error(`slots: ${error.message}`);
    slots.push(...((data ?? []) as Slot[]));
  }
  const cardIds = [...new Set(slots.filter((s) => s.slot_type === 'card' && s.card_id).map((s) => s.card_id as string))];
  const cards = await fetchCards(cardIds, dataKey);

  const had: { page_id: string; source_hash: string }[] = [];
  for (const part of chunks(visible.map((p) => p.id))) {
    const { data, error } = await db.from('page_search_tags').select('page_id, source_hash').in('page_id', part);
    if (error) throw new Error(`tags: ${error.message}`);
    had.push(...((data ?? []) as { page_id: string; source_hash: string }[]));
  }
  const oldHash = new Map(had.map((r) => [r.page_id, r.source_hash]));

  const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = [];
  const pageHashes: Record<string, { h: string; b: string }> = {};
  for (const p of visible) {
    const mine = slots
      .filter((s) => s.page_id === p.id)
      .sort((a, b) => a.row_index - b.row_index || a.col_index - b.col_index);
    const pageCards = mine.filter((s) => s.slot_type === 'card' && s.card_id).map((s) => cards.get(s.card_id as string) ?? { name: '' });
    const pictures = mine.filter((s) => s.slot_type !== 'card').length;
    if (!pageCards.length && !pictures) {
      result.empty += 1;
      done.push(p.id);
      continue;
    }
    const text = pageTagText({ title: p.title, background: p.background_color, cards: pageCards, pictures });
    const h = await sha256(hashInput(text));
    if (oldHash.get(p.id) === h) {
      result.unchanged += 1;
      done.push(p.id);
      continue;
    }
    pageHashes[p.id] = { h, b: p.binder_id };
    requests.push({
      custom_id: p.id,
      params: {
        model: TAG_MODEL,
        max_tokens: 400,
        thinking: { type: 'disabled' },
        system: [{ type: 'text', text: TAG_SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { format: { type: 'json_schema', schema: TAG_SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: 'user', content: text }],
      } as Anthropic.Messages.MessageCreateParamsNonStreaming,
    });
  }

  if (requests.length) {
    const batch = await ai.messages.batches.create({ requests });
    result.batch_id = batch.id;
    result.sent = requests.length;
    const { error } = await db.from('page_tag_runs').insert({ batch_id: batch.id, pages: requests.length, page_hashes: pageHashes });
    if (error) throw new Error(`run row for ${batch.id}: ${error.message}`);
    done.push(...Object.keys(pageHashes));
  }
  // Off the queue: pages handled now. A page edited after claimAt keeps its row and comes back.
  for (const part of chunks(done)) {
    const { error } = await db.from('page_tag_queue').delete().in('page_id', part).lte('dirty_at', claimAt);
    if (error) throw new Error(`queue delete: ${error.message}`);
  }
  return result;
}

async function collect(db: SupabaseClient, ai: Anthropic) {
  const { data: runs, error } = await db.from('page_tag_runs').select('id, batch_id, page_hashes').eq('status', 'submitted').order('id');
  if (error) throw new Error(`runs: ${error.message}`);
  const out: { batch_id: string; status: string; succeeded?: number; errored?: number; cost_usd?: number }[] = [];
  for (const run of runs ?? []) {
    const batch = await ai.messages.batches.retrieve(run.batch_id as string);
    if (batch.processing_status !== 'ended') {
      out.push({ batch_id: run.batch_id as string, status: batch.processing_status });
      continue;
    }
    const hashes = (run.page_hashes ?? {}) as Record<string, { h: string; b: string }>;
    const usage: TagUsage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
    const rows: Record<string, unknown>[] = [];
    const retry: string[] = [];
    for await (const r of await ai.messages.batches.results(run.batch_id as string)) {
      const pageId = r.custom_id;
      if (r.result.type !== 'succeeded') {
        retry.push(pageId);
        continue;
      }
      const m = r.result.message;
      usage.input += m.usage.input_tokens ?? 0;
      usage.cacheWrite += m.usage.cache_creation_input_tokens ?? 0;
      usage.cacheRead += m.usage.cache_read_input_tokens ?? 0;
      usage.output += m.usage.output_tokens ?? 0;
      const text = m.content.find((b) => b.type === 'text');
      let tags = null;
      if (m.stop_reason === 'end_turn' && text && text.type === 'text') {
        try {
          tags = cleanTags(JSON.parse(text.text));
        } catch {
          tags = null;
        }
      }
      const meta = hashes[pageId];
      if (!tags || !meta) {
        // A refusal, a cut-off or an unusable answer: not retried (the same text would get the same
        // answer). The page is looked at again when it changes.
        continue;
      }
      rows.push({
        page_id: pageId,
        binder_id: meta.b,
        ...tags,
        terms: tagTerms(tags),
        source_hash: meta.h,
        model: m.model,
        tagged_at: new Date().toISOString(),
      });
    }
    // Pages deleted since the batch went out are skipped (their foreign key would fail).
    const live = new Set<string>();
    for (const part of chunks(rows.map((r) => r.page_id as string))) {
      const { data } = await db.from('binder_pages').select('id').in('id', part);
      for (const p of data ?? []) live.add(p.id as string);
    }
    const keep = rows.filter((r) => live.has(r.page_id as string));
    for (const part of chunks(keep, 200)) {
      const { error: upErr } = await db.from('page_search_tags').upsert(part, { onConflict: 'page_id' });
      if (upErr) throw new Error(`tags upsert: ${upErr.message}`);
    }
    for (const part of chunks(retry)) {
      await db.from('page_tag_queue').upsert(part.map((page_id) => ({ page_id })), { onConflict: 'page_id', ignoreDuplicates: true });
    }
    const cost = Number(usageCost(usage).toFixed(6));
    const { error: runErr } = await db
      .from('page_tag_runs')
      .update({
        status: 'done',
        succeeded: batch.request_counts.succeeded,
        errored: batch.request_counts.errored + batch.request_counts.expired + batch.request_counts.canceled,
        input_tokens: usage.input,
        cache_write_tokens: usage.cacheWrite,
        cache_read_tokens: usage.cacheRead,
        output_tokens: usage.output,
        cost_usd: cost,
        ended_at: new Date().toISOString(),
        note: `${keep.length} tagged, ${retry.length} requeued`,
      })
      .eq('id', run.id);
    if (runErr) throw new Error(`run update: ${runErr.message}`);
    out.push({ batch_id: run.batch_id as string, status: 'done', succeeded: batch.request_counts.succeeded, errored: retry.length, cost_usd: cost });
  }
  return { ok: true, runs: out };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const secret = Deno.env.get('PAGE_TAGS_SECRET');
  if (!secret || req.headers.get('x-page-tags-secret') !== secret) return json(401, { error: 'unauthorized' });
  let mode = '';
  try {
    mode = String(((await req.json()) as { mode?: unknown })?.mode ?? '');
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const aiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!aiKey) return json(500, { error: 'not_configured: ANTHROPIC_API_KEY' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false } });
  const ai = new Anthropic({ apiKey: aiKey });
  try {
    if (mode === 'submit') {
      const dataKey = Deno.env.get('DATA_SECRET_KEY');
      if (!dataKey) return json(500, { error: 'not_configured: DATA_SECRET_KEY' });
      return json(200, await submit(db, ai, dataKey));
    }
    if (mode === 'collect') return json(200, await collect(db, ai));
    return json(400, { error: 'mode must be submit or collect' });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
