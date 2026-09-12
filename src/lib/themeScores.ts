/**
 * THEME SCORING, SERVER-SIDE. The cards that belong to a theme, and the cards whose picture is
 * like another card's — without the tags ever reaching this device.
 *
 * WHAT THIS REPLACES AND WHY. lib/taggedCards used to page the ENTIRE tagged corpus through the
 * theme-search function and score it here: 2,245 cards at about 27.8 tags each, roughly 62,000 tag
 * strings, shipped in both the bare and prefixed form so the taxonomy travelled with the values.
 * Five calls took the whole thing. That is not "which cards match", it is the complete semantic
 * labelling of the catalog, which is the tagging work product itself. Owner decision 2026-09-11:
 * protect it, and accept the work of moving the scoring rather than metering the download.
 *
 * THE SHAPE THAT MAKES IT SAFE. The client sends the theme's tag names; the server scores against
 * them and returns ids and numbers. `hits` is a SUBSET OF WHAT WAS SENT, so no tag this app did
 * not already name can come back. That is a property of the contract rather than a promise about
 * how the response is used — a response the client ignores is still a response someone can read in
 * devtools.
 *
 * SO THE THEME VOCABULARY STAYS HERE, in data/storyThemes, which is the right place for it: the
 * exposure audit's own conclusion was that the durable asset was never the corpus but the themes
 * written against it. This app knows what Winter means. The server knows which cards are cold.
 *
 * THE PLANNER DID NOT MOVE. Only the 40 lines that touched tags did (rankedTags and scoreCard).
 * Everything in data/storyBinder still runs here on ThemeScore objects: the diversity rules, the
 * seating, the spread templates, the whole plan assembly, and its tests.
 */
import { getApiKey, getApiUrl } from 'tcgscan-browse';

import type { StoryCard, ThemeScore } from '@/data/storyBinder';
import type { StoryTheme } from '@/data/storyThemes';

/** A scored row as the RPC returns it. Snake case: this is the wire, not the domain. */
interface ScoreRow {
  id: string | number;
  name?: string | null;
  rarity?: string | null;
  illustrator?: string | null;
  evolution_line?: string[] | null;
  language?: string | null;
  score: number | string;
  hits?: string[] | null;
  qualifies?: boolean | null;
}

export interface ScoreOptions {
  /** Owned card ids. Omitted or null scores the whole catalog. */
  pool?: ReadonlySet<string> | null;
  /** Language bound; omitted is unconstrained. */
  languages?: string[];
  /**
   * How many scored cards to ask for.
   *
   * HIGHER THAN THE PAGE NEEDS, on purpose. The rarity filter still runs on this side, because
   * `isPictureRarity` is a display judgement about printings rather than anything the tag data
   * knows, so a limit tuned to the number of pockets would be cut down again after it arrived.
   */
  limit?: number;
}

function body(theme: StoryTheme, opts: ScoreOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {
    p_want: theme.want,
    p_bonus: theme.bonus ?? [],
    p_avoid: theme.avoid ?? [],
    p_limit: opts.limit ?? 400,
  };
  // Sent only when constrained: null means the whole catalog, and an empty array would mean
  // "nothing qualifies", which is a different and much quieter kind of wrong.
  if (opts.pool && opts.pool.size > 0) out.p_pool = [...opts.pool];
  if (opts.languages?.length) out.p_lang = opts.languages;
  return out;
}

function toScore(r: ScoreRow): ThemeScore {
  const card: StoryCard = {
    id: String(r.id),
    name: r.name ?? '',
    rarity: r.rarity ?? '',
    illustrator: r.illustrator ?? undefined,
    evolutionLine: r.evolution_line ?? undefined,
    language: r.language ?? undefined,
  };
  return {
    card,
    score: Number(r.score) || 0,
    hits: r.hits ?? [],
    qualifies: Boolean(r.qualifies),
  };
}

/**
 * Every card that belongs to `theme`, best first, already scored.
 *
 * This is the old `themeCandidates` with its body on the server. It keeps that function's
 * contract: qualifying cards first, then by score, ties broken by id so a plan is reproducible.
 * Fails soft to [] — a theme with no candidates is a page the planner simply does not fill, and
 * that is the same outcome the corpus read had when it was refused.
 */
export async function scoreTheme(theme: StoryTheme, opts: ScoreOptions = {}): Promise<ThemeScore[]> {
  const url = getApiUrl();
  const key = getApiKey();
  if (!url || !key || theme.want.length === 0) return [];
  try {
    const res = await fetch(`${url}/rpc/score_cards_by_theme`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body(theme, opts)),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as ScoreRow[] | null;
    return Array.isArray(rows) ? rows.map(toScore) : [];
  } catch {
    return [];
  }
}

/** Several themes at once. Sequential on purpose: see the note in StoryBinderSheet about why a
 *  session is a handful of calls rather than one per interaction. */
export async function scoreThemes(themes: readonly StoryTheme[], opts: ScoreOptions = {}): Promise<ThemeScore[][]> {
  const out: ThemeScore[][] = [];
  for (const theme of themes) out.push(await scoreTheme(theme, opts));
  return out;
}

/**
 * Cards whose PICTURE is most like `cardId`'s, nearest first.
 *
 * The old `sameScene` did this here, by holding every card's tags and multiplying rank weights
 * pairwise. It is a similarity query, the same shape as find_similar but over tags instead of
 * embeddings, so it belongs beside that one on the server. Returns ids and scores only.
 */
export async function similarByTags(
  cardId: string,
  opts: { pool?: ReadonlySet<string> | null; languages?: string[]; limit?: number } = {},
): Promise<{ id: string; score: number }[]> {
  const url = getApiUrl();
  const key = getApiKey();
  if (!url || !key || !cardId) return [];
  const payload: Record<string, unknown> = { p_card_id: cardId, p_limit: opts.limit ?? 60 };
  if (opts.pool && opts.pool.size > 0) payload.p_pool = [...opts.pool];
  if (opts.languages?.length) payload.p_lang = opts.languages;
  try {
    const res = await fetch(`${url}/rpc/similar_by_tags`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as { id: string | number; score: number | string }[] | null;
    return Array.isArray(rows) ? rows.map((r) => ({ id: String(r.id), score: Number(r.score) || 0 })) : [];
  } catch {
    return [];
  }
}

/**
 * Is this card tagged at all? Answers the one question `sameScene`'s availability check asked of
 * the corpus, with one cheap call instead of a 62,000-string download.
 */
export async function hasSceneTags(cardId: string): Promise<boolean> {
  return (await similarByTags(cardId, { limit: 1 })).length > 0;
}
