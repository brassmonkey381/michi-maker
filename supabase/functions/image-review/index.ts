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
 * For the admin email: RESEND_API_KEY and ADMIN_NOTIFY_EMAIL (no email when either is missing).
 *
 * A FLAG MAKES ITS PAGE PRIVATE, AND FOLLOWS THE PICTURE (owner, 2026-11-09). A flagged image's
 * page is held from visitors by the database (binder_pages.moderation_hold, kept by triggers), so a
 * sliced picture's harmless-looking pieces go private with the explicit one. Every flagged file's
 * fingerprint (SHA-256 of the bytes + a 64-bit difference hash) is kept in flagged_images; a check
 * first compares against them, so a re-upload, a copy or a re-encode of a flagged picture is held at
 * once without asking the model again.
 *
 * THE OWNER IS TOLD BY EMAIL (owner, 2026-11-09: "Don't auto delete anything that gets flagged.
 * Just share it with me"). New flags go out in one email at most every NOTICE_EVERY_MIN minutes:
 * counts, binder links and the Studio link, never the images.
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
import { NOTICE_EVERY_MIN, REVIEW_MODEL, REVIEW_SCHEMA, REVIEW_SYSTEM, SAME_PICTURE_BITS, dhashHex, hammingHex, isModelType, noticeText, parseAnswer, renderUrl, samePictureRows, sniffImage, verdictFor, type ModelType, type ReviewLabel } from './classify.ts';

/** Checks per invocation; cron runs every minute, so a backlog drains across runs. */
const BATCH = 20;
/** Stop claiming new rows after this long, well inside the edge function's wall-clock limit. */
const RUN_BUDGET_MS = 90_000;
/** A row still 'working' this long after its claim belonged to a run that was killed; requeue it. */
const STALE_WORKING_MIN = 5;
/** Larger files skip the near-match hash: decoding them in JS costs more than the edge CPU limit
 *  allows (2026-11-09: "CPU Time exceeded" during the backfill). SHA-256 still matches exact copies. */
const DHASH_MAX_BYTES = 350_000;
/** A fetch or API failure is retried this many times before the image waits as unchecked. */
const MAX_ATTEMPTS = 3;

/** Studio calls the decide door from the browser, so it answers CORS (2026-11-10: Approve failed
 *  with "Failed to send a request to the Edge Function": the preflight got a 405 and no headers). */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

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

// The decoder loads on first use, and a failure only costs the near-match hash. The npm build of
// imagescript loads a native Node codec at import time, which the edge runtime refuses ("unsupported
// arch/platform"): imported at the top it crashed every run before a single image was checked
// (2026-11-09, 360 runs). The deno.land build is pure JS + wasm.
// deno-lint-ignore no-explicit-any
let decoder: Promise<(b: Uint8Array) => Promise<any>> | null = null;
// deno-lint-ignore no-explicit-any
function loadDecoder(): Promise<(b: Uint8Array) => Promise<any>> {
  decoder ??= import('https://deno.land/x/imagescript@1.3.0/mod.ts').then((m) => m.decode);
  return decoder;
}

/** Fetch the image once: its bytes, media type, SHA-256 and difference hash (null if undecodable). */
async function fingerprint(url: string): Promise<{ bytes: Uint8Array; mediaType: string; sha256: string; dhash: string | null }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const mediaType = (res.headers.get('content-type') ?? 'image/png').split(';')[0].trim();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha256 = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  let dhash: string | null = null;
  if (bytes.length <= DHASH_MAX_BYTES) try {
    // deno-lint-ignore no-explicit-any
    const img: any = await (await loadDecoder())(bytes);
    const frame = typeof img.resize === 'function' ? img : img[0];
    const small = frame.resize(9, 8);
    const gray: number[] = [];
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 9; x++) {
        const rgba = small.getPixelAt(x, y) >>> 0;
        gray.push(((rgba >>> 24) & 255) * 0.299 + ((rgba >>> 16) & 255) * 0.587 + ((rgba >>> 8) & 255) * 0.114);
      }
    }
    dhash = dhashHex(gray);
  } catch {
    dhash = null; // the exact hash still matches re-uploads of the same file
  }
  return { bytes, mediaType, sha256, dhash };
}

/** A flagged picture this one is (exact or near), if any. Approved and removed decisions count too. */
// deno-lint-ignore no-explicit-any
async function knownPicture(admin: any, sha256: string, dhash: string | null): Promise<{ status: string; label: string } | null> {
  const { data: exact } = await admin.from('flagged_images').select('status, label').eq('sha256', sha256).maybeSingle();
  if (exact) return exact;
  if (!dhash) return null;
  const { data: all } = await admin.from('flagged_images').select('status, label, dhash').not('dhash', 'is', null).neq('status', 'approved').limit(5000);
  const near = (all ?? []).find((r: { dhash: string }) => hammingHex(r.dhash, dhash) <= SAME_PICTURE_BITS);
  return near ? { status: near.status, label: near.label } : null;
}

/** The API's limit on one base64 image, with a margin for the encoding. */
const MODEL_MAX_BYTES = 3_700_000;

/**
 * A copy of the picture the model can read: Supabase Storage re-encodes it (image transformation,
 * resized to 1568 px, webp). For files whose bytes are not jpeg/png/gif/webp (AVIF, HEIC, ...), files
 * too large to send, and files the API refused. Null when the URL is not a Storage object or the copy
 * is not readable either.
 */
async function convertedCopy(url: string): Promise<{ type: ModelType; bytes: Uint8Array } | null> {
  const r = renderUrl(url);
  if (!r) return null;
  try {
    const res = await fetch(r, { headers: { Accept: 'image/webp,image/png;q=0.9,image/jpeg;q=0.8' } });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const type = sniffImage(bytes);
    return isModelType(type) && bytes.length <= MODEL_MAX_BYTES ? { type, bytes } : null;
  } catch {
    return null;
  }
}

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** One email to the admin about flags not yet told, at most every NOTICE_EVERY_MIN minutes. */
// deno-lint-ignore no-explicit-any
async function notifyAdmin(admin: any): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ADMIN_NOTIFY_EMAIL');
  if (!key || !to) return;
  const { data: last } = await admin.from('admin_notices').select('last_sent_at').eq('kind', 'image-review').maybeSingle();
  if (last && Date.now() - new Date(last.last_sent_at).getTime() < NOTICE_EVERY_MIN * 60e3) return;
  const { data: open } = await admin
    .from('image_reviews')
    .select('id, binder_id, label, minor_concern')
    .is('decision', null)
    .is('notified_at', null)
    // Only what waits for a person: suggestive is shown now, unless it raised a minor concern.
    .or('label.in.(explicit,refused,unchecked,held),and(label.eq.suggestive,minor_concern.is.true)')
    .limit(200);
  if (!open?.length) return;
  const site = 'https://michi-maker.com';
  const { subject, text } = noticeText(
    open.map((r: { binder_id: string; label: string; minor_concern: boolean | null }) => ({ binderId: r.binder_id, label: r.label, minor: r.minor_concern === true })),
    `${site}/studio`,
    site,
  );
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'michi-maker <hello@tcgscan.ai>', to: [to], subject, text }),
  });
  if (!res.ok) return; // try again on the next run
  const now = new Date().toISOString();
  await admin.from('image_reviews').update({ notified_at: now }).in('id', open.map((r: { id: number }) => r.id));
  await admin.from('admin_notices').upsert({ kind: 'image-review', last_sent_at: now });
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

  const { data: fpRow } = await admin.from('image_reviews').select('sha256, dhash').eq('id', review.id).maybeSingle();
  if (fpRow?.sha256) {
    await admin.from('flagged_images').update({ status: body.decision, decided_at: new Date().toISOString() }).eq('sha256', fpRow.sha256);
  }
  // APPROVE FOLLOWS THE PICTURE (owner, 2026-11-10): every copy of it, in any slot of any binder,
  // is approved with it, so a page held only by a copy is released by the page-hold trigger and
  // Studio lists each picture once. Copies are found by fingerprint (samePictureRows), and a slot
  // is only touched while it still holds the copy that was checked. REMOVE stays per slot: it
  // deletes a file, and that is never done to someone else's copy without its own decision.
  let decidedIds: number[] = [review.id];
  if (body.decision === 'approved') {
    const now = new Date().toISOString();
    let copies: { id: number; slot_id: string; image_url: string; sha256: string | null; dhash: string | null }[] = [];
    if (fpRow?.sha256 || fpRow?.dhash) {
      const { data: open } = await admin
        .from('image_reviews')
        .select('id, slot_id, image_url, sha256, dhash')
        .eq('status', 'done')
        .is('decision', null)
        .neq('id', review.id);
      copies = samePictureRows({ sha256: fpRow?.sha256 ?? null, dhash: fpRow?.dhash ?? null }, open ?? []);
      for (const sha of new Set(copies.map((c) => c.sha256).filter((s): s is string => !!s && s !== fpRow?.sha256))) {
        await admin.from('flagged_images').update({ status: 'approved', decided_at: now }).eq('sha256', sha);
      }
    }
    for (const r of [{ slot_id: review.slot_id, image_url: review.image_url }, ...copies]) {
      await admin.from('binder_slots').update({ image_review: 'approved', image_reviewed_at: now }).eq('id', r.slot_id).eq('image_url', r.image_url);
    }
    decidedIds = [review.id, ...copies.map((c) => c.id)];
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
  await admin.from('image_reviews').update({ decision: body.decision, decided_by: who?.user?.id ?? null, decided_at: new Date().toISOString() }).in('id', decidedIds);
  return json({ ok: true, decided: decidedIds.length });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
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

  const started = Date.now();
  // A run killed mid-batch (time or CPU limit) leaves its current row 'working' forever; the claim
  // below only takes 'queued' and 'error', so put those back as 'error' (attempts already counted).
  const staleBefore = new Date(Date.now() - STALE_WORKING_MIN * 60e3).toISOString();
  // Out of attempts: it waits as unchecked (a person looks), like any other final failure.
  const { data: spent } = await admin
    .from('image_reviews')
    .update({ status: 'done', label: 'unchecked', reason: 'run stopped before finishing (3 times)', checked_at: new Date().toISOString() })
    .eq('status', 'working')
    .gte('attempts', MAX_ATTEMPTS)
    .lt('checked_at', staleBefore)
    .select('slot_id, image_url');
  for (const r of (spent ?? []) as { slot_id: string; image_url: string }[]) {
    await admin.from('binder_slots')
      .update({ image_review: verdictFor('unchecked'), image_reviewed_at: new Date().toISOString(), image_review_label: 'unchecked' })
      .eq('id', r.slot_id).eq('image_url', r.image_url);
  }
  await admin
    .from('image_reviews')
    .update({ status: 'error', reason: 'run stopped before finishing' })
    .eq('status', 'working')
    .lt('attempts', MAX_ATTEMPTS)
    .lt('checked_at', staleBefore);

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
    if (Date.now() - started > RUN_BUDGET_MS) break;
    // Claim it (checked_at holds the claim time until the check finishes); a parallel run that got there first leaves zero rows updated and moves on.
    const { data: claimed } = await admin
      .from('image_reviews')
      .update({ status: 'working', attempts: row.attempts + 1, checked_at: new Date().toISOString() })
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
    let fp: { sha256: string; dhash: string | null } | null = null;
    try {
      const got = await fingerprint(row.image_url);
      fp = { sha256: got.sha256, dhash: got.dhash };
      const known = await knownPicture(admin, got.sha256, got.dhash);
      if (known && known.status === 'approved') {
        label = 'safe';
        reason = 'Same picture Studio approved before';
      } else if (known) {
        label = (known.label as ReviewLabel) ?? 'explicit';
        reason = 'Same picture as one flagged before';
      } else {
        // The type comes from the BYTES, never the server's Content-Type (sniffImage). Anything the
        // model cannot take as it is goes as Storage's re-encoded copy.
        const sniffed = sniffImage(got.bytes);
        const ask = (img: { type: ModelType; bytes: Uint8Array }) =>
          ai.messages.create({
            model: REVIEW_MODEL,
            max_tokens: 256,
            thinking: { type: 'disabled' },
            system: REVIEW_SYSTEM,
            output_config: { format: { type: 'json_schema', schema: REVIEW_SCHEMA as unknown as Record<string, unknown> } },
            messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: img.type, data: base64(img.bytes) } }, { type: 'text', text: 'Label this image.' }] }],
          });
        const asIs = isModelType(sniffed) && got.bytes.length <= MODEL_MAX_BYTES ? { type: sniffed, bytes: got.bytes } : null;
        let res;
        if (asIs) {
          try {
            res = await ask(asIs);
          } catch (e) {
            // The API refused the image itself (a 400 about it): try the re-encoded copy once.
            const msg = String((e as Error)?.message ?? e);
            if (!/^400\b/.test(msg) || !/image/i.test(msg)) throw e;
            const copy = await convertedCopy(row.image_url);
            if (!copy) throw new Error(`${sniffed} refused, no converted copy: ${msg}`.slice(0, 200));
            res = await ask(copy);
          }
        } else {
          const copy = await convertedCopy(row.image_url);
          if (!copy) throw new Error(`file is ${sniffed} (${got.bytes.length} bytes), no converted copy`);
          res = await ask(copy);
        }
        if (res.stop_reason === 'refusal') {
          label = 'refused';
          reason = String(res.stop_details?.category ?? 'refused');
        } else {
          const text = res.content.find((c) => c.type === 'text');
          const out = parseAnswer(text && text.type === 'text' ? text.text : '');
          ({ label, minor_concern: minor, reason } = out);
        }
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
    const verdict = verdictFor(failed ? 'unchecked' : label, minor);
    await admin
      .from('image_reviews')
      .update({ status: 'done', label: failed ? 'unchecked' : label, minor_concern: minor, reason, model: REVIEW_MODEL, checked_at: new Date().toISOString(), sha256: fp?.sha256 ?? null, dhash: fp?.dhash ?? null })
      .eq('id', row.id);
    // Remember a newly flagged picture, so its copies and re-uploads are held without a new check.
    if (verdict === 'flagged' && fp) {
      await admin.from('flagged_images').upsert({ sha256: fp.sha256, dhash: fp.dhash, label, first_review_id: row.id }, { onConflict: 'sha256', ignoreDuplicates: true });
    }
    // Only while the slot still holds the image that was checked.
    await admin
      .from('binder_slots')
      .update({ image_review: verdict, image_reviewed_at: new Date().toISOString(), image_review_label: failed ? 'unchecked' : label })
      .eq('id', row.slot_id)
      .eq('image_url', row.image_url);
    tally[verdict === 'approved' ? 'approved' : verdict === 'flagged' ? 'flagged' : 'unchecked']++;
  }
  await notifyAdmin(admin);
  return json({ ok: true, ...tally });
});
