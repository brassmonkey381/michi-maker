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
  | 'price';

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
 * The caption fields in their canonical *display* order — series → set → artist → rarity code →
 * … — each with a chip label and an accessor pulling its value off a `CatalogCard` ('' when the
 * field is absent/empty for that card). Display order is fixed here regardless of the order the
 * user toggles fields on.
 */
export const CAPTION_FIELDS: {
  key: CaptionFieldKey;
  label: string;
  get: (c: CatalogCard, extras: CaptionExtras) => string;
}[] = [
  { key: 'series', label: 'Series', get: (c) => c.seriesId },
  { key: 'set', label: 'Set', get: (c) => c.setName },
  { key: 'artist', label: 'Artist', get: (c) => c.illustrator },
  { key: 'rarityCode', label: 'Rarity code', get: (c) => rarityCode(c.rarity) },
  { key: 'number', label: 'Number', get: (c) => c.number },
  { key: 'stage', label: 'Stage', get: (c) => c.stage },
  { key: 'released', label: 'Released', get: (c) => formatFullDate(c.releaseDate) },
  { key: 'price', label: 'Price', get: (_c, extras) => formatUsd(extras.price ?? 0) },
];

/** Fields shown by default the first time captions are switched on. */
export const DEFAULT_CAPTION_FIELDS: CaptionFieldKey[] = ['set', 'number', 'rarityCode'];

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
  return CAPTION_FIELDS.filter((f) => on.has(f.key))
    .map((f) => f.get(card, extras).trim())
    .filter((v) => v.length > 0)
    .join(' * ');
}
