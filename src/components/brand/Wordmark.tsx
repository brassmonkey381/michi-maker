/**
 * THE NAME, WRITTEN THE ONE WAY. "Michi-Maker", with the hyphen in the accent — the colour the
 * mark fills two of its nine pockets with — so the word and the mark are visibly the same brand.
 *
 * Renders as inline text, so it drops into any sentence or header: `<Wordmark />` inherits the
 * font, size and colour of the Text around it and only the hyphen is its own. A first step toward
 * a real wordmark; when that arrives it replaces this in one place.
 */
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { Palette } from '@/constants/theme';

export const BRAND_NAME = 'Michi-Maker';

export function Wordmark({ style }: { style?: StyleProp<TextStyle> }) {
  const [head, tail] = BRAND_NAME.split('-');
  return (
    <Text style={style}>
      {head}
      <Text style={[style, { color: Palette.accent }]}>-</Text>
      {tail}
    </Text>
  );
}
