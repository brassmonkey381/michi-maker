/**
 * ONE FREE TASTE of each PRO feature for a FREE account (owner, 2026-10-29: "one free taste ...
 * for most of the PRO features, printing excluded").
 *
 * WHAT A TASTE IS. The first time a free account taps a locked PRO control, the lock lifts for the
 * rest of that visit (until the page is left or reloaded), the moment is recorded on the device and
 * on the profile, and taste.used { feature, surface } is tracked. The next visit meets the normal
 * wall. One taste per feature per account, ever; the record is monotone, so a second device learns
 * of a taste taken on the first and never hands out another.
 *
 * WHICH FEATURES, AND WHICH NOT.
 *   findSimilar     ≈ Find similar, everywhere it appears (home, shelf, browser, editor, sheets).
 *   advancedSearch  the browser's value sort, price filters, similarity refine and colour search.
 *   binderCovers    named binders, hardware and covers (the inspector's binder section, the shelf).
 *   binderTracks    binder and page soundtracks.
 *   artViews        art views on a binder, a page or a pocket.
 *   -- themeSearch: NOT here. Free accounts already run every theme query and get the top matches;
 *      the rest is withheld by the data server's meter, which this device cannot lift. A taste of
 *      the full result set is a server change (my_cap_tier), not a client one.
 *   -- fullPrint / included prints: excluded by the owner. Printing is the thing people pay for.
 *   -- multiPageCompose (Pages around this card, Story binder): VIP, not PRO.
 *   -- the binder, page and artwork caps: counts, not switches; a taste of "one more" is a cap.
 *
 * GUESTS GET NO TASTE. Their first step is the free account (SignInPerk); every catalog-backed
 * feature above needs the signed-in catalog anyway. Paid tiers never see a taste because they are
 * never locked.
 *
 * Pure: no React, no storage. The hook (hooks/use-tastes) and the device copy (lib/tasteSeen) sit
 * on top, so this file is reachable from `node --test`.
 */
import type { Tier } from './tiers';

export const TASTE_FEATURES = ['findSimilar', 'advancedSearch', 'binderCovers', 'binderTracks', 'artViews'] as const;
export type TasteFeature = (typeof TASTE_FEATURES)[number];

export const TASTE_LABEL: Record<TasteFeature, string> = {
  findSimilar: 'Find similar',
  advancedSearch: 'Advanced search',
  binderCovers: 'Binder covers',
  binderTracks: 'Binder soundtracks',
  artViews: 'Art views',
};

/** The persisted shape: when each taste was taken (ISO time), nothing else. */
export interface TasteRecord {
  v: 1;
  used: Partial<Record<TasteFeature, string>>;
}

export const EMPTY_TASTES: TasteRecord = { v: 1, used: {} };

const isFeature = (k: string): k is TasteFeature => (TASTE_FEATURES as readonly string[]).includes(k);

/** Anything from storage or the profile bag into a record; junk reads as "nothing tasted". */
export function normalizeTastes(raw: unknown): TasteRecord {
  const used: TasteRecord['used'] = {};
  if (raw && typeof raw === 'object') {
    const bag = (raw as { used?: unknown }).used;
    if (bag && typeof bag === 'object') {
      for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
        if (isFeature(k) && typeof v === 'string' && v) used[k] = v;
      }
    }
  }
  return { v: 1, used };
}

/** Union of two records, keeping the EARLIER time where both know of a taste. Monotone in both. */
export function mergeTastes(a: TasteRecord, b: TasteRecord): TasteRecord {
  const used: TasteRecord['used'] = { ...a.used };
  for (const f of TASTE_FEATURES) {
    const x = a.used[f];
    const y = b.used[f];
    if (y && (!x || y < x)) used[f] = y;
  }
  return { v: 1, used };
}

/** Is a taste of `feature` on offer: a free account that has not taken it. */
export function tasteOffered(tier: Tier, record: TasteRecord, feature: TasteFeature): boolean {
  return tier === 'free' && !record.used[feature];
}

/** What the toast says the moment a taste is taken. Names the feature and the terms, once. */
export function tasteToast(feature: TasteFeature): string {
  // Plain words for a one-visit unlock (owner, 2026-10-29: "until I leave" read as a riddle).
  return `${TASTE_LABEL[feature]} is yours free for this visit. Try PRO for FREE to keep it.`;
}
