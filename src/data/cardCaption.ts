/**
 * Card caption metadata — the "labels under a card" feature for binder views.
 *
 * The caption reads straight from the shared catalog's rich `CatalogCard` (series, set, name,
 * artist, rarity, type, …) rather than the lossy `DemoCard` editor view-model — so every field
 * is available without widening `DemoCard`. This file owns the michi-specific concerns: which
 * fields exist, their human labels, the canonical *display* order, and the `*`-joined format.
 */
import type { CatalogCard } from '@/lib/catalog';
import { rarityCode } from '@/data/rarityCode';

/** A metadata field that can be shown as a caption under a card. */
export type CaptionFieldKey =
  | 'series'
  | 'set'
  | 'name'
  | 'artist'
  | 'rarity'
  | 'rarityCode'
  | 'type'
  | 'number'
  | 'stage'
  | 'setCode'
  | 'released';

/**
 * The caption fields in their canonical *display* order — series → set → name → artist →
 * rarity → … — each with a chip label and an accessor pulling its value off a `CatalogCard`
 * ('' when the field is absent/empty for that card). Display order is fixed here regardless of
 * the order the user toggles fields on.
 */
export const CAPTION_FIELDS: {
  key: CaptionFieldKey;
  label: string;
  get: (c: CatalogCard) => string;
}[] = [
  { key: 'series', label: 'Series', get: (c) => c.seriesId },
  { key: 'set', label: 'Set', get: (c) => c.setName },
  { key: 'name', label: 'Name', get: (c) => c.name },
  { key: 'artist', label: 'Artist', get: (c) => c.illustrator },
  { key: 'rarity', label: 'Rarity', get: (c) => c.rarity },
  { key: 'rarityCode', label: 'Rarity code', get: (c) => rarityCode(c.rarity) },
  { key: 'type', label: 'Type', get: (c) => c.types.join('/') },
  { key: 'number', label: 'Number', get: (c) => c.number },
  { key: 'stage', label: 'Stage', get: (c) => c.stage },
  { key: 'setCode', label: 'Set code', get: (c) => c.setCode },
  { key: 'released', label: 'Released', get: (c) => (c.releaseDate ? c.releaseDate.slice(0, 4) : '') },
];

/** Fields shown by default the first time captions are switched on. */
export const DEFAULT_CAPTION_FIELDS: CaptionFieldKey[] = ['set', 'number', 'rarityCode'];

/**
 * Build a card's caption: the enabled fields, in `CAPTION_FIELDS` order, dropping any that are
 * empty for this card, joined by " * ". Returns '' when there's nothing to show.
 */
export function formatCaption(card: CatalogCard, enabled: Iterable<CaptionFieldKey>): string {
  const on = new Set(enabled);
  return CAPTION_FIELDS.filter((f) => on.has(f.key))
    .map((f) => f.get(card).trim())
    .filter((v) => v.length > 0)
    .join(' * ');
}
