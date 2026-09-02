/**
 * ONE DECORATION, DRAWN — the same way on the spread, in the filmstrip, on the shelf thumb and in
 * the page-turn overlay, because the surface it sits on is drawn by one component and this is
 * what that component calls per row.
 *
 * WHAT IT HONOURS, in transform order: perspective tilt (rotateX/rotateY) first, then the flat
 * rotation, then flips inside the clip; opacity; a mask as a clipped corner radius; `hidden` as
 * nothing at all. A LEGACY row (no h) is the old w×w square with the picture letterboxed inside
 * it, pixel for pixel, so nothing already saved moves; a row with h fills its box through the
 * same window arithmetic the studio uses, so crop and flips mean the same thing here as there.
 *
 * TEXT below four pixels — the 58px filmstrip — draws its background shape and one ink bar per
 * line instead of glyphs: never a smudge, always "there is text here". Gating text off entirely
 * at small sizes would make the strip lie about what is on the cover.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import type { CoverDecoration, CoverImageDecoration, CoverTextDecoration } from '@/data/binderTypes';
import { decorationBox } from '@/data/coverGeometry';
import { TEXT_DEFAULT_LEADING, TEXT_LEGIBLE_PX, fontFamilyFor } from '@/data/decorationFonts';
import { windowedImageStyle } from '@/data/imageWindow';
import { cardThumbUrl } from '@/lib/catalogConfig';

/** Depth of the perspective camera, in px. Deep enough that a 45° tilt reads as a tilt, not a fold. */
const PERSPECTIVE = 800;

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The outer transform every kind shares. Perspective first, or the tilt is applied flat. */
function outerTransform(d: CoverDecoration) {
  const t: ({ perspective: number } | { rotateX: string } | { rotateY: string } | { rotate: string })[] = [];
  if (d.tiltX || d.tiltY) {
    t.push({ perspective: PERSPECTIVE });
    if (d.tiltX) t.push({ rotateX: `${d.tiltX}deg` });
    if (d.tiltY) t.push({ rotateY: `${d.tiltY}deg` });
  }
  if (d.rot) t.push({ rotate: `${d.rot}deg` });
  return t.length ? t : undefined;
}

/** A mask as a corner radius on a clipping box. 'ellipse' over-asks and the platform caps it at half the shorter side. */
function maskRadius(d: CoverDecoration, w: number, h: number): number {
  if (!d.mask || d.mask.shape === 'rect') return 0;
  if (d.mask.shape === 'ellipse') return Math.max(w, h);
  return (d.mask.radius ?? 0.12) * Math.min(w, h);
}

function ImageDecoration({ d, W, H }: { d: CoverImageDecoration; W: number; H: number }) {
  const uri = d.cardId ? cardThumbUrl(d.cardId, 640) : d.imageUrl;
  if (!uri) return null;
  const box = decorationBox(d, W, H);
  const w = Math.max(8, box.w);
  const h = Math.max(8, box.h);
  const legacy = d.h == null;
  const radius = maskRadius(d, w, h);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: box.cx - w / 2,
        top: box.cy - h / 2,
        width: w,
        height: h,
        opacity: d.opacity ?? 1,
        transform: outerTransform(d),
        // Only clip when something needs clipping: a legacy square letterboxes inside its box and
        // must not be cut, and a plain box with no mask does not need the extra layer.
        overflow: legacy && !radius ? 'visible' : 'hidden',
        borderRadius: radius,
      }}>
      {legacy ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={uri}
          transition={0}
        />
      ) : (
        <Image
          source={{ uri }}
          // The quarter turns were folded into `rot` when the row was made; only the flips remain.
          style={windowedImageStyle(w, h, d.crop, { rot: 0, flipH: d.flipH, flipV: d.flipV })}
          contentFit="fill"
          cachePolicy="memory-disk"
          recyclingKey={uri}
          transition={0}
        />
      )}
    </View>
  );
}

/** What each background shape looks like, given the box. All plain Views: no SVG dependency. */
function shapeStyle(shape: NonNullable<CoverTextDecoration['bg']>['shape'], w: number, h: number) {
  switch (shape) {
    case 'rounded':
      return { borderRadius: Math.min(w, h) * 0.18 };
    case 'circle':
      return { borderRadius: Math.max(w, h) };
    case 'postit':
      // Square-cornered, with the faint lift a stuck note has.
      return { borderRadius: 1, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 1, height: 2 }, elevation: 2 };
    case 'notecard':
      return { borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.18)' };
    case 'postcard':
      return { borderRadius: 2, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' };
    case 'tag':
      return { borderRadius: Math.min(w, h) * 0.12 };
    default:
      return { borderRadius: 0 };
  }
}

function TextDecoration({ d, W, H }: { d: CoverTextDecoration; W: number; H: number }) {
  const box = decorationBox(d, W, H);
  const w = Math.max(4, box.w);
  const h = Math.max(4, box.h);
  const px = d.size * W;
  const leading = d.leading ?? TEXT_DEFAULT_LEADING;
  const pad = (d.bg?.pad ?? 0.02) * W;
  const bg = d.bg && d.bg.shape !== 'none' ? d.bg : null;
  const lines = Math.max(1, d.text.split('\n').length);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: box.cx - w / 2,
        top: box.cy - h / 2,
        width: w,
        height: h,
        opacity: d.opacity ?? 1,
        transform: outerTransform(d),
        justifyContent: 'center',
      }}>
      {bg ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: withAlpha(bg.color, bg.opacity ?? 1) },
            shapeStyle(bg.shape, w, h),
          ]}>
          {bg.shape === 'notecard' ? <NotecardRules h={h} px={px} /> : null}
          {bg.shape === 'tag' ? <View style={[styles.tagHole, { left: Math.max(3, w * 0.05), width: Math.max(4, w * 0.06), height: Math.max(4, w * 0.06), borderRadius: w }]} /> : null}
        </View>
      ) : null}
      {px < TEXT_LEGIBLE_PX ? (
        // Too small to read: one bar per line says "text is here" without pretending to be words.
        <View style={{ paddingHorizontal: pad, gap: Math.max(1, px * 0.4), alignItems: d.align === 'left' ? 'flex-start' : d.align === 'right' ? 'flex-end' : 'center' }}>
          {Array.from({ length: Math.min(lines, 6) }, (_, i) => (
            <View key={i} style={{ height: 1, width: `${60 + ((i * 17) % 35)}%`, backgroundColor: d.color, opacity: 0.8 }} />
          ))}
        </View>
      ) : (
        <Text
          allowFontScaling={false}
          numberOfLines={Math.max(1, Math.floor(h / (px * leading)))}
          style={{
            paddingHorizontal: pad,
            fontFamily: fontFamilyFor(d.font, Fonts as Record<string, string>),
            fontSize: px,
            lineHeight: px * leading,
            fontWeight: d.weight === 'bold' ? '700' : '400',
            fontStyle: d.italic ? 'italic' : 'normal',
            textAlign: d.align ?? 'center',
            color: d.color,
          }}>
          {d.text}
        </Text>
      )}
    </View>
  );
}

/** The faint ruling of an index card. */
function NotecardRules({ h, px }: { h: number; px: number }) {
  const gap = Math.max(6, px * 1.2);
  const count = Math.max(0, Math.floor(h / gap) - 1);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: gap * (i + 1), height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(60,90,180,0.28)' }} />
      ))}
    </View>
  );
}

export const CoverDecorationView = memo(function CoverDecorationView({
  d,
  W,
  H,
}: {
  d: CoverDecoration;
  /** The surface's width and height in px. */
  W: number;
  H: number;
}) {
  if (d.hidden) return null;
  if (d.kind === 'text') return <TextDecoration d={d} W={W} H={H} />;
  return <ImageDecoration d={d} W={W} H={H} />;
});

const styles = StyleSheet.create({
  tagHole: { position: 'absolute', top: '50%', marginTop: -3, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.3)' },
});
