/**
 * Which embedding model answers "find similar", in the version a user can quote.
 *
 * WHY IT IS ON SCREEN AT ALL. Similarity results change when the model changes, and the model
 * changes on its own cadence — nothing in the app version moves with it. "Find similar started
 * returning different cards" had no answer anyone could check. Now it does.
 *
 * WHY IT COMES FROM THE SERVER. The similarity model is not a client property: it is whatever
 * vectors sit in `cards.embedding`, decided by a publish run. The app cannot know it locally and
 * must not guess. `get_similarity_model()` reads the row that publish/push_embeddings marks on
 * every live push, so the label and the vectors move together.
 *
 * Fails soft to null, which callers render as nothing rather than as a guess.
 */
import { getApiKey, getApiUrl } from 'tcgscan-browse';

export interface SimilarityModel {
  /** Internal id, e.g. 'capG-e15'. */
  modelVersion: string;
  /** Customer-facing semver, e.g. '3.0.0'. Null until the registry has one. */
  publicVersion: string | null;
  publishedAt: string | null;
}

let cached: Promise<SimilarityModel | null> | null = null;

export function getSimilarityModelInfo(): Promise<SimilarityModel | null> {
  if (!cached) cached = fetchIt();
  return cached;
}

async function fetchIt(): Promise<SimilarityModel | null> {
  const url = getApiUrl();
  const key = getApiKey();
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rpc/get_similarity_model`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as
      | { model_version: string; public_version: string | null; published_at: string | null }[]
      | null;
    const row = rows?.[0];
    if (!row?.model_version) return null;
    return {
      modelVersion: row.model_version,
      publicVersion: row.public_version ?? null,
      publishedAt: row.published_at ?? null,
    };
  } catch {
    return null;
  }
}

/** "22 Aug 2026", or null. Locale-independent so a screenshot reads the same everywhere. */
export function formatPublished(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
