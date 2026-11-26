/**
 * MIC-069: FREE PRINT CODES. Every free binder PDF (an invite reward, and later the holiday
 * thank-you and gift codes) is one row in public.print_credits and ONE Stripe promotion code:
 *   - 6 characters from an alphabet without look-alikes (no 0, O, 1, I, L), so a code copied off a
 *     post types back correctly;
 *   - 100% off, on a coupon that applies to the binder PDF product only, so it can never discount
 *     a plan or the bundle;
 *   - max_redemptions 1, no customer restriction (transferable, owner 2026-11-25);
 *   - the row's expires_at, if it has one.
 * The PDF checkout already sets allow_promotion_codes, and the webhook grants the unlock from a
 * completed session whatever its total, so a $0 order unlocks the binder exactly like a purchase.
 *
 * Minting is separate from granting on purpose: SQL grants the row atomically (and idempotently),
 * and this mints any row still without a code. A failed mint leaves the row "making"; the next
 * mint pass (another webhook, or /invite loading) finishes it. Nothing here throws to its caller.
 */
import type Stripe from 'npm:stripe@18.5.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const PRINT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const COUPON_ID = 'michi_free_print';
const PDF_LOOKUP_KEY = 'michi_binder_pdf';

export function randomPrintCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  // 256 % 31 leaves a small bias toward the first characters; harmless for a gift code.
  return Array.from(bytes, (b) => PRINT_CODE_ALPHABET[b % PRINT_CODE_ALPHABET.length]).join('');
}

/** The 100%-off coupon for the binder PDF product, made once with a fixed id. */
async function freePrintCoupon(stripe: Stripe): Promise<string> {
  try {
    const c = await stripe.coupons.retrieve(COUPON_ID);
    if (c && c.valid) return c.id;
  } catch {
    // not made yet
  }
  const prices = await stripe.prices.list({ lookup_keys: [PDF_LOOKUP_KEY], limit: 1 });
  const product = prices.data[0]?.product;
  const productId = typeof product === 'string' ? product : product?.id;
  if (!productId) throw new Error(`no price with lookup key ${PDF_LOOKUP_KEY}`);
  const made = await stripe.coupons.create({
    id: COUPON_ID,
    name: 'Free binder PDF',
    percent_off: 100,
    duration: 'once',
    applies_to: { products: [productId] },
  });
  return made.id;
}

type Row = { id: string; expires_at: string | null };

/**
 * Mint codes for rows that have none: the given user's, or (no user) the oldest 25 anywhere.
 * Returns how many were minted. Fail-soft.
 */
export async function mintPrintCodes(stripe: Stripe, service: SupabaseClient, userId?: string): Promise<number> {
  let q = service
    .from('print_credits')
    .select('id, expires_at')
    .is('code', null)
    .is('voided_at', null)
    .order('granted_at', { ascending: true })
    .limit(25);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error || !data?.length) return 0;
  let coupon: string;
  try {
    coupon = await freePrintCoupon(stripe);
  } catch (e) {
    console.error('free print coupon unavailable', (e as Error).message);
    return 0;
  }
  let minted = 0;
  for (const row of data as Row[]) {
    const expires = row.expires_at ? Math.floor(Date.parse(row.expires_at) / 1000) : undefined;
    if (expires !== undefined && expires <= Math.floor(Date.now() / 1000) + 60) continue; // already over
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomPrintCode();
      try {
        // Current API versions take the coupon under `promotion` (see scripts/stripe-owner-print-code.mjs).
        const promo = await stripe.promotionCodes.create({
          promotion: { type: 'coupon', coupon },
          code,
          max_redemptions: 1,
          ...(expires ? { expires_at: expires } : {}),
          metadata: { print_credit_id: row.id },
        } as unknown as Stripe.PromotionCodeCreateParams);
        const { error: upErr } = await service
          .from('print_credits')
          .update({ code, stripe_promotion_code_id: promo.id })
          .eq('id', row.id)
          .is('code', null);
        if (upErr) {
          // The row could not take it (a parallel mint got there first): retire this one.
          await stripe.promotionCodes.update(promo.id, { active: false }).catch(() => {});
        } else {
          minted += 1;
        }
        break;
      } catch (e) {
        const msg = (e as Error).message ?? '';
        if (/already exists|code.*in use|duplicate/i.test(msg)) continue; // collision: new code
        console.error('print code not minted', row.id, msg);
        break;
      }
    }
  }
  return minted;
}

/** Turn codes off in Stripe (a refund voided them). Fail-soft. */
export async function deactivatePrintCodes(stripe: Stripe, promotionCodeIds: (string | null)[]): Promise<void> {
  for (const id of promotionCodeIds) {
    if (!id) continue;
    await stripe.promotionCodes.update(id, { active: false }).catch((e: Error) =>
      console.error('print code not deactivated', id, e.message),
    );
  }
}
