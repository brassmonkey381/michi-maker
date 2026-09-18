/**
 * A CARD'S PUBLISHED PALETTE, as stops on the tri-color mix bar.
 *
 * The colours come from the same on-device blob the colour search runs against, so what a card
 * hands the mix bar is exactly what the search would have matched it on — no re-reading of the
 * picture, no approximation from its art.
 *
 * Its own module rather than a component's: the eyedropper can be answered by a tap anywhere in
 * the app, and none of those surfaces should have to import a sheet to convert a palette.
 */
import { labToSrgb, type ColorIndex, type ColorRegion } from 'tcgscan-browse';

import { type RGB, type Stop } from '@/components/color/ColorPicker';
import { paletteStops } from '@/data/paletteStops';

/**
 * `cardId`'s palette for `region` as mix-bar stops, biggest colour first, or [] when the blob
 * holds nothing for it (about 4% of One Piece: cards with no usable image when it was built).
 */
export function stopsForCard(index: ColorIndex | null, cardId: string, region: ColorRegion): Stop[] {
  if (!index?.has(cardId)) return [];
  return paletteStops(index.colors(cardId, region)).map(({ pos, color }) => {
    const { r, g, b } = labToSrgb(color.L, color.a, color.b);
    return { pos, rgb: [r, g, b] as RGB };
  });
}
