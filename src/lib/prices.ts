/**
 * Card prices — re-exported from the shared `tcgscan-browse` package, plus the
 * michi-specific binder/page value aggregations (the "just for fun" running
 * totals in BinderScreen).
 *
 * Importing the config shim FIRST guarantees the package is configured before
 * the re-exported summary fetch can run.
 */
import '@/lib/catalogConfig';

import type { PriceSummary } from 'tcgscan-browse';

import type { DemoBinder, DemoPage } from '@/data/binderTypes';

export {
  formatUsd,
  getPriceSummary,
  priceSnapshot,
  usePriceSummary,
  type PriceSummary,
  type PriceSummaryEntry,
} from 'tcgscan-browse';

/** Sum of the headline values of a page's card slots (artwork/insert slots excluded). */
export function pageValue(page: DemoPage, summary: PriceSummary): number {
  let total = 0;
  for (const slot of page.slots) {
    if (slot.type === 'card' && slot.cardId) {
      total += summary[slot.cardId]?.cur ?? 0;
    }
  }
  return total;
}

/** Sum of every page's value. */
export function binderValue(binder: DemoBinder, summary: PriceSummary): number {
  return binder.pages.reduce((sum, page) => sum + pageValue(page, summary), 0);
}
