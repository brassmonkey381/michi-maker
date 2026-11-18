/**
 * MIC-059: ONE way to count "X of Y owned", so every place that shows it says the same number.
 *
 * The Set Binders preview, the Sets view of My collection, a binder tile on the My Binders shelf and
 * each page inside a built binder all count POCKETS: one per card the binder (or the set) has a place
 * for, owned when the account's `user_cards` holds that card id. A set's count is the pockets of
 * its "Complete set" with secret rares in (the Set Binders default), so the Sets view's "of Y" is the
 * preview's "Whole set: X of Y".
 */
import type { DemoPage } from './binderTypes.ts';
import { completeSet, type CollectorCard } from './collectorBinders.ts';

export interface Completion {
  have: number;
  total: number;
  /** Whole percent, rounded; 0 when there is nothing to count. */
  pct: number;
}

/** Count the given pockets (card ids, duplicates are separate pockets) against what is owned. */
export function completionOf(cardIds: readonly string[], owned: ReadonlySet<string> | null | undefined): Completion {
  const total = cardIds.length;
  const have = owned ? cardIds.filter((id) => owned.has(id)).length : 0;
  return { have, total, pct: total ? Math.round((have / total) * 100) : 0 };
}

/** A set as Set Binders builds its "Complete set" (secret rares in). */
export function setCompletion(setCards: readonly CollectorCard[], owned: ReadonlySet<string> | null | undefined): Completion {
  return completionOf(completeSet(setCards, { secrets: true }).pockets.map((p) => p.cardId), owned);
}

/** The card pockets on a binder page: card slots that hold a card. Art panels and text do not count. */
export function pageCardIds(page: Pick<DemoPage, 'slots'>): string[] {
  return page.slots.filter((s) => s.type === 'card' && !!s.cardId).map((s) => s.cardId as string);
}

export function pageCompletion(page: Pick<DemoPage, 'slots'>, owned: ReadonlySet<string> | null | undefined): Completion {
  return completionOf(pageCardIds(page), owned);
}

/** Every card pocket in the binder, all pages together. */
export function binderCompletion(pages: readonly Pick<DemoPage, 'slots'>[], owned: ReadonlySet<string> | null | undefined): Completion {
  return completionOf(pages.flatMap(pageCardIds), owned);
}
