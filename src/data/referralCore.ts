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

/** Where a free print code stands. 'making' = granted, its checkout code not minted yet. */
export type PrintCodeState = 'making' | 'ready' | 'redeemed' | 'expired' | 'voided';

/** Why a code was given. The last two arrive with the holiday items (MIC-073, MIC-074). */
export type PrintCodeReason = 'friend_trial' | 'friend_paid' | 'paid_with_invite' | 'subscriber_thanks' | 'holiday_gift';

export interface PrintCode {
  /** The 6-character checkout code; null while it is being made. */
  code: string | null;
  reason: PrintCodeReason;
  state: PrintCodeState;
  grantedAt: string;
  /** Null = never expires. */
  expiresAt: string | null;
  redeemedAt: string | null;
}

export interface ReferralSummary {
  /** Null until the account has asked for its link once. */
  code: string | null;
  invites: { status: ReferralStatus; createdAt: string }[];
  /** Every free print code this account was given, newest first. */
  printCodes: PrintCode[];
  /** When THIS account was invited: where its referral stands (drives the refund warning). */
  invitedStatus: ReferralStatus | null;
}

const STATUSES = new Set<ReferralStatus>(['pending', 'trialled', 'paid', 'voided']);
const STATES = new Set<PrintCodeState>(['making', 'ready', 'redeemed', 'expired', 'voided']);
const REASONS = new Set<PrintCodeReason>(['friend_trial', 'friend_paid', 'paid_with_invite', 'subscriber_thanks', 'holiday_gift']);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Pure: the server's jsonb into the client shape. Tolerant of missing fields. */
export function parseReferralSummary(raw: unknown): ReferralSummary {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const asStatus = (v: unknown): ReferralStatus | null =>
    typeof v === 'string' && STATUSES.has(v as ReferralStatus) ? (v as ReferralStatus) : null;
  const invites = Array.isArray(r.invites) ? r.invites : [];
  const codes = Array.isArray(r.print_codes) ? r.print_codes : [];
  return {
    code: str(r.code),
    invites: invites
      .map((i) => {
        const o = (i ?? {}) as Record<string, unknown>;
        const status = asStatus(o.status);
        return status ? { status, createdAt: String(o.created_at ?? '') } : null;
      })
      .filter((i): i is { status: ReferralStatus; createdAt: string } => i !== null),
    printCodes: codes
      .map((c): PrintCode | null => {
        const o = (c ?? {}) as Record<string, unknown>;
        const state = o.state as PrintCodeState;
        const reason = o.reason as PrintCodeReason;
        if (!STATES.has(state) || !REASONS.has(reason)) return null;
        const code = str(o.code);
        return {
          code: code && /^[A-Z0-9]{6}$/.test(code) ? code : null,
          reason,
          state,
          grantedAt: String(o.granted_at ?? ''),
          expiresAt: str(o.expires_at),
          redeemedAt: str(o.redeemed_at),
        };
      })
      .filter((c): c is PrintCode => c !== null),
    invitedStatus: asStatus(r.invited_status),
  };
}

/** Counts for the invite page: friends who started a trial, friends who paid, codes ready to use. */
export function referralCounts(summary: Pick<ReferralSummary, 'invites' | 'printCodes'>): {
  trialled: number;
  paid: number;
  ready: number;
} {
  let trialled = 0;
  let paid = 0;
  for (const i of summary.invites) {
    if (i.status === 'trialled' || i.status === 'paid' || i.status === 'voided') trialled += 1;
    if (i.status === 'paid') paid += 1;
  }
  const ready = summary.printCodes.filter((c) => c.state === 'ready' || c.state === 'making').length;
  return { trialled, paid, ready };
}

/** What a code's status line says, in the reader's words. `fmt` formats a date for display. */
export function printCodeStatusText(c: PrintCode, fmt: (iso: string) => string): string {
  switch (c.state) {
    case 'making':
      return 'Being made, check back in a minute';
    case 'redeemed':
      return c.redeemedAt ? `Used ${fmt(c.redeemedAt)}` : 'Used';
    case 'expired':
      return c.expiresAt ? `Expired ${fmt(c.expiresAt)}` : 'Expired';
    case 'voided':
      return 'Removed after a refund';
    default:
      return c.expiresAt ? `Not used yet · expires ${fmt(c.expiresAt)}` : 'Not used yet · never expires';
  }
}

/** Where a code came from, in the reader's words. */
export function printCodeReasonText(reason: PrintCodeReason): string {
  switch (reason) {
    case 'friend_trial':
      return 'A friend started the free trial';
    case 'friend_paid':
      return 'A friend you invited became a paying subscriber';
    case 'paid_with_invite':
      return 'You joined through a friend’s invite';
    case 'subscriber_thanks':
      return 'Thank you for subscribing';
    case 'holiday_gift':
      return 'Holiday gift';
  }
}
