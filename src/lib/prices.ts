/**
 * Card prices — re-exported from the shared `tcgscan-browse` package, plus the
 * michi-specific binder/page value aggregations (the "just for fun" running
 * totals in BinderScreen).
 *
 * Importing the config shim FIRST guarantees the package is configured before
 * the re-exported summary fetch can run.
 */
import '@/lib/catalogConfig';

import { useEffect, useState } from 'react';

// Re-exported below for callers; also needed HERE for usePriceSummaryWhen.
import { getPriceSummary, priceSnapshot } from 'tcgscan-browse';

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

/**
 * The price summary, loaded lazily and only while `enabled`. Seeds from any snapshot already in
 * memory so a re-mount is instant, and fills in once the fetch resolves. Never throws — pricing is
 * optional decoration, and so is anything derived from it.
 *
 * Shared rather than per-component because two surfaces now need the same restraint for different
 * reasons: the Price caption wants the numbers, and the finish chip wants only the VARIANT KEYS to
 * know what a card could have been printed as. Neither justifies pulling several megabytes on a
 * screen where the feature is switched off.
 */
export function usePriceSummaryWhen(enabled: boolean): PriceSummary | null {
  const [summary, setSummary] = useState<PriceSummary | null>(() => priceSnapshot());
  useEffect(() => {
    if (!enabled || summary) return;
    let mounted = true;
    getPriceSummary().then((s) => {
      if (mounted) setSummary(s);
    });
    return () => {
      mounted = false;
    };
  }, [enabled, summary]);
  return summary;
}
