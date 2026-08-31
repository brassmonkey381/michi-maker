/**
 * Card caption metadata — the "labels under a card" feature for binder views.
 *
 * The caption reads straight from the shared catalog's rich `CatalogCard` (series, set, name,
 * artist, rarity, type, …) rather than the lossy `DemoCard` editor view-model — so every field
 * is available without widening `DemoCard`. Price is the exception: it lives in a separate
 * per-card PriceSummary (keyed by id), so it's passed in as a render-time `CaptionExtras`. This
 * file owns the michi-specific concerns: which fields exist, their human labels, the canonical
 * *display* order, and the `*`-joined format.
 */
import type { CatalogCard } from '@/lib/catalog';
import { formatUsd } from '@/lib/prices';
import { rarityCode } from '@/data/rarityCode';

/** A metadata field that can be shown as a caption under a card. */
export type CaptionFieldKey =
  | 'series'
  | 'set'
  | 'artist'
  | 'rarityCode'
  | 'number'
  | 'stage'
  | 'released'
  | 'price'
  /** The print finish — drawn as a coloured chip ON the card, not as caption text. See below. */
  | 'finish';

/**
 * Per-card extras a caption field may need that don't live on `CatalogCard` — today just the
 * latest price (keyed by card id in a separate PriceSummary, so it's supplied at render time).
 */
export interface CaptionExtras {
  /** Latest headline market value (USD) for this card, when loaded. */
  price?: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** yyyy-mm-dd -> "Mar 15, 2022" (full date); "" for empty/partial. */
function formatFullDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const month = MONTHS[parseInt(m[2], 10) - 1];
  if (!month) return '';
  return `${month} ${parseInt(m[3], 10)}, ${m[1]}`;
}

/**
 * WHERE EACH LABEL GOES. A card has four corners and a strip beneath it, and everything competing
 * for that space has to be placed once, deliberately, in one table — otherwise every new label is
 * a fresh argument with the last one, and two of them quietly end up in the same corner.
 *
 * The card's own space is reserved as follows:
 *
 *      ┌──────────────────────────────┐
 *      │ ✓ owned            finish ⬤ │   topLeft is NOT a label — the owned tick owns it
 *      │                              │
 *      │            (art)             │
 *      │                              │
 *      │ artist                       │   'artistRow'
 *      │      [SV][PAF][091]   $12.34 │   'bottomRow' centred · 'bottomRight'
 *      └──────────────────────────────┘
 *        rarity · stage · released         'caption' — the strip below the card
 *
 * The strip below stays the home for anything nobody reads at a glance. Putting those on the card
 * would cost art you can see for facts you would have to squint at.
 */
export type LabelSpot =
  /** The text strip beneath the card. Costs pocket height, so it is for the low-traffic fields. */
  | 'caption'
  /** The lowest row ON the card, centred — the identity of the printing at a glance. */
  | 'bottomRow'
  /** The row just above it, left-aligned. Long values live here; they have the width for it. */
  | 'artistRow'
  /** The lowest row, right-hand end. One short, high-value number. */
  | 'bottomRight'
  /** The top-right corner. Drawn from the OWNED COPY rather than the card (see BinderScreen). */
  | 'topRight';

/** A chip is a filled pill for something short and scannable; text is for everything else. */
export type LabelRender = 'chip' | 'text';

/**
 * The caption fields in their canonical *display* order, each with its label, its accessor
 * ('' when the field is absent for that card), and where and how it draws.
 *
 * `tone` is the whole point of writing this down: recolouring a label is a one-line edit here
 * rather than a hunt through JSX. Left undefined it takes the neutral scrim — white on a dark
 * translucent pill, which is the only treatment guaranteed to stay legible over card art that
 * may be any colour at all. Give a field a colour only when it has earned being looked at first.
 */
export const CAPTION_FIELDS: {
  key: CaptionFieldKey;
  label: string;
  get: (c: CatalogCard, extras: CaptionExtras) => string;
  /** Where it draws. Omitted = the caption strip below the card. */
  spot?: LabelSpot;
  /** How it draws. Omitted = text. */
  render?: LabelRender;
  /** Palette token name for the fill (chip) or the ink (text). Omitted = the neutral scrim. */
  tone?: 'accent';
  /**
   * Drawn on the card rather than as text in the strip beneath it. Derived from `spot`, but kept
   * as its own flag because two things key off it — `formatCaption` skips these, and so does the
   * decision to reserve caption height, so a view showing only on-card labels carves no empty
   * strip out of every pocket.
   */
  chipOnly?: boolean;
}[] = [
  // The printing's identity, as three short codes read left to right along the bottom edge.
  { key: 'series', label: 'Series', get: (c) => c.seriesId.toUpperCase(), spot: 'bottomRow', render: 'chip', chipOnly: true },
  // setCode, not setName: "PAF" fits on a pocket, "Scarlet & Violet—Paldean Fates" does not.
  { key: 'set', label: 'Set', get: (c) => c.setCode.toUpperCase(), spot: 'bottomRow', render: 'chip', chipOnly: true },
  // Artist names run long, so this gets its own row and the card's full width to run along.
  { key: 'artist', label: 'Artist', get: (c) => c.illustrator, spot: 'artistRow', render: 'text', chipOnly: true },
  { key: 'rarityCode', label: 'Rarity code', get: (c) => rarityCode(c.rarity) },
  { key: 'number', label: 'Number', get: (c) => c.number, spot: 'bottomRow', render: 'chip', chipOnly: true },
  { key: 'stage', label: 'Stage', get: (c) => c.stage },
  { key: 'released', label: 'Released', get: (c) => formatFullDate(c.releaseDate) },
  // The one number worth its own corner, and the only field given a colour: it is what people
  // actually came to look at.
  {
    key: 'price',
    label: 'Price',
    get: (_c, extras) => formatUsd(extras.price ?? 0),
    spot: 'bottomRight',
    render: 'text',
    tone: 'accent',
    chipOnly: true,
  },
  // The print finish (N / H / RH …). Its value comes from the owned COPY in the pocket, not from
  // the card, so there is nothing for `get` to read here — BinderGrid draws it from the collection.
  { key: 'finish', label: 'Finish', get: () => '', spot: 'topRight', render: 'chip', chipOnly: true },
];

/** Fields shown by default the first time captions are switched on. */
export const DEFAULT_CAPTION_FIELDS: CaptionFieldKey[] = ['set', 'number', 'rarityCode', 'finish'];

/**
 * Build a card's caption: the enabled fields, in `CAPTION_FIELDS` order, dropping any that are
 * empty for this card, joined by " * ". Returns '' when there's nothing to show.
 */
export function formatCaption(
  card: CatalogCard,
  enabled: Iterable<CaptionFieldKey>,
  extras: CaptionExtras = {},
): string {
  const on = new Set(enabled);
  return CAPTION_FIELDS.filter((f) => !f.chipOnly && on.has(f.key))
    .map((f) => f.get(card, extras).trim())
    .filter((v) => v.length > 0)
    .join(' * ');
}

/**
 * Do any of these fields put TEXT under the card? Chip-only fields do not, so a view showing just
 * the finish reserves no caption strip and the pockets keep their full height.
 */
export function hasTextCaption(enabled: Iterable<CaptionFieldKey>): boolean {
  const on = new Set(enabled);
  return CAPTION_FIELDS.some((f) => !f.chipOnly && on.has(f.key));
}
