/**
 * HOW ALIKE THE CARDS ON A PAGE LOOK, for the arranger (docs/ARRANGE.md). Owner, 2026-10-22:
 * "similarity for adjacent cards or cards in the same row could be a critical factor ... cards
 * that look similar in color, geometry, and art style".
 *
 * The data server's Find Similar answers "the N cards most like this one" with a cosine score
 * from 64-d art embeddings, and never hands out a vector (docs/DATA-EXPOSURE.md). So the page's
 * likeness is read off those lists: one call per card, its 200 nearest, and two cards on the page
 * are as alike as the better of the two directions says; a card that does not appear in the
 * other's list counts as unalike. Cached per card for the session; fails soft to an empty map,
 * which makes the arranger ignore the term.
 *
 * A one-call RPC that takes the page's ids and returns the pairwise scores would be cleaner;
 * that is the data server's repo (docs/DATA-SERVER.md handoff list).
 */
import { findSimilar, similarAvailable } from 'tcgscan-browse';

export type Similarity = ReadonlyMap<string, ReadonlyMap<string, number>>;

const NEAREST = 200;
const cache = new Map<string, Map<string, number>>();

/** Pairwise likeness among `ids`, symmetric, 0..1; only ids that answered are keys. */
export async function similarityAmong(ids: readonly string[]): Promise<Similarity> {
  const out = new Map<string, Map<string, number>>();
  const unique = [...new Set(ids)];
  if (unique.length < 2 || !similarAvailable()) return out;
  const want = unique.filter((id) => !cache.has(id));
  await Promise.all(
    want.map(async (id) => {
      const hits = await findSimilar(id, NEAREST);
      cache.set(id, new Map(hits.map((h) => [h.id, Math.max(0, Math.min(1, h.similarity))])));
    }),
  );
  const onPage = new Set(unique);
  for (const a of unique) {
    const row = new Map<string, number>();
    for (const b of unique) {
      if (a === b) continue;
      const ab = cache.get(a)?.get(b) ?? 0;
      const ba = cache.get(b)?.get(a) ?? 0;
      const v = Math.max(ab, ba);
      if (v > 0 && onPage.has(b)) row.set(b, v);
    }
    out.set(a, row);
  }
  return out;
}
