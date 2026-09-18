/**
 * A CARD'S PALETTE, TURNED BACK INTO MIX-BAR STOPS.
 *
 * The tri-color picker holds its colours as stops on a 0..1 bar, and a stop's WEIGHT is not stored:
 * it is inferred from where the stop sits, by splitting the bar at the midpoints between
 * neighbours (`stopWeights` in components/color/ColorPicker). That is a fine way to let someone
 * drag a mix, and a nuisance when you already know the weights — as you do when the colours came
 * from a real card's published palette, where each one carries the fraction of the card it covers.
 *
 * So this inverts `stopWeights`: given the weights, it solves for the positions that produce them.
 * Take boundaries b1 = (p1+p2)/2 and b2 = (p2+p3)/2; asking for weights w1, w2, w3 means b1 = w1
 * and b2 = w1+w2, which fixes p2 and p3 once p1 is chosen. p1 = w1/2 centres the first stop in its
 * own band, and for three equal colours it returns 0.167 / 0.5 / 0.833 — the picker's own defaults,
 * which is the sanity check that the algebra is right.
 *
 * Generic over the colour type and free of the kit and of React, so it can be tested as data.
 */

/** A stop's position on the 0..1 bar, paired with the colour that sits there. */
export interface PaletteStop<T> {
  pos: number;
  color: T;
}

/** Nudge stops apart when clamping would otherwise stack two at the same spot. */
const EPSILON = 0.001;

/**
 * The `max` most prominent colours as bar stops, biggest first.
 *
 * Colours with no coverage are dropped (a card with two real colours gets two stops, not three
 * with a black one). Weights are renormalised over what survives, so dropping the fourth colour
 * does not shrink the first three's share of the bar.
 */
export function paletteStops<T extends { w: number }>(colors: readonly T[], max = 3): PaletteStop<T>[] {
  const top = [...colors].filter((c) => c.w > 0).sort((a, b) => b.w - a.w).slice(0, max);
  if (top.length === 0) return [];
  const total = top.reduce((sum, c) => sum + c.w, 0);
  if (total <= 0) return [];
  const weights = top.map((c) => c.w / total);

  // Solve for the positions that reproduce these weights exactly: the first stop centred in its
  // own band, each later one placed so the midpoint with its predecessor lands on the boundary.
  const exact: number[] = [];
  let boundary = 0; // cumulative weight consumed — the left edge of this colour's band
  weights.forEach((w, i) => {
    exact.push(i === 0 ? w / 2 : 2 * boundary - exact[i - 1]);
    boundary += w;
  });

  /**
   * The exact solution can leave the bar. One colour covering 96% of a card puts the second stop
   * past 1.0, and there is no arrangement of three stops on a 0..1 bar whose midpoints reproduce
   * that split — the weights are simply not representable.
   *
   * Rather than clamp (which stacks stops on top of each other and loses their ORDER, the one
   * thing the eye actually reads), fall back to centring each colour in its own band. Those are
   * always inside the bar and always increasing, and the mix they encode is a flatter version of
   * the same ranking: still biggest-first, just less lopsided than the card really is.
   */
  const usable =
    exact.every((p, i) => p >= 0 && p <= 1 && (i === 0 || p > exact[i - 1] + EPSILON));
  if (usable) return top.map((color, i) => ({ color, pos: exact[i] }));

  let consumed = 0;
  return top.map((color, i) => {
    const pos = consumed + weights[i] / 2;
    consumed += weights[i];
    return { color, pos };
  });
}
