import { View } from 'react-native';

import { Palette } from '@/constants/theme';

/**
 * The michi-maker mark: a 3×3 pocket grid with one piece of art spanning two pockets —
 * the signature michi move, drawn as geometry. Plain Views (no svg dependency) so it
 * renders identically on web and native and stays crisp at any size.
 *
 * The same design is duplicated in scripts/brand-assets.mjs (HTML/CSS) to generate the
 * favicon and og-image PNGs — keep the two in sync if the mark changes.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  const gap = Math.max(1, Math.round(size / 12));
  const cell = (size - gap * 2) / 3;
  const radius = Math.max(1, cell * 0.24);
  const pocket = {
    width: cell,
    height: cell,
    borderRadius: radius,
    backgroundColor: 'rgba(128,128,128,0.35)',
  } as const;
  const art = {
    width: cell * 2 + gap,
    height: cell,
    borderRadius: radius,
    backgroundColor: Palette.accent,
  } as const;

  return (
    <View style={{ width: size, height: size, gap }} accessibilityLabel="michi-maker">
      <View style={{ flexDirection: 'row', gap }}>
        <View style={pocket} />
        <View style={pocket} />
        <View style={pocket} />
      </View>
      <View style={{ flexDirection: 'row', gap }}>
        <View style={art} />
        <View style={pocket} />
      </View>
      <View style={{ flexDirection: 'row', gap }}>
        <View style={pocket} />
        <View style={pocket} />
        <View style={pocket} />
      </View>
    </View>
  );
}
