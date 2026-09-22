import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { LogoMark } from '@/components/brand/LogoMark';
import { Palette } from '@/constants/theme';

/**
 * Below this many px on the short edge, the brand mark and the caption are dropped and the bare
 * picture-frame motif is drawn instead. A binder pocket is ~63px: a logo there is a smudge and
 * "Image Coming Soon" is two unreadable lines, so the silhouette alone does the job.
 */
const BRAND_MIN = 96;

/**
 * Card-shaped "no image yet" placeholder — replaces the bare "?" so a pocket or tile keeps its
 * silhouette when an image can't resolve (unmirrored upcoming sets, empty card ids, sealed
 * products without shots). Pure Views, no bitmap asset: the picture-frame motif derives its
 * proportions from the measured box, so it renders crisply at every size, from a 63px pocket
 * to the 640px inspection view.
 *
 * Fills its parent by default (the parent owns the shape, so nothing collapses); pass
 * `standalone` when there is no sized parent and it should assert the card aspect itself.
 *
 * AT A READABLE SIZE IT SAYS SO. Above BRAND_MIN it draws michi-maker's mark with "Image Coming
 * Soon" beneath it, because at tile and inspection sizes an unexplained grey rectangle reads as a
 * broken image rather than as a card the catalogue has no art for yet. Composed from the mark plus
 * live text rather than a pre-rendered bitmap, so it stays crisp at every size the way the rest of
 * this component already does — the baked PNG that tcgscan-data's catalog/coming_soon.py writes is
 * for consumers that can only take an image source.
 *
 * NOT the same thing as TCGPlayer's placeholder. They serve their own logo-watermarked "Image
 * Coming Soon" JPEG with an HTTP 200, and tcgscan-data's catalog/placeholders.py suppresses those
 * from the image manifest precisely so one never lands in a pocket here.
 */
export function CardPlaceholder({
  radius = 0,
  standalone = false,
  style,
}: {
  radius?: number;
  /** Assert the 63:88 card aspect instead of filling the parent. */
  standalone?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [size, setSize] = useState(0);

  // Motif proportions from the measured box (min edge) — same drawing at every scale.
  const g = size * 0.4; // picture-frame width
  const stroke = Math.max(1, g * 0.055);
  const frame = {
    width: g,
    height: g * 0.8,
    borderRadius: Math.max(2, g * 0.1),
    borderWidth: stroke,
  };
  const sun = {
    width: g * 0.16,
    height: g * 0.16,
    borderRadius: g * 0.08,
    top: g * 0.12,
    left: g * 0.14,
  };
  // Two rotated squares poking up from the frame's bottom edge — the classic image-icon hills.
  const hillA = {
    width: g * 0.42,
    height: g * 0.42,
    left: g * 0.08,
    bottom: -g * 0.24,
  };
  const hillB = {
    width: g * 0.56,
    height: g * 0.56,
    right: g * 0.06,
    bottom: -g * 0.3,
  };

  return (
    <View
      onLayout={(e) => setSize(Math.min(e.nativeEvent.layout.width, e.nativeEvent.layout.height))}
      style={[
        standalone ? styles.standalone : StyleSheet.absoluteFill,
        styles.mat,
        { borderRadius: radius },
        style,
      ]}>
      {size > 8 && size < BRAND_MIN ? (
        <View style={[styles.frame, frame]}>
          <View style={[styles.motif, sun]} />
          <View style={[styles.motif, styles.hill, hillA]} />
          <View style={[styles.motif, styles.hill, hillB]} />
        </View>
      ) : null}
      {size >= BRAND_MIN ? (
        <View style={styles.brand}>
          {/* THE MARK, NOT THE APP ICON. assets/images/icon.png is still the stock Expo chevron,
              so drawing it here branded every art-less card with Expo. LogoMark is the real
              michi mark and is pure geometry, so it stays crisp at every size this renders at. */}
          <LogoMark size={size * 0.42} />
          <Text
            numberOfLines={2}
            style={[
              styles.caption,
              { fontSize: Math.max(10, size * 0.082), marginTop: size * 0.07 },
            ]}>
            Image Coming Soon
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  standalone: { width: '100%', aspectRatio: 63 / 88 },
  mat: {
    backgroundColor: Palette.hairline,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  frame: {
    borderColor: Palette.hairlineStrong,
    overflow: 'hidden',
  },
  motif: { position: 'absolute', backgroundColor: Palette.hairlineStrong },
  hill: { transform: [{ rotate: '45deg' }] },
  brand: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: '8%' },
  caption: { color: Palette.hairlineStrong, fontWeight: '600', textAlign: 'center' },
});
