/**
 * DEPTH WORDS FOR ARRANGE, SERVER-SIDE. Which of the stratum table's words each card on a page
 * carries, in caption rank order, without the card's tags ever reaching this device.
 *
 * The same shape as lib/themeScores: the client sends the vocabulary it already knows (the depth
 * table in data/arrange, namespaced), the server scores the page's cards against it with
 * `score_cards_by_theme`, and `hits` comes back as a SUBSET OF WHAT WAS SENT, ordered by rank
 * weight, which is caption order. So the first hit is the card's first depth word, which is what
 * `depthOf` reads, and no tag this app did not name can come back.
 *
 * One call per page: `p_pool` is the page's card ids and `p_limit` their count. Fails soft to an
 * empty map, which makes every card free and Strata simply not offered.
 */
import { getApiKey, getApiUrl } from 'tcgscan-browse';

import { depthTagQuery } from '@/data/arrange';

const cache = new Map<string, string[]>();

/** The depth words of each card, in rank order. Cards with none are absent from the map. */
export async function depthOfCards(ids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const want = ids.filter((id) => {
    const hit = cache.get(id);
    if (hit) out.set(id, hit);
    return !hit && !cache.has(id);
  });
  if (!want.length) return out;
  const url = getApiUrl();
  const key = getApiKey();
  if (!url || !key) return out;
  try {
    const res = await fetch(`${url}/rpc/score_cards_by_theme`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_want: depthTagQuery(), p_pool: want, p_limit: Math.min(1000, want.length) }),
    });
    if (!res.ok) return out;
    const rows = (await res.json()) as { id: string | number; hits?: string[] | null }[] | null;
    const seen = new Set<string>();
    for (const r of rows ?? []) {
      const id = String(r.id);
      const hits = r.hits ?? [];
      seen.add(id);
      cache.set(id, hits);
      if (hits.length) out.set(id, hits);
    }
    // A card the server did not return has no depth word: remember that too, so the next page
    // with the same card does not ask again.
    for (const id of want) if (!seen.has(id)) cache.set(id, []);
  } catch {
    // Offline or refused: free cards, no Strata.
  }
  return out;
}
