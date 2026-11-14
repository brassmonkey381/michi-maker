/**
 * The colour of one row in Studio's Health panel (HealthPanel.tsx). Kept apart from the component
 * so the rules can be tested. Thresholds live here, not in the database: how long is too long is a
 * reading decision, and it differs per signal.
 */
const HOUR = 3_600_000;

export type Tone = 'ok' | 'warn' | 'bad';

export interface HealthToneRow {
  signal: string;
  at: string | null;
  detail: string;
}

/** Hours of silence after which a signal turns amber, then red (double). Unlisted: never. */
export const STALE_HOURS: Record<string, number> = {
  'Michi event recorded': 24,
  'TCGScan event recorded': 72,
  'Account created': 24 * 7,
  'Free trial started': 24 * 14,
  'Stripe webhook wrote': 24 * 30,
};

export function toneOf(r: HealthToneRow, nowMs = Date.now()): Tone {
  // MIC-029 gap 3: the image check can be quiet for days (nobody uploaded), so silence is not the
  // signal. image_review_stall() decides, and admin_health() starts the detail with 'Stalled:'.
  if (r.signal === 'Image check') return r.detail.startsWith('Stalled') ? 'bad' : 'ok';
  // A scheduled thing is judged by how much runway is left, not by when it was last touched.
  if (r.signal.startsWith('Daily puzzle')) {
    if (!r.at) return 'bad';
    const daysAhead = (Date.parse(r.at) - nowMs) / (24 * HOUR);
    return daysAhead < 1 ? 'bad' : daysAhead < 3 ? 'warn' : 'ok';
  }
  const limit = STALE_HOURS[r.signal];
  if (!limit) return 'ok';
  if (!r.at) return 'bad';
  const hours = (nowMs - Date.parse(r.at)) / HOUR;
  return hours > limit * 2 ? 'bad' : hours > limit ? 'warn' : 'ok';
}
