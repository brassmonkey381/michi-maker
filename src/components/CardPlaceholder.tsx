import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Palette } from '@/constants/theme';

/**
 * Card-shaped "no image yet" placeholder — replaces the bare "?" so a pocket or tile keeps its
 * silhouette when an image can't resolve (unmirrored upcoming sets, empty card ids, sealed
 * products without shots). Pure Views, no bitmap asset: the picture-frame motif derives its
 * proportions from the measured box, so it renders crisply at every size, from a 63px pocket
 * to the 640px inspection view.
 *
 * Fills its parent by default (the parent owns the shape, so nothing collapses); pass
 * `standalone` when there is no sized parent and it should assert the card aspect itself.
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
      {size > 8 ? (
        <View style={[styles.frame, frame]}>
          <View style={[styles.motif, sun]} />
          <View style={[styles.motif, styles.hill, hillA]} />
          <View style={[styles.motif, styles.hill, hillB]} />
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
});
