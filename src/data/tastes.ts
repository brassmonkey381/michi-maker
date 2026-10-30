/**
 * A FEW FREE TASTES of each PRO feature for a FREE account (owner, 2026-10-29: "one free taste ...
 * for most of the PRO features, printing excluded"; 2026-10-30: three, and one for guests on the
 * server-lookup features, see TASTE_CAP).
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
 * GUESTS TASTE ONLY SERVER LOOKUPS (GUEST_TASTE_FEATURES, owner 2026-10-30): one of each, so the
 * walkthrough can show Find similar working before the account ask. Everything else needs the
 * signed-in catalogue and waits for the free account. Paid tiers never see a taste because they are
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

/**
 * HOW MANY TASTES (owner, 2026-10-30: "give them a cap of 3 per feature instead of 1", and guests
 * "a one shot taste" of the features that are server lookups). A taste is still one visit's unlock;
 * the cap is how many visits may take one.
 */
export const TASTE_CAP: Partial<Record<Tier, number>> = { guest: 1, free: 3 };

/**
 * WHAT A GUEST MAY TASTE: only what runs as a server lookup, because a guest never receives the
 * catalogue (DATA-PROTECTION-PLAN; use-catalog guestGated). Find similar is a data-server RPC that
 * returns ids, so it qualifies; covers, soundtracks, art views and the advanced search filters
 * all need the signed-in catalogue or the account, and stay behind the free account.
 */
export const GUEST_TASTE_FEATURES: readonly TasteFeature[] = ['findSimilar'];

/**
 * The persisted shape: when each taste was taken, every time, oldest first. Version 2 (2026-10-30)
 * counts; the version-1 record held one time per feature and is read as nothing tasted, which is
 * the reset the owner asked for when the cap went from one to three.
 */
export interface TasteRecord {
  v: 2;
  used: Partial<Record<TasteFeature, string[]>>;
}

export const EMPTY_TASTES: TasteRecord = { v: 2, used: {} };

const isFeature = (k: string): k is TasteFeature => (TASTE_FEATURES as readonly string[]).includes(k);

/** Anything from storage or the profile bag into a record; junk, and the old v1 shape, read as "nothing tasted". */
export function normalizeTastes(raw: unknown): TasteRecord {
  const used: TasteRecord['used'] = {};
  if (raw && typeof raw === 'object' && (raw as { v?: unknown }).v === 2) {
    const bag = (raw as { used?: unknown }).used;
    if (bag && typeof bag === 'object') {
      for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
        if (!isFeature(k) || !Array.isArray(v)) continue;
        const times = [...new Set(v.filter((t): t is string => typeof t === 'string' && !!t))].sort();
        if (times.length) used[k] = times;
      }
    }
  }
  return { v: 2, used };
}

/** Union of two records: every taste either knows of, once. Monotone in both. */
export function mergeTastes(a: TasteRecord, b: TasteRecord): TasteRecord {
  const used: TasteRecord['used'] = {};
  for (const f of TASTE_FEATURES) {
    const all = [...new Set([...(a.used[f] ?? []), ...(b.used[f] ?? [])])].sort();
    if (all.length) used[f] = all;
  }
  return { v: 2, used };
}

/** How many tastes of `feature` are taken. */
export function tastesTaken(record: TasteRecord, feature: TasteFeature): number {
  return record.used[feature]?.length ?? 0;
}

/** How many tastes of `feature` this tier may still take; 0 for a tier that never tastes. */
export function tastesLeft(tier: Tier, record: TasteRecord, feature: TasteFeature): number {
  const cap = TASTE_CAP[tier] ?? 0;
  if (tier === 'guest' && !GUEST_TASTE_FEATURES.includes(feature)) return 0;
  return Math.max(0, cap - tastesTaken(record, feature));
}

/** Is a taste of `feature` on offer: a free account under its cap, or a guest on a server-lookup feature who has not had theirs. */
export function tasteOffered(tier: Tier, record: TasteRecord, feature: TasteFeature): boolean {
  return tastesLeft(tier, record, feature) > 0;
}

/** The record after a taste of `feature` taken now. */
export function takeTaste(record: TasteRecord, feature: TasteFeature, at = new Date().toISOString()): TasteRecord {
  return { v: 2, used: { ...record.used, [feature]: [...(record.used[feature] ?? []), at] } };
}

/**
 * What the toast says the moment a taste is taken. Names the feature and the terms, once. A guest
 * is never told what PRO holds (owner, 2026-10-29): their line is the free account. `left` is how
 * many tastes remain AFTER this one.
 */
export function tasteToast(feature: TasteFeature, tier: Tier = 'free', left = 0): string {
  // Plain words for a one-visit unlock (owner, 2026-10-29: "until I leave" read as a riddle).
  const head = `${TASTE_LABEL[feature]} is yours free for this visit`;
  if (tier === 'guest') return `${head}. Create a free account to keep using it.`;
  const count = left > 0 ? ` (${left} more ${left === 1 ? 'taste' : 'tastes'} after this)` : '';
  return `${head}${count}. Try PRO for FREE to keep it.`;
}

/** The wall a GUEST meets once their taste is gone (owner, 2026-10-30): the free account, and nothing about plans. */
export function guestTasteWall(feature: TasteFeature): string {
  return `Create a free account to keep using ${TASTE_LABEL[feature]}.`;
}
