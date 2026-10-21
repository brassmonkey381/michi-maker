/**
 * THEME FILL for Complete page: the cards that share the page's own scene, from the data server.
 *
 * `theme_fill` (tcgscan-data migration 85, 2026-10-21) takes the page's card ids, finds the
 * scene and object words two or more of them share, weights them by prominence and rarity, and
 * returns the cards that share at least two of those words, the page's own cards and same-art
 * copies left out. Only ids and scores come back: no tag reaches this device, the same boundary
 * as lib/depth and lib/themeScores. Publishable key only. Fails soft to an empty list, which the
 * sheet shows as "nothing found", including the window before the migration is applied (404).
 */
import { getApiKey, getApiUrl } from 'tcgscan-browse';

export interface ThemeFillHit {
  id: string;
  artBand: number;
  fullArt: boolean;
  score: number;
}

export async function themeFill(ids: readonly string[], limit = 60, opts: { fullArt?: boolean } = {}): Promise<ThemeFillHit[]> {
  const url = getApiUrl();
  const key = getApiKey();
  if (!url || !key || ids.length === 0) return [];
  try {
    const res = await fetch(`${url}/rpc/theme_fill`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_card_ids: ids, p_limit: Math.min(500, limit), ...(opts.fullArt === undefined ? {} : { p_full_art: opts.fullArt }) }),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as { id: string | number; art_band?: number; full_art?: boolean; score?: number }[] | null;
    return (rows ?? []).map((r) => ({ id: String(r.id), artBand: r.art_band ?? 2, fullArt: r.full_art === true, score: r.score ?? 0 }));
  } catch {
    return [];
  }
}
