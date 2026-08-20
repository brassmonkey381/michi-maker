/**
 * Daily community-totals history for the analytics report (`/studio`).
 *
 * Reads `admin_community_growth` (migration 20260819130000), which is admin-gated the same
 * way every other analytics read is — security definer + `is_admin()`, no table read policy.
 * A non-admin caller gets an empty series rather than an error.
 *
 * The PUBLIC landing band does not use this; it reads the singleton `community_stats` row
 * through `@/data/communityStats`. Keep it that way — this series is admin-only.
 *
 * READ THE `backfilled` FLAG. Days before the first daily snapshot were reconstructed from
 * `created_at`, so they cannot see deleted binders: that stretch is a lower bound and rises
 * monotonically by construction. Captured days are real observations and can fall. The panel
 * renders the two differently on purpose; do not average over the boundary as if it were one
 * measured series.
 */
import { supabase } from '@/lib/supabase';

export interface GrowthDay {
  day: string;
  collectors: number;
  bindersBuilt: number;
  pagesBuilt: number;
  cardsPlaced: number;
  artworkPlaced: number;
  backfilled: boolean;
  /** Same-day change. Null on the first day of the window (nothing to difference against). */
  newCollectors: number | null;
  newBinders: number | null;
  newPages: number | null;
  newCards: number | null;
  newArtwork: number | null;
}

/** Which totals the report plots, and how they are labelled. One place to add a sixth. */
export const GROWTH_METRICS = [
  { key: 'collectors', delta: 'newCollectors', label: 'Collectors' },
  { key: 'bindersBuilt', delta: 'newBinders', label: 'Binders built' },
  { key: 'pagesBuilt', delta: 'newPages', label: 'Pages built' },
  { key: 'cardsPlaced', delta: 'newCards', label: 'Cards placed' },
  { key: 'artworkPlaced', delta: 'newArtwork', label: 'Artworks placed' },
] as const satisfies readonly {
  key: keyof GrowthDay;
  delta: keyof GrowthDay;
  label: string;
}[];

export async function fetchCommunityGrowth(days = 30): Promise<GrowthDay[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('admin_community_growth', { p_days: days });
  if (error || !data) return [];
  return data.map((r) => ({
    day: r.day,
    collectors: Number(r.collectors) || 0,
    bindersBuilt: Number(r.binders_built) || 0,
    pagesBuilt: Number(r.pages_built) || 0,
    cardsPlaced: Number(r.cards_placed) || 0,
    artworkPlaced: Number(r.artwork_placed) || 0,
    backfilled: !!r.is_backfilled,
    newCollectors: r.new_collectors == null ? null : Number(r.new_collectors),
    newBinders: r.new_binders == null ? null : Number(r.new_binders),
    newPages: r.new_pages == null ? null : Number(r.new_pages),
    newCards: r.new_cards == null ? null : Number(r.new_cards),
    newArtwork: r.new_artwork == null ? null : Number(r.new_artwork),
  }));
}

/** Total added across the window, i.e. last day minus first day. 0 for a window of one. */
export function growthOverWindow(series: GrowthDay[], key: keyof GrowthDay): number {
  if (series.length < 2) return 0;
  const first = series[0][key];
  const last = series[series.length - 1][key];
  if (typeof first !== 'number' || typeof last !== 'number') return 0;
  return last - first;
}
