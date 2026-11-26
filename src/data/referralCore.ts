/**
 * MIC-069: the pure part of the refer-a-friend client (no React Native, no Supabase), so
 * node --test can load it. See ./referrals.ts.
 */
/** The shape the server accepts (referral_codes.code). */
export function normalizeReferralCode(raw: unknown): string | null {
  const c = String(raw ?? '').trim().toLowerCase();
  return /^[a-z0-9]{6,16}$/.test(c) ? c : null;
}

export type ReferralStatus = 'pending' | 'trialled' | 'paid' | 'voided';

export interface ReferralSummary {
  /** Null until the account has asked for its link once. */
  code: string | null;
  invites: { status: ReferralStatus; createdAt: string }[];
  creditsLeft: number;
  creditsUsed: number;
  /** When THIS account was invited: where its referral stands (drives the refund warning). */
  invitedStatus: ReferralStatus | null;
}

/** Pure: the server's jsonb into the client shape. Tolerant of missing fields. */
export function parseReferralSummary(raw: unknown): ReferralSummary {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const statuses = new Set<ReferralStatus>(['pending', 'trialled', 'paid', 'voided']);
  const asStatus = (v: unknown): ReferralStatus | null =>
    typeof v === 'string' && statuses.has(v as ReferralStatus) ? (v as ReferralStatus) : null;
  const invites = Array.isArray(r.invites) ? r.invites : [];
  return {
    code: typeof r.code === 'string' ? r.code : null,
    invites: invites
      .map((i) => {
        const o = (i ?? {}) as Record<string, unknown>;
        const status = asStatus(o.status);
        return status ? { status, createdAt: String(o.created_at ?? '') } : null;
      })
      .filter((i): i is { status: ReferralStatus; createdAt: string } => i !== null),
    creditsLeft: Number(r.credits_left ?? 0) || 0,
    creditsUsed: Number(r.credits_used ?? 0) || 0,
    invitedStatus: asStatus(r.invited_status),
  };
}

/** Counts for the invite page: friends who started a trial, and friends who paid. */
export function referralCounts(invites: ReferralSummary['invites']): { trialled: number; paid: number } {
  let trialled = 0;
  let paid = 0;
  for (const i of invites) {
    if (i.status === 'trialled' || i.status === 'paid' || i.status === 'voided') trialled += 1;
    if (i.status === 'paid') paid += 1;
  }
  return { trialled, paid };
}

