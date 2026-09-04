/**
 * WHERE A CARD LABEL GOES WHEN YOU TAP IT, in a binder you are reading.
 *
 * A label is a fact about the card: who drew it, which set it is from, what it is worth. Each of
 * those is also a question worth asking of the whole catalog — "what else did this artist draw",
 * "what else is in this set" — and the browser can answer it in one query. So in a read-only
 * binder every label is a link: the price goes to the card's TCGplayer product page (through the
 * affiliate deep link the rest of the app uses), and everything else becomes the browse search
 * that filters to that one attribute.
 *
 * Pure: the label kind and the card in, a query or a URL out. The grid decides when labels are
 * links (never while editing, where a label that swallowed a tap would make a card immovable).
 */
import type { CaptionFieldKey } from '@/data/cardCaption';

/** The card fields a label can point at. Structural, so this file needs no catalog import. */
export interface LinkableCard {
  id: string;
  illustrator?: string;
  setName?: string;
  seriesId?: string;
  number?: string;
  rarity?: string;
  stage?: string;
  releaseDate?: string;
}

/** Quote a value for the search grammar; a value with a quote in it is not searchable as one. */
function q(value: string): string {
  const v = value.trim().replace(/"/g, '');
  return v.includes(' ') ? `"${v}"` : v;
}

/**
 * The browse query a label stands for, or null when the label is not a search (the price) or the
 * card has nothing for it. The grammar is the browse kit's: `field:value`, quoted when spaced.
 */
export function labelQuery(key: CaptionFieldKey, card: LinkableCard): string | null {
  switch (key) {
    case 'artist':
      return card.illustrator ? `artist:${q(card.illustrator)}` : null;
    case 'set':
      return card.setName ? `set:${q(card.setName)}` : null;
    case 'series':
      return card.seriesId ? `series:${q(card.seriesId)}` : null;
    case 'number':
      // A number alone is meaningless across the catalog; with its set it names one printing.
      return card.setName && card.number ? `set:${q(card.setName)} num:${q(card.number)}` : null;
    case 'rarityCode':
      return card.rarity ? `rarity:${q(card.rarity)}` : null;
    case 'stage':
      return card.stage ? `stage:${q(card.stage)}` : null;
    case 'released':
      return card.releaseDate && /^\d{4}/.test(card.releaseDate) ? `year:${card.releaseDate.slice(0, 4)}` : null;
    default:
      return null;
  }
}

/** True for the one label that leaves the app: the price goes to the product page. */
export function labelIsProductLink(key: CaptionFieldKey): boolean {
  return key === 'price';
}
