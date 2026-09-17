/**
 * Card prices — re-exported from the shared `tcgscan-browse` package, plus the
 * michi-specific binder/page value aggregations (the "just for fun" running
 * totals in BinderScreen).
 *
 * Importing the config shim FIRST guarantees the package is configured before
 * the re-exported summary fetch can run.
 */
import '@/lib/catalogConfig';

import { useEffect, useState, useSyncExternalStore } from 'react';

// The kit's Pokemon summary; michi merges One Piece's underneath it (see getPriceSummary below).
import { getPriceSummary as pokemonPriceSummary } from 'tcgscan-browse';

import type { PriceSummary } from 'tcgscan-browse';

import type { DemoBinder, DemoPage } from '@/data/binderTypes';
import { otherGameCatalog, otherGamePriceSummary, otherGameVersion, subscribeOtherGame } from '@/lib/otherGame';

export { formatUsd, type PriceSummary, type PriceSummaryEntry } from 'tcgscan-browse';

let merged: Promise<PriceSummary> | null = null;
let mergedSnapshot: PriceSummary | null = null;

/**
 * Headline prices for BOTH games, because a binder holds both (lib/otherGame).
 *
 * michi owns this rather than re-exporting the kit's: the kit fetches exactly one
 * `prices-summary.json` into a module singleton with no seam for a second source. The two files
 * were measured disjoint (27,798 Pokémon ids vs 6,862 One Piece), and Pokémon wins any future
 * collision by merge order. Both fetches start together — they are the two biggest on a cold
 * binder — and a failure of either still resolves, because pricing is decoration.
 */
export function getPriceSummary(): Promise<PriceSummary> {
  merged ??= pokemonPriceSummary()
    .then(async (pokemon) => {
      // ONE PIECE ONLY WHEN ONE PIECE IS IN PLAY. Its catalog is built only after a pocket held an
      // id the Pokémon catalog missed, so this asks for its prices exactly when a binder has one —
      // never on a Pokémon-only launch, and never BEFORE Pokémon's own numbers, which used to wait
      // behind a second fetch every user paid for.
      const onePiece = otherGameCatalog() ? await otherGamePriceSummary() : ({} as PriceSummary);
      const all = { ...onePiece, ...pokemon };
      // Never pin a failed Pokemon fetch: the kit resolves {} on failure, and a cached empty map
      // would render every binder at $0.00 until the process restarts.
      if (Object.keys(pokemon).length === 0) merged = null;
      else mergedSnapshot = all;
      return all;
    })
    .catch(() => {
      merged = null;
      return {} as PriceSummary;
    });
  return merged;
}

/**
 * Re-merge once One Piece arrives after the summary was already built — otherwise a binder whose
 * One Piece cards resolved a moment later would show them at $0.00 for the rest of the session.
 * Cheap: the kit caches Pokémon's fetch, so re-merging costs one small file at most.
 */
subscribeOtherGame(() => {
  if (mergedSnapshot && otherGameCatalog()) {
    merged = null;
    void getPriceSummary();
  }
});

/** Synchronous view of the merged summary once loaded (null before), for non-React callers. */
export function priceSnapshot(): PriceSummary | null {
  return mergedSnapshot;
}

/** The merged summary, loading it on first use. Null until it resolves; never throws. */
export function usePriceSummary(): PriceSummary | null {
  return usePriceSummaryWhen(true);
}

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
  // One Piece's prices can arrive AFTER the summary was first built (its catalog loads on a pocket
  // miss), so this re-reads when that happens instead of holding the Pokémon-only map for the rest
  // of the session. The counter never moves in a Pokémon-only session, so nothing re-runs.
  const version = useSyncExternalStore(subscribeOtherGame, otherGameVersion, otherGameVersion);
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    // Promise-cached, so a repeat call costs nothing when nothing has changed.
    getPriceSummary().then((s) => {
      if (mounted) setSummary(s);
    });
    return () => {
      mounted = false;
    };
  }, [enabled, version]);
  return summary;
}
