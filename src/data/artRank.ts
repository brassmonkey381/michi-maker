/**
 * PUSHING THE ART TO THE FRONT OF A COLOUR SEARCH.
 *
 * A colour search ranks by palette distance, which is honest and slightly joyless: the closest
 * match to a red mix is as likely to be a frame with a red energy symbol as it is to be the
 * Illustration Rare whose whole picture is that red. Someone searching by colour is building a
 * page that has to LOOK like something, so the cards that are mostly picture should lead
 * (owner, 2026-09-17).
 *
 * The bands are the kit's, not invented here: `query.ts`'s ART_BAND already encodes exactly this
 * judgement for themed text search — "an Illustration Rare or Special Illustration Rare IS the
 * artwork; a named Full Art shows a character on a backdrop; everything else shows a frame".
 * Reusing it means the two searches agree about what a beautiful card is.
 *
 * WHERE THIS DIFFERS FROM THEMED SEARCH, deliberately: themed search bands HARD — every
 * Illustration Rare outranks every ordinary card, whatever its score. That is right when the
 * query is about the picture's subject. It is wrong here, because a distant colour match is
 * simply the wrong colour, and no amount of beautiful gets it onto a page about teal. So this
 * MULTIPLIES a card's place in the queue instead: an Illustration Rare thirty results down lands
 * around tenth, while one three hundred down stays behind a good plain match. Heavily favoured,
 * never exclusive.
 */

/** The kit's bands (query.ts ART_BAND), by `fullArtKind`. Unlisted → an ordinary framed card. */
const BAND: Record<string, number> = {
  special_illustration_rare: 0,
  illustration_rare: 0,
  named_full_art: 1,
};

/**
 * How far up the queue each band is moved. Lower = stronger promotion; 1 leaves a card where it
 * was. Tuned so a band-0 card roughly triples its position and a named full art nearly doubles —
 * enough to open a colour page on artwork, not enough to bury a genuinely closer match.
 */
const PROMOTION = [0.35, 0.6, 1];

/** A card's band, for anything the catalog can resolve. */
function bandOf(fullArtKind: string | undefined): number {
  return BAND[fullArtKind ?? ''] ?? 2;
}

/**
 * Re-order colour-search results so the artwork cards lead, without losing the colour ranking.
 *
 * `ids` must be in the search's own order (nearest colour first). `kindOf` returns a card's
 * `fullArtKind`, or undefined for an id the catalog cannot resolve — those keep their place
 * exactly, which is what makes this safe for a game with no such data at all (One Piece publishes
 * no `full_art_kind`, so every card is band 2 and the order comes back untouched).
 */
export function promoteArtCards(
  ids: readonly string[],
  kindOf: (id: string) => string | undefined,
): string[] {
  return ids
    // `rank + 1`, so the first result cannot multiply to zero and tie with everything above it.
    .map((id, rank) => ({ id, rank, key: (rank + 1) * PROMOTION[bandOf(kindOf(id))] }))
    // Ties keep the colour order: a stable sort plus the original rank as the tiebreak, so two
    // cards of the same band never swap places for no reason.
    .sort((a, b) => a.key - b.key || a.rank - b.rank)
    .map((entry) => entry.id);
}
