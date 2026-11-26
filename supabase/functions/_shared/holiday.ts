/**
 * MIC-073: WHO GETS THE HOLIDAY TRIAL (owner picks A and B, 2026-11-25). The authority; the app
 * only asks (stripe-checkout action "holiday_status") so it can show the right button.
 *
 * Eligible = michi PRO/VIP never PAID for, and no michi subscription running right now:
 *   - a past 3-day trialist is eligible again (pick A), even though their old checkout trial left
 *     an entitlement row with source 'stripe' and a cancelled subscription behind;
 *   - someone trialling or subscribed now is not (pick B leaves current trials alone);
 *   - "paid" = any paid invoice above $0 on a michi or bundle subscription, any Apple or manual
 *     michi grant, or a Founder (lifetime) row.
 * Fail-closed: any read error means "not eligible", so an outage can never hand out free months.
 */
import type Stripe from 'npm:stripe@18.5.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const MICHI_PRODUCTS = ['tier_pro', 'tier_vip'];
const MICHI_KEYS = ['michi_pro', 'michi_vip'];
const isMichiKey = (k: string) => MICHI_KEYS.some((p) => k.startsWith(p)) || k.includes('bundle');

export async function holidayEligible(
  stripe: Stripe,
  service: SupabaseClient,
  userId: string,
  customerId: string | null | undefined,
): Promise<boolean> {
  try {
    const { data: rows, error } = await service
      .from('entitlements')
      .select('product, source, interval')
      .eq('user_id', userId)
      .in('product', MICHI_PRODUCTS);
    if (error) return false;
    // Apple, manual and Founder grants are paid (or comped) membership: never a free holiday.
    if ((rows ?? []).some((r) => (r.source !== 'trial' && r.source !== 'stripe') || r.interval === 'lifetime')) return false;
    if (!customerId) return true; // never reached Stripe checkout: nothing paid there

    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    const mine = subs.data.filter((s) => isMichiKey(s.items?.data?.[0]?.price?.lookup_key ?? ''));
    if (mine.some((s) => ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(s.status))) return false;
    if (!mine.length) return true;

    const ids = new Set(mine.map((s) => s.id));
    const invoices = await stripe.invoices.list({ customer: customerId, status: 'paid', limit: 100 });
    for (const inv of invoices.data) {
      if ((inv.amount_paid ?? 0) <= 0) continue;
      const legacy = (inv as unknown as { subscription?: string | { id: string } }).subscription;
      const modern = (inv as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } })
        .parent?.subscription_details?.subscription;
      const ref = legacy ?? modern;
      const subId = typeof ref === 'string' ? ref : ref?.id;
      if (subId && ids.has(subId)) return false;
    }
    return true;
  } catch (e) {
    console.error('holiday eligibility unread', (e as Error).message);
    return false;
  }
}
