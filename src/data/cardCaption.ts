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
import { seriesCode, setDisplayName } from '@/data/seriesCode';

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
  /** A line of its own above the codes, for the set — the one label that needs a whole row. */
  | 'setRow'
  /** The row above that, left-aligned. Long values live here; they have the width for it. */
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
  // `seriesId` is the full title ("Sword & Shield"), which is wider than the whole bottom edge and
  // was being clipped to "D & SHIELD". Shortened to the form collectors use — SWSH, SV, SM — by
  // a lookup, because no rule produces both SWSH and SV from the same "X & Y" shape.
  {
    key: 'series',
    label: 'Series',
    get: (c) => seriesCode(c.seriesId),
    spot: 'bottomRow',
    render: 'chip',
    chipOnly: true,
  },
  // THE NAME, on a line of its own. It was tried in both of the places a short form could go and
  // neither worked: among the fixed-width codes it squeezed to an empty pill, and sharing the
  // illustrator's row it crowded the name people wanted kept. Shortening it was worse still —
  // "04" and "11TG" are catalogue keys that identify nothing to someone holding the card.
  //
  // A set is called Vivid Voltage, so it says Vivid Voltage. The row costs a little art; being
  // unable to tell which set a card is from costs more.
  {
    key: 'set',
    label: 'Set',
    get: (c) => setDisplayName(c.setName),
    spot: 'setRow',
    render: 'chip',
    chipOnly: true,
  },
  // Artist names run long, so this gets its own row and the card's full width to run along.
  { key: 'artist', label: 'Artist', get: (c) => c.illustrator, spot: 'artistRow', render: 'text', chipOnly: true },
  { key: 'rarityCode', label: 'Rarity code', get: (c) => rarityCode(c.rarity) },
  // The full "088/198". It was cut to the numerator twice while other things were still competing
  // for this row — first the set name, then the spacing. With the set moved to a line of its own
  // and the stack tightened, the four characters that say how big the set is fit again, and they
  // earn their place: "088 of 198" says where a card sits in its set, which "088" alone does not.
  {
    key: 'number',
    label: 'Number',
    get: (c) => c.number,
    spot: 'bottomRow',
    render: 'chip',
    chipOnly: true,
  },
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

/**
 * THE ORDER THE TOGGLES APPEAR IN, which is not the order the labels read in.
 *
 * `CAPTION_FIELDS` is sequenced for the CARD — series before number because that is how a
 * printing is read aloud. A picker is a different question: it is a list of things to choose
 * between, and it should open with the ones people actually want. Price and finish first, the
 * three that are reference material trailing off the right-hand end.
 *
 * Keeping them as two orders costs one array and stops a good reading order on the card from
 * being traded away for a good shopping order in the picker.
 */
export const PICKER_ORDER: CaptionFieldKey[] = [
  'price',
  'finish',
  'artist',
  'number',
  'set',
  'series',
  // Below the fold, in every sense: nobody has asked for these, and they are the ones that stay
  // in the strip under the card rather than on it.
  'rarityCode',
  'stage',
  'released',
];

/** The fields in picker order. Anything missing from PICKER_ORDER still appears, at the end, so
 *  adding a field to CAPTION_FIELDS can never make it silently unreachable. */
export function pickerFields(): typeof CAPTION_FIELDS {
  const rank = (key: CaptionFieldKey) => {
    const i = PICKER_ORDER.indexOf(key);
    return i === -1 ? PICKER_ORDER.length : i;
  };
  return [...CAPTION_FIELDS].sort((a, b) => rank(a.key) - rank(b.key));
}

/**
 * Fields shown by default, and the set the 2026-09-01 rollout forces on (see `prefsEpoch`).
 *
 * These five are what someone holding the card can see for themselves: which set it is from, its
 * number in that set, who drew it, how it is printed, and what it is worth. Rarity code came out —
 * it is a two-letter code for a thing the finish chip and the art already say, and it was spending
 * a slot in the bottom row on it.
 */
export const DEFAULT_CAPTION_FIELDS: CaptionFieldKey[] = [
  'set',
  'artist',
  'number',
  'price',
  'finish',
];

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
