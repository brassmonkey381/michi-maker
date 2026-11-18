/**
 * WHICH PUBLIC BINDERS A SEARCH ENGINE IS ASKED TO KEEP (MIC-037, SEO plan action 1).
 *
 * One rule, read by both the sitemap (api/sitemap.js) and the binder page (api/page-binder.js), so
 * the sitemap never lists a page that then says noindex, and the reverse.
 *
 * Public is not the same as "worth indexing":
 *   - HIDDEN. `hidden_from_feeds` binders are public only so their share picture renders: the daily
 *     puzzle binders above all, whose page titles are the FUTURE puzzles' answers. Every in-app
 *     feed already skips them (20260923150000_hidden_from_feeds.sql); the sitemap did not, and four
 *     of 22 sampled sitemap binders were puzzle binders with dates into 2027. Titles starting
 *     "Daily Puzzles" are treated the same, in case one is ever made public without the flag.
 *   - THIN. Fewer than MIN_FILLED pockets a visitor can see. Counted as an anonymous reader sees
 *     the binder: under the MIC-029 policy (20261109120100_image_review_policy.sql) a picture the
 *     safety check has not approved, and every page held by moderation, is invisible to visitors,
 *     so only cards and APPROVED pictures count. A binder of unchecked uploads is therefore never
 *     indexed for them.
 *   - UNNAMED. The app's placeholder title (fillerName in src/data/binderTypes.ts: one capital,
 *     consonant-vowel-consonant-vowel, e.g. "Woge") with no description. About 9 of 22 sampled
 *     sitemap binders were these.
 *
 * Everything else that is public is indexable. A binder below the bar still gets its page; it is
 * marked noindex and left out of the sitemap.
 */
const { sbSelect } = require('./_lib');

const MIN_FILLED = 9;
const FILLER_NAME = /^[BCDFGHJKLMNPRSTVWZ][aeiou][bcdfghjklmnprstvwz][aeiou]$/;
const PUZZLE_TITLE = /^daily puzzles?\b/i;

/** Pockets an anonymous visitor sees filled: rows as returned under the visitor policy. */
function filledCount(binder) {
  return (binder.binder_pages || []).reduce(
    (n, p) => n + (p.binder_slots || []).filter((s) => s.card_id || s.image_url).length,
    0,
  );
}

/**
 * { index: boolean, reason: 'hidden' | 'thin' | 'unnamed' | null } for a binder row carrying
 * `title`, `description`, `hidden_from_feeds` and `binder_pages(binder_slots(card_id,image_url))`.
 */
function indexDecision(binder) {
  const title = String((binder && binder.title) || '').trim();
  if (!binder || binder.hidden_from_feeds || PUZZLE_TITLE.test(title)) return { index: false, reason: 'hidden' };
  if (filledCount(binder) < MIN_FILLED) return { index: false, reason: 'thin' };
  if (FILLER_NAME.test(title) && !String(binder.description || '').trim()) return { index: false, reason: 'unnamed' };
  return { index: true, reason: null };
}

/** The select every caller of indexDecision needs, as a PostgREST fragment. */
const INDEX_SELECT = 'id,title,description,updated_at,hidden_from_feeds,binder_pages(binder_slots(card_id,image_url))';

/**
 * Indexable public binders, most recently edited first. `hidden_from_feeds=eq.false` is applied in
 * the query as well as in indexDecision, so the hidden rows never leave the database here.
 */
async function indexableBinders(limit = 2000) {
  const rows = await sbSelect(
    `binders?is_public=eq.true&removed_at=is.null&hidden_from_feeds=eq.false&select=${INDEX_SELECT}` +
      `&order=updated_at.desc&limit=${Math.max(1, Math.min(limit, 5000))}`,
  );
  return (Array.isArray(rows) ? rows : []).filter((b) => indexDecision(b).index);
}

module.exports = { MIN_FILLED, FILLER_NAME, filledCount, indexDecision, indexableBinders, INDEX_SELECT };
