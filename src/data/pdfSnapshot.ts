/**
 * Snapshot semantics for the one-time binder PDF (`pdf_binder:<id>`): the purchase buys the PDF
 * of the binder AS IT IS WHEN THE PURCHASE IS SPENT (first download), forever — not future edits.
 * Otherwise a single $3.99 unlock would be an all-you-can-print pass (edit → reprint → repeat).
 *
 * Mechanics (see supabase/migrations/20260716235900_binder_pdf_snapshots.sql):
 *  - SPEND: on the first download after a purchase we record the binder's content FINGERPRINT
 *    (SHA-256 of {layoutStyle, pages}) in `binder_pdf_snapshots` and archive the generated PDF's
 *    bytes in the private `binder-pdfs` bucket (`<uid>/<binderId>.pdf`).
 *  - While the binder still matches the fingerprint, the PDF can be re-downloaded freely (it's
 *    the same document).
 *  - After an EDIT the fingerprint no longer matches: the archived purchased version stays
 *    downloadable forever, but printing the edited version needs a new purchase (the webhook
 *    bumps entitlements.granted_at, which re-arms the spend) or a PRO/VIP plan.
 *
 * The PDF is generated client-side, so this is honest-UI gating — the client is inherently
 * trusted here; the goal is keeping honest users honest, same as every client-side gate.
 */
import type { DemoBinder } from '@/data/binderTypes';
import { fetchEntitlementDetails } from '@/data/entitlementRepo';
import { requireSupabase } from '@/lib/supabase';

const BUCKET = 'binder-pdfs';

/** JSON.stringify with sorted object keys — a stable serialization for hashing. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * SHA-256 hex of the binder's PRINTABLE content — layout + pages (slots, cards, art, colors,
 * captions). Deliberately excludes presentation-only fields that live off `pages` (title, likes,
 * visibility): renaming a binder is not an edit of what prints.
 */
export async function binderFingerprint(binder: DemoBinder): Promise<string> {
  const payload = stableStringify({ layoutStyle: binder.layoutStyle, pages: binder.pages });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type PurchaseState =
  /** Purchase not yet spent (no snapshot, or re-purchased since) — next download spends it. */
  | 'unspent'
  /** Binder still matches the purchased version — download freely. */
  | 'current'
  /** Binder edited since purchase — only the archived purchased version is downloadable. */
  | 'edited';

/**
 * Resolve where this binder's purchase stands. `unspent` when there's no snapshot yet OR the
 * `pdf_binder:<id>` grant is newer than the recorded spend (a re-purchase re-arms).
 */
export async function purchaseState(binder: DemoBinder): Promise<PurchaseState> {
  const supabase = requireSupabase();
  const [{ data: snap }, details, fingerprint] = await Promise.all([
    supabase
      .from('binder_pdf_snapshots')
      .select('fingerprint, updated_at')
      .eq('binder_id', binder.id)
      .maybeSingle(),
    fetchEntitlementDetails(),
    binderFingerprint(binder),
  ]);
  if (!snap) return 'unspent';
  const grant = details.find((d) => d.product === `pdf_binder:${binder.id}`);
  if (grant?.grantedAt && Date.parse(grant.grantedAt) > Date.parse(snap.updated_at)) {
    return 'unspent'; // bought again after the last spend — re-armed
  }
  return snap.fingerprint === fingerprint ? 'current' : 'edited';
}

/**
 * Spend the purchase on the binder's CURRENT version: record its fingerprint and archive the
 * generated PDF bytes so this exact document stays downloadable forever. Archive-upload failure
 * is non-fatal (the user already has their PDF; re-downloading while unedited regenerates it).
 */
export async function spendPurchase(binder: DemoBinder, pdfBytes: Uint8Array, sheets: number): Promise<void> {
  const supabase = requireSupabase();
  const fingerprint = await binderFingerprint(binder);
  const uid = (await supabase.auth.getSession()).data.session?.user?.id;
  if (!uid) return;
  await supabase
    .from('binder_pdf_snapshots')
    .upsert(
      { user_id: uid, binder_id: binder.id, fingerprint, sheets, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,binder_id' },
    );
  await supabase.storage
    .from(BUCKET)
    .upload(`${uid}/${binder.id}.pdf`, new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
      upsert: true,
    })
    .catch(() => {}); // best-effort archive
}

/** The archived purchased-version PDF bytes, or null if never archived. */
export async function downloadPurchasedPdf(binderId: string): Promise<Blob | null> {
  const supabase = requireSupabase();
  const uid = (await supabase.auth.getSession()).data.session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase.storage.from(BUCKET).download(`${uid}/${binderId}.pdf`);
  return data ?? null;
}
