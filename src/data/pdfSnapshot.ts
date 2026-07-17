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
  /** An unspent purchase is waiting (no versions yet, or re-purchased since the last spend). */
  | 'unspent'
  /** Binder currently matches one of the purchased versions — download freely. */
  | 'current'
  /** Binder edited past every purchased version — only the archived versions are downloadable. */
  | 'edited';

/** One purchased (spent) version of a binder's PDF — downloadable forever. */
export interface PurchasedVersion {
  fingerprint: string;
  /** binder-pdfs bucket key of the archived bytes (null only if the archive upload failed). */
  pdfPath: string | null;
  sheets: number | null;
  /** ISO timestamp the purchase was spent on this version. */
  spentAt: string;
}

export interface PurchaseStatus {
  state: PurchaseState;
  /** Every purchased version, newest first — each one stays downloadable forever. */
  versions: PurchasedVersion[];
}

/**
 * Resolve where this binder's purchase stands. `unspent` when there are no versions yet OR the
 * `pdf_binder:<id>` grant is newer than the latest spend (a re-purchase re-arms); `current` when
 * the binder matches ANY purchased version (that document is already paid for).
 */
export async function purchaseStatus(binder: DemoBinder): Promise<PurchaseStatus> {
  const supabase = requireSupabase();
  const [{ data: rows }, details, fingerprint] = await Promise.all([
    supabase
      .from('binder_pdf_snapshots')
      .select('fingerprint, pdf_path, sheets, updated_at')
      .eq('binder_id', binder.id)
      .order('updated_at', { ascending: false }),
    fetchEntitlementDetails(),
    binderFingerprint(binder),
  ]);
  const versions: PurchasedVersion[] = (rows ?? []).map((r) => ({
    fingerprint: r.fingerprint,
    pdfPath: r.pdf_path,
    sheets: r.sheets,
    spentAt: r.updated_at,
  }));
  if (versions.length === 0) return { state: 'unspent', versions };
  const grant = details.find((d) => d.product === `pdf_binder:${binder.id}`);
  if (grant?.grantedAt && Date.parse(grant.grantedAt) > Date.parse(versions[0].spentAt)) {
    return { state: 'unspent', versions }; // bought again after the last spend — re-armed
  }
  return { state: versions.some((v) => v.fingerprint === fingerprint) ? 'current' : 'edited', versions };
}

/**
 * Spend the purchase on the binder's CURRENT version: record it as a new purchased version and
 * archive the generated PDF bytes at a version-specific path so this exact document stays
 * downloadable forever (alongside every previously purchased version). Returns the new version.
 * Archive-upload failure is non-fatal (the user already has their PDF; re-downloading while the
 * binder still matches regenerates it).
 */
export async function spendPurchase(
  binder: DemoBinder,
  pdfBytes: Uint8Array,
  sheets: number,
): Promise<PurchasedVersion | null> {
  const supabase = requireSupabase();
  const fingerprint = await binderFingerprint(binder);
  const uid = (await supabase.auth.getSession()).data.session?.user?.id;
  if (!uid) return null;
  const pdfPath = `${uid}/${binder.id}-${fingerprint.slice(0, 16)}.pdf`;
  const spentAt = new Date().toISOString();
  await supabase
    .from('binder_pdf_snapshots')
    .upsert(
      { user_id: uid, binder_id: binder.id, fingerprint, sheets, pdf_path: pdfPath, updated_at: spentAt },
      { onConflict: 'user_id,binder_id,fingerprint' },
    );
  await supabase.storage
    .from(BUCKET)
    .upload(pdfPath, new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
      upsert: true,
    })
    .catch(() => {}); // best-effort archive
  return { fingerprint, pdfPath, sheets, spentAt };
}

/** The archived bytes of one purchased version, or null if the archive is missing. */
export async function downloadPurchasedPdf(version: PurchasedVersion): Promise<Blob | null> {
  if (!version.pdfPath) return null;
  const supabase = requireSupabase();
  const { data } = await supabase.storage.from(BUCKET).download(version.pdfPath);
  return data ?? null;
}
