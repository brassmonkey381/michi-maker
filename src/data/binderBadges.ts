/**
 * Little badges that say a binder is HIGH IN SOME QUALITY — shown on Discover tiles and on the
 * binder page.
 *
 * A badge is only worth pixels if it discriminates. Two candidates were measured against the live
 * public binders and cut for failing that, and they are recorded here so nobody re-proposes them:
 *
 *   COMPLETE (pockets filled >= 90%)  22 of 26 binders qualified. A badge almost everyone wears
 *                                     tells a reader nothing; it is decoration.
 *   LOVED    (likes >= 3)             1 of 26. Likes are near-universally zero today, so the
 *                                     badge would be dead code. Revisit if liking takes off —
 *                                     and note the like COUNT is already on the tile anyway.
 *
 * The three that survived each land on 3-4 of 26, which is the point: rare enough to mean
 * something, common enough to appear. THE THRESHOLDS ARE HARDCODED and deliberately so for now —
 * when the corpus grows they will need re-checking against the distribution rather than intuition,
 * because the same numbers will drift from "rare" to either "everyone" or "nobody".
 */
import type { DemoBinder, DemoSlot } from './binderTypes';

export interface BinderBadge {
  key: 'artistic' | 'new' | 'deep';
  label: string;
  /** One-line explanation, for a title/accessibility hint. */
  hint: string;
}

/** Custom artwork must be at least this share of the filled pockets. */
export const ARTISTIC_MIN_ART_SHARE = 0.3;
/** Public for at most this many days. */
export const NEW_MAX_AGE_DAYS = 14;
/** At least this many cards placed. */
export const DEEP_MIN_CARDS = 100;

const DAY_MS = 86_400_000;

/** Pockets a slot occupies. A sliced artwork across three pockets is three pockets of art. */
const span = (s: DemoSlot) => Math.max(1, s.rowSpan || 1) * Math.max(1, s.colSpan || 1);

/** A slot holding custom artwork rather than a catalogue card. */
const isArt = (s: DemoSlot) => !s.cardId && s.type === 'artwork' && !!s.imageUrl;

/**
 * Counted in POCKETS, not slots, so a single artwork sliced across a row weighs what it visually
 * occupies. Measured against FILLED pockets rather than the whole page: a half-empty page of pure
 * art is still an artistic page, and dividing by total pockets would punish it for being unfinished.
 */
export function artShare(binder: DemoBinder): number {
  let filled = 0;
  let art = 0;
  for (const page of binder.pages) {
    for (const slot of page.slots) {
      if (!slot.cardId && !slot.imageUrl) continue;
      const n = span(slot);
      filled += n;
      if (isArt(slot)) art += n;
    }
  }
  return filled === 0 ? 0 : art / filled;
}

/** Cards placed across the whole binder (artwork panels are not cards). */
export function cardCount(binder: DemoBinder): number {
  return binder.pages.reduce((n, p) => n + p.slots.filter((s) => !!s.cardId).length, 0);
}

/**
 * Every badge this binder has earned, most distinctive first.
 *
 * `now` is a parameter rather than read from the clock so this stays pure and testable — the
 * alternative is a test that passes today and fails in a fortnight.
 */
export function binderBadges(binder: DemoBinder, now: number = Date.now()): BinderBadge[] {
  const out: BinderBadge[] = [];

  if (artShare(binder) >= ARTISTIC_MIN_ART_SHARE) {
    out.push({
      key: 'artistic',
      label: 'Artistic',
      hint: 'Mostly custom artwork rather than cards',
    });
  }

  // Only a binder that has actually been made public can be new. A local or example binder has no
  // made_public_at and must not be badged; a future timestamp (clock skew) is treated as brand new.
  if (binder.madePublicAt) {
    const age = (now - Date.parse(binder.madePublicAt)) / DAY_MS;
    if (!Number.isNaN(age) && age <= NEW_MAX_AGE_DAYS) {
      out.push({ key: 'new', label: 'New', hint: `Made public in the last ${NEW_MAX_AGE_DAYS} days` });
    }
  }

  if (cardCount(binder) >= DEEP_MIN_CARDS) {
    out.push({
      key: 'deep',
      label: 'Deep',
      hint: `${DEEP_MIN_CARDS}+ cards — plenty to explore`,
    });
  }

  return out;
}
