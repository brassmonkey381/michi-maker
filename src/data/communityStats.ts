/**
 * Community totals for the landing page — how much has been BUILT in michi-maker.
 *
 * Reads the singleton `community_stats` row (migration 20260819120000). That row is
 * precomputed and refreshed hourly by pg_cron, so this is a single-row primary-key lookup,
 * never an aggregate over every binder slot. Do not "simplify" this into a live count()
 * from the client: `anon` cannot read the binder tables under RLS, and the landing page is
 * the most-hit guest surface we have.
 *
 * Three caching layers, in order:
 *   1. `SEED` — real numbers baked in at build time, so the band paints on first frame with
 *      no spinner and no layout shift. Always replaced by the live row when it arrives.
 *      Totals only ever grow, so a stale seed under-sells; it can never over-claim.
 *   2. `memo` — module-level, survives navigation within a session.
 *   3. the hourly DB refresh itself.
 *
 * WORDING CONTRACT: these counts include private binders (see the migration's comment for
 * why). Copy built on them must say "built" / "placed", never "showcased", "public",
 * "shared" or "on display" — most of these binders are not viewable by a visitor.
 */
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export interface CommunityStats {
  collectors: number;
  bindersBuilt: number;
  pagesBuilt: number;
  cardsPlaced: number;
  artworkPlaced: number;
}

/**
 * Last values read from production (2026-08-19). Refresh by running the query in
 * `supabase/migrations/20260819120000_community_stats.sql` and pasting the result — it is
 * only a first-paint placeholder, so it does not need to be current, just true.
 */
export const SEED: CommunityStats = {
  collectors: 20,
  bindersBuilt: 65,
  pagesBuilt: 353,
  cardsPlaced: 2365,
  artworkPlaced: 455,
};

/** In-memory for the session. `null` means "not fetched yet". */
let memo: CommunityStats | null = null;
let inFlight: Promise<CommunityStats | null> | null = null;

export async function fetchCommunityStats(): Promise<CommunityStats | null> {
  if (memo) return memo;
  if (inFlight) return inFlight;
  if (!supabase) return null;

  inFlight = (async () => {
    const { data, error } = await supabase
      .from('community_stats')
      .select('collectors, binders_built, pages_built, cards_placed, artwork_placed')
      .maybeSingle();
    inFlight = null;
    // A missing row or an unreachable backend is not worth surfacing on a marketing page —
    // the caller keeps showing SEED.
    if (error || !data) return null;
    memo = {
      collectors: Number(data.collectors) || 0,
      bindersBuilt: Number(data.binders_built) || 0,
      pagesBuilt: Number(data.pages_built) || 0,
      cardsPlaced: Number(data.cards_placed) || 0,
      artworkPlaced: Number(data.artwork_placed) || 0,
    };
    return memo;
  })();

  return inFlight;
}

/**
 * The landing band's data source. Starts at `SEED` so there is never an empty state, then
 * swaps to the live row. Returns whichever is current; it is never null.
 */
export function useCommunityStats(): CommunityStats {
  const [stats, setStats] = useState<CommunityStats>(memo ?? SEED);

  useEffect(() => {
    let alive = true;
    fetchCommunityStats()
      .then((live) => {
        if (alive && live) setStats(live);
      })
      .catch(() => {
        /* keep SEED */
      });
    return () => {
      alive = false;
    };
  }, []);

  return stats;
}
