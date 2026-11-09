/**
 * image-review — the light image safety check (MIC-029). Drains public.image_reviews.
 *
 *  POST {} -> { ok: true, claimed: n, approved: n, flagged: n, unchecked: n }
 *
 * CALLED BY pg_cron every minute (migration 20261109120000), and safe to invoke by hand. Each queued
 * check sends the image URL to the smallest Claude model with a short labelling prompt
 * (classify.ts). "safe" approves the slot; suggestive, explicit or a refusal flags it for Studio;
 * an image that cannot be fetched is retried, then waits as unchecked. NOTHING IS EVER DELETED
 * HERE: removal is a person's decision in Studio.
 *
 * A verdict is written to the slot only while the slot still holds the image that was checked, so
 * an image swapped mid-check is never approved by the old one's result.
 *
 * Auth: a shared secret in `x-image-review-secret`, matched against IMAGE_REVIEW_SECRET.
 * Secrets: IMAGE_REVIEW_SECRET, ANTHROPIC_API_KEY, plus APP_SECRET_KEY (see _shared/keys.ts).
 *
 * STUDIO'S DECISIONS (the same function, a second door). An admin's own session token, and
 *   POST { action: 'decide', id, decision: 'approved' | 'removed', takedown?: boolean }
 * approved: the slot's image is shown. removed: the slot's image is cleared and, when the file is
 * ours (binder-art), the file is deleted from storage; takedown also takes down every public binder
 * of that owner (admin_remove_binder). These need the service role (an admin cannot edit another
 * person's slot under RLS), so the caller is checked with is_admin() first.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@1';
import { publishableKey, secretKey } from '../_shared/keys.ts';
import { REVIEW_MODEL, REVIEW_SCHEMA, REVIEW_SYSTEM, parseAnswer, verdictFor, type ReviewLabel } from './classify.ts';

/** Checks per invocation; cron runs every minute, so a backlog drains across runs. */
const BATCH = 20;
/** A fetch or API failure is retried this many times before the image waits as unchecked. */
const MAX_ATTEMPTS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface QueueRow {
  id: number;
  slot_id: string;
  image_url: string;
  attempts: number;
}

/** The storage path of a file in our binder-art bucket, or null for a hotlinked image. */
function binderArtPath(url: string): string | null {
  const m = /\/storage\/v1\/object\/public\/binder-art\/(.+)$/.exec(url.split('?')[0]);
  return m ? decodeURIComponent(m[1]) : null;
}

async function decide(req: Request, body: { id?: number; decision?: string; takedown?: boolean }): Promise<Response> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const asCaller = createClient(url, publishableKey(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: isAdmin } = await asCaller.rpc('is_admin');
  if (isAdmin !== true) return json({ error: 'forbidden' }, 403);
  const { data: who } = await asCaller.auth.getUser(token);
  if (typeof body.id !== 'number' || (body.decision !== 'approved' && body.decision !== 'removed')) return json({ error: 'bad_request' }, 400);

  const admin = createClient(url, secretKey(), { auth: { persistSession: false } });
  const { data: review } = await admin.from('image_reviews').select('id, slot_id, binder_id, owner_id, image_url').eq('id', body.id).maybeSingle();
  if (!review) return json({ error: 'not_found' }, 404);

  if (body.decision === 'approved') {
    await admin.from('binder_slots').update({ image_review: 'approved', image_reviewed_at: new Date().toISOString() }).eq('id', review.slot_id).eq('image_url', review.image_url);
  } else {
    // Clear the slot first (the image stops showing to anyone), then delete our file.
    await admin.from('binder_slots').update({ image_url: null }).eq('id', review.slot_id).eq('image_url', review.image_url);
    const path = binderArtPath(review.image_url);
    if (path) {
      const { error } = await admin.storage.from('binder-art').remove([path]);
      if (error) return json({ error: 'file_delete_failed', detail: error.message }, 500);
    }
    if (body.takedown) {
      const { data: binders } = await admin.from('binders').select('id').eq('owner_id', review.owner_id).eq('is_public', true).is('removed_at', null);
      for (const b of binders ?? []) await asCaller.rpc('admin_remove_binder', { p_binder_id: b.id });
    }
  }
  await admin.from('image_reviews').update({ decision: body.decision, decided_by: who?.user?.id ?? null, decided_at: new Date().toISOString() }).eq('id', review.id);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  // Studio's door: an admin's decision on one flagged image.
  if (!req.headers.get('x-image-review-secret')) {
    const body = await req.json().catch(() => ({}));
    if (body?.action === 'decide') return decide(req, body);
    return json({ error: 'forbidden' }, 403);
  }
  const expected = Deno.env.get('IMAGE_REVIEW_SECRET');
  if (!expected) return json({ error: 'not_configured' }, 500);
  if (req.headers.get('x-image-review-secret') !== expected) return json({ error: 'forbidden' }, 403);
  const aiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!aiKey) return json({ error: 'not_configured: ANTHROPIC_API_KEY' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false } });
  const ai = new Anthropic({ apiKey: aiKey });

  const { data: rows, error } = await admin
    .from('image_reviews')
    .select('id, slot_id, image_url, attempts')
    .in('status', ['queued', 'error'])
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at')
    .limit(BATCH);
  if (error) return json({ error: 'claim_failed', detail: error.message }, 500);

  const tally = { claimed: 0, approved: 0, flagged: 0, unchecked: 0 };
  for (const row of (rows ?? []) as QueueRow[]) {
    // Claim it; a parallel run that got there first leaves zero rows updated and moves on.
    const { data: claimed } = await admin
      .from('image_reviews')
      .update({ status: 'working', attempts: row.attempts + 1 })
      .eq('id', row.id)
      .in('status', ['queued', 'error'])
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    tally.claimed++;

    let label: ReviewLabel = 'unchecked';
    let minor = false;
    let reason = '';
    let failed = false;
    try {
      const res = await ai.messages.create({
        model: REVIEW_MODEL,
        max_tokens: 256,
        thinking: { type: 'disabled' },
        system: REVIEW_SYSTEM,
        output_config: { format: { type: 'json_schema', schema: REVIEW_SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: row.image_url } }, { type: 'text', text: 'Label this image.' }] }],
      });
      if (res.stop_reason === 'refusal') {
        label = 'refused';
        reason = String(res.stop_details?.category ?? 'refused');
      } else {
        const text = res.content.find((c) => c.type === 'text');
        const out = parseAnswer(text && text.type === 'text' ? text.text : '');
        ({ label, minor_concern: minor, reason } = out);
      }
    } catch (e) {
      failed = true;
      reason = String((e as Error)?.message ?? e).slice(0, 200);
    }

    // A failure is retried until MAX_ATTEMPTS; then the image waits as unchecked.
    const finalFailure = failed && row.attempts + 1 >= MAX_ATTEMPTS;
    if (failed && !finalFailure) {
      await admin.from('image_reviews').update({ status: 'error', reason }).eq('id', row.id);
      continue;
    }
    const verdict = verdictFor(failed ? 'unchecked' : label);
    await admin
      .from('image_reviews')
      .update({ status: 'done', label: failed ? 'unchecked' : label, minor_concern: minor, reason, model: REVIEW_MODEL, checked_at: new Date().toISOString() })
      .eq('id', row.id);
    // Only while the slot still holds the image that was checked.
    await admin
      .from('binder_slots')
      .update({ image_review: verdict, image_reviewed_at: new Date().toISOString(), image_review_label: failed ? 'unchecked' : label })
      .eq('id', row.slot_id)
      .eq('image_url', row.image_url);
    tally[verdict === 'approved' ? 'approved' : verdict === 'flagged' ? 'flagged' : 'unchecked']++;
  }
  return json({ ok: true, ...tally });
});
