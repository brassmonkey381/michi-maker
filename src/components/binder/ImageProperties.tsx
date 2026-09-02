/**
 * AN IMAGE'S OWN PROPERTIES — its crop, and where it came from.
 *
 * Crop is four insets, as percentages of the box's current edges, composed through applyCrop so
 * the pixels stay where they are on the cover and only what is visible changes. Numbers rather
 * than a drag mode on purpose for this first cut: a crop rectangle with its own handles is a
 * second gesture mode on a canvas that already has resize and rotate, and the numbers are exact,
 * undoable one step at a time, and cannot be confused with a resize.
 *
 * Provenance is shown, not hidden: the credit the sharing gate reads is the credit the owner sees.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NumField } from '@/components/binder/DecorationProperties';
import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import { flatChip } from '@/constants/ui';
import { isPrivateArt } from '@/data/artAttributionCheck';
import type { CoverImageDecoration } from '@/data/binderTypes';
import { applyCrop } from '@/data/coverGeometry';

export function ImageProperties({
  d,
  onReplace,
  surfaceAspect,
  naturalAspect,
}: {
  d: CoverImageDecoration;
  /** The whole row, replaced — a crop touches x, y, w, h and crop at once. */
  onReplace: (next: CoverImageDecoration) => void;
  surfaceAspect: number;
  /** Width ÷ height of the source as the renderer saw it load; the stored aspect wins if present. */
  naturalAspect?: number;
}) {
  const crop = d.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const aspect = d.aspect ?? naturalAspect;
  // Width ÷ height of what is SHOWN: the natural aspect narrowed by the crop window.
  const shownAspect = aspect ? (aspect * crop.w) / crop.h : undefined;
  const cropped = d.crop && (crop.x > 0 || crop.y > 0 || crop.w < 1 || crop.h < 1);
  // Trim one side by a percentage of the CURRENT box.
  const trim = (side: 'l' | 't' | 'r' | 'b', pct: number) => {
    const f = Math.max(0, Math.min(0.9, pct / 100));
    if (f === 0) return;
    const local = { l: 0, t: 0, r: 1, b: 1 };
    if (side === 'l') local.l = f;
    if (side === 't') local.t = f;
    if (side === 'r') local.r = 1 - f;
    if (side === 'b') local.b = 1 - f;
    // A crop needs a real height to work from; a legacy square gets one here. The natural aspect
    // is written alongside, once known, so every other context can letterbox the window correctly.
    onReplace(applyCrop({ ...d, h: d.h ?? d.w, ...(aspect && !d.aspect ? { aspect } : {}) }, local, surfaceAspect));
  };
  /** The box takes the shown picture's own shape at its current width: nothing letterboxed, nothing stretched. */
  const originalAspect = () => {
    if (!shownAspect) return;
    onReplace({ ...d, h: d.w / shownAspect, ...(aspect && !d.aspect ? { aspect } : {}), fit: undefined });
  };
  const priv = !!d.imageUrl && isPrivateArt(d.attribution, d.imageUrl);
  const originLabel =
    d.attribution?.origin === 'logo'
      ? 'Set logo'
      : d.attribution?.origin === 'upload'
        ? 'Your upload'
        : d.attribution?.origin === 'card'
          ? 'Card art'
          : d.attribution?.origin === 'external'
            ? 'From a link'
            : d.attribution?.origin === 'copied'
              ? 'Copied'
              : d.cardId
                ? 'Card art'
                : 'Unknown source';

  return (
    <View style={styles.panel} testID="image-properties">
      <Text style={styles.label}>Crop</Text>
      <Text style={styles.hint}>Trim a side by a percentage of the box. Each trim is one step of undo.</Text>
      <View style={styles.grid}>
        <NumField label="Trim left" value={0} onCommit={(v) => trim('l', v)} step={5} min={0} max={90} unit="%" />
        <NumField label="Trim right" value={0} onCommit={(v) => trim('r', v)} step={5} min={0} max={90} unit="%" />
        <NumField label="Trim top" value={0} onCommit={(v) => trim('t', v)} step={5} min={0} max={90} unit="%" />
        <NumField label="Trim bottom" value={0} onCommit={(v) => trim('b', v)} step={5} min={0} max={90} unit="%" />
      </View>
      {cropped ? (
        <View style={styles.row}>
          <Text style={styles.hint}>
            Showing {Math.round(crop.w * 100)}% × {Math.round(crop.h * 100)}% of the picture.
          </Text>
          <Pressable
            onPress={() => {
              // Back to the whole picture, at the same width, letting the box be the picture's shape.
              const { crop: _c, ...rest } = d;
              void _c;
              onReplace({ ...rest, h: d.aspect ? d.w / d.aspect : d.h });
            }}
            accessibilityRole="button"
            style={flatChip.base}>
            <Text style={flatChip.text}>Reset crop</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.label}>Fit</Text>
      <Text style={styles.hint}>A box that is not the picture’s shape either letterboxes it or stretches it.</Text>
      <View style={styles.row}>
        <Pressable onPress={() => onReplace({ ...d, fit: undefined })} accessibilityRole="button" accessibilityState={{ selected: d.fit !== 'fill' }} style={[flatChip.base, d.fit !== 'fill' && flatChip.active]} testID="fit-contain">
          <Text style={[flatChip.text, d.fit !== 'fill' && flatChip.textActive]}>Keep shape</Text>
        </Pressable>
        <Pressable onPress={() => onReplace({ ...d, fit: 'fill' })} accessibilityRole="button" accessibilityState={{ selected: d.fit === 'fill' }} style={[flatChip.base, d.fit === 'fill' && flatChip.active]} testID="fit-fill">
          <Text style={[flatChip.text, d.fit === 'fill' && flatChip.textActive]}>Stretch to fill</Text>
        </Pressable>
        <Pressable onPress={originalAspect} disabled={!shownAspect} accessibilityRole="button" style={[flatChip.base, !shownAspect && styles.dim]} testID="fit-original">
          <Text style={flatChip.text}>Original aspect</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Source</Text>
      <View style={styles.row}>
        <View style={[styles.badge, priv && styles.badgePrivate]}>
          <Text style={[styles.badgeText, priv && styles.badgeTextPrivate]}>{priv ? 'PRIVATE' : originLabel}</Text>
        </View>
        <Text style={styles.credit} numberOfLines={2}>
          {[d.attribution?.artist, d.attribution?.sourceName].filter(Boolean).join(' · ') || (d.imageUrl ? hostOf(d.imageUrl) : '')}
        </Text>
      </View>
      {priv ? (
        <Text style={styles.hint}>
          Linked from another site, so this binder can’t be shared publicly until the sharing sheet saves a copy to your account.
        </Text>
      ) : null}
    </View>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  panel: { gap: 6 },
  label: { fontSize: FontSize.sm, color: Palette.muted, fontWeight: Weight.medium, textTransform: 'uppercase', letterSpacing: 0.4 },
  hint: { fontSize: FontSize.sm, color: Palette.muted, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: Radius.control, backgroundColor: Palette.panel },
  badgePrivate: { backgroundColor: Palette.dangerBg },
  badgeText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink2, letterSpacing: 0.3 },
  badgeTextPrivate: { color: Palette.dangerAlt },
  credit: { fontSize: FontSize.sm, color: Palette.ink2, flexShrink: 1 },
  dim: { opacity: 0.4 },
});
