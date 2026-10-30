/**
 * A FEW FREE TASTES of each PRO feature for a FREE account (owner, 2026-10-29: "one free taste ...
 * for most of the PRO features, printing excluded"; 2026-10-30: three, and one for guests on the
 * server-lookup features, see TASTE_CAP).
 *
 * WHAT A TASTE IS (TASTE_KIND, owner 2026-10-30: "why is it constrained to visits and not
 * individual uses?"). Two kinds:
 *   use    the feature is an action (Find similar, a Fill or Complete run): one taste is ONE USE,
 *          and the lock never lifts. Each tap spends a sample until the cap, then the wall.
 *   visit  the feature is a switch (covers, soundtracks, art views, advanced search filters): one
 *          taste lifts the lock for the rest of that visit (until the page is left or reloaded).
 * Either way the moment is recorded on the device and on the profile and taste.used { feature,
 * surface } is tracked. The record is monotone, so a second device learns of a taste taken on the
 * first and never hands out another.
 *
 * WHICH FEATURES, AND WHICH NOT.
 *   findSimilar     ≈ Find similar, everywhere it appears (home, shelf, browser, editor, sheets).
 *   advancedSearch  the browser's value sort, price filters, similarity refine and colour search.
 *   binderCovers    named binders, hardware and covers (the inspector's binder section, the shelf).
 *   binderTracks    binder and page soundtracks.
 *   artViews        art views on a binder, a page or a pocket.
 *   fillPage        Fill page AND Complete page, one feature (owner, 2026-10-30: "Fill is the same as
 *                   complete so make sure they are both on the same taste caps"). A guest's one
 *                   fill runs on a server slice (data/guestFill), then the free-account wall. A
 *                   free account runs the catalogue fills freely and spends this on Complete's
 *                   server lookups, Same theme and Like the whole page (owner: "3 free uses max").
 *                   The Fill sheet's similarity methods spend findSimilar, as everywhere else.
 *   -- themeSearch: NOT here. Free accounts already run every theme query and get the top matches;
 *      the rest is withheld by the data server's meter, which this device cannot lift. A taste of
 *      the full result set is a server change (my_cap_tier), not a client one.
 *   -- fullPrint / included prints: excluded by the owner. Printing is the thing people pay for.
 *   -- multiPageCompose (Pages around this card, Story binder): VIP, not PRO.
 *   -- the binder, page and artwork caps: counts, not switches; a taste of "one more" is a cap.
 *
 * GUESTS TASTE ONLY SERVER LOOKUPS (GUEST_TASTE_FEATURES, owner 2026-10-30): one of each, so the
 * walkthrough can show Find similar and a filled page working before the account ask. Everything
 * else needs the signed-in catalogue and waits for the free account. Paid tiers never see a taste because they are
 * never locked.
 *
 * Pure: no React, no storage. The hook (hooks/use-tastes) and the device copy (lib/tasteSeen) sit
 * on top, so this file is reachable from `node --test`.
 */
import type { Tier } from './tiers';

export const TASTE_FEATURES = ['findSimilar', 'advancedSearch', 'binderCovers', 'binderTracks', 'artViews', 'fillPage'] as const;
export type TasteFeature = (typeof TASTE_FEATURES)[number];

export const TASTE_LABEL: Record<TasteFeature, string> = {
  findSimilar: 'Find similar',
  advancedSearch: 'Advanced search',
  binderCovers: 'Binder covers',
  binderTracks: 'Binder soundtracks',
  artViews: 'Art views',
  fillPage: 'Fill page',
};

/** Which features are counted per use and which lift for a visit (see the header). */
export const TASTE_KIND: Record<TasteFeature, 'use' | 'visit'> = {
  findSimilar: 'use',
  fillPage: 'use',
  advancedSearch: 'visit',
  binderCovers: 'visit',
  binderTracks: 'visit',
  artViews: 'visit',
};

/**
 * HOW MANY TASTES (owner, 2026-10-30): a guest gets 1 of each server lookup; a free account gets 3
 * uses of each action feature ("3 fills or searches for free accounts", and Complete's theme and
 * similar fills "need 3 free uses max too") and ONE visit-long unlock of each switch feature.
 */
export const TASTE_CAP: Record<'use' | 'visit', Partial<Record<Tier, number>>> = {
  use: { guest: 1, free: 3 },
  visit: { free: 1 },
};

/**
 * WHAT A GUEST MAY TASTE: only what runs as a server lookup, because a guest never receives the
 * catalogue (DATA-PROTECTION-PLAN; use-catalog guestGated). Find similar is a data-server RPC that
 * returns ids, so it qualifies, and so does a fill since 2026-10-30, run over a slice the server
 * hands back (data/guestFill); covers, soundtracks, art views and the advanced search filters all
 * need the signed-in catalogue or the account, and stay behind the free account.
 */
export const GUEST_TASTE_FEATURES: readonly TasteFeature[] = ['findSimilar', 'fillPage'];

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
  const cap = TASTE_CAP[TASTE_KIND[feature]][tier] ?? 0;
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
export function tasteToast(
  feature: TasteFeature,
  tier: Tier = 'free',
  left = 0,
  /** What to call the feature; the fill toast passes "Fill Same Pokemon" (owner, 2026-10-30). */
  label: string = TASTE_LABEL[feature],
): string {
  // SHORT. A pill lives 5 seconds (owner, 2026-10-30: "too much to read, for how short they last").
  // The guest line is the owner's own words: "Keep using Find similar with a free account".
  if (tier === 'guest') return `Keep using ${label} with a free account`;
  // Same shape for a free account (owner, 2026-10-30: never "is free this visit"), with the PRO
  // trial as the way to keep it. "samples remaining", never "tastes" in anything a person reads.
  const count = left > 0 ? ` (${left} ${left === 1 ? 'sample' : 'samples'} remaining)` : '';
  return `Try PRO for FREE to keep using ${label}${count}`;
}

/** The wall a GUEST meets once their taste is gone (owner, 2026-10-30): the free account, and nothing about plans. */
export function guestTasteWall(feature: TasteFeature): string {
  return `Create a free account to keep using ${TASTE_LABEL[feature]}.`;
}
