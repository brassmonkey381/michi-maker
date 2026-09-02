/**
 * ONE DECORATION, DRAWN — the same way on the spread, in the filmstrip, on the shelf thumb and in
 * the page-turn overlay, because the surface it sits on is drawn by one component and this is
 * what that component calls per row.
 *
 * WHAT IT HONOURS: the rotation, then flips inside the clip; opacity; a mask as a clipped corner
 * radius; `hidden` as nothing at all. A picture is CONTAINED in its box unless its fit says 'fill'
 * — the old square pixel for pixel, or whatever shape the box has since been resized to, with the
 * shown window (whole image, or the crop) letterboxed inside it. Letterboxing a crop needs the
 * source's natural aspect: stored on the row once known, and until then reported upward from the
 * image's own load so the editor can show the right thing before anything is written.
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

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The outer transform every kind shares: just the rotation. */
function outerTransform(d: CoverDecoration) {
  return d.rot ? [{ rotate: `${d.rot}deg` }] : undefined;
}

/** A mask as a corner radius on a clipping box. 'ellipse' over-asks and the platform caps it at half the shorter side. */
function maskRadius(d: CoverDecoration, w: number, h: number): number {
  if (!d.mask || d.mask.shape === 'rect') return 0;
  if (d.mask.shape === 'ellipse') return Math.max(w, h);
  return (d.mask.radius ?? 0.12) * Math.min(w, h);
}

function ImageDecoration({
  d,
  W,
  H,
  naturalAspect,
  onNaturalSize,
}: {
  d: CoverImageDecoration;
  W: number;
  H: number;
  naturalAspect?: number;
  onNaturalSize?: (id: string, w: number, h: number) => void;
}) {
  const uri = d.cardId ? cardThumbUrl(d.cardId, 640) : d.imageUrl;
  if (!uri) return null;
  const box = decorationBox(d, W, H);
  const w = Math.max(8, box.w);
  const h = Math.max(8, box.h);
  const radius = maskRadius(d, w, h);
  const fill = d.fit === 'fill';
  const crop = d.crop;
  const aspect = d.aspect ?? naturalAspect;
  // The inner box the SHOWN window occupies: the whole box when filling, else the largest box of
  // the window's own shape that fits inside — which needs the aspect. Without it, a cropped
  // picture cannot be letterboxed honestly, so it is contained whole instead (never stretched).
  let inner = { left: 0, top: 0, width: w, height: h };
  const windowed = !!crop && (fill || !!aspect);
  if (windowed && !fill && aspect) {
    const shown = (aspect * (crop!.w || 1)) / (crop!.h || 1);
    const iw = Math.min(w, h * shown);
    const ih = iw / shown;
    inner = { left: (w - iw) / 2, top: (h - ih) / 2, width: iw, height: ih };
  }
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
        overflow: !windowed && !radius ? 'visible' : 'hidden',
        borderRadius: radius,
      }}>
      {!windowed ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { transform: [{ scaleX: d.flipH ? -1 : 1 }, { scaleY: d.flipV ? -1 : 1 }] }]}
          contentFit={fill ? 'fill' : 'contain'}
          cachePolicy="memory-disk"
          recyclingKey={uri}
          transition={0}
          onLoad={onNaturalSize && !d.aspect ? (e) => onNaturalSize(d.id, e.source.width, e.source.height) : undefined}
        />
      ) : (
        <View style={{ position: 'absolute', ...inner, overflow: 'hidden' }}>
          <Image
            source={{ uri }}
            // The quarter turns were folded into `rot` when the row was made; only the flips remain.
            style={windowedImageStyle(inner.width, inner.height, crop, { rot: 0, flipH: d.flipH, flipV: d.flipV })}
            contentFit="fill"
            cachePolicy="memory-disk"
            recyclingKey={uri}
            transition={0}
            onLoad={onNaturalSize && !d.aspect ? (e) => onNaturalSize(d.id, e.source.width, e.source.height) : undefined}
          />
        </View>
      )}
    </View>
  );
}

/**
 * What each background shape looks like, given the box. All plain Views, no SVG dependency — and
 * each one carries the detail that makes it read as the object rather than as a tinted rectangle:
 *   box       sharp corners and a thin dark rule, a label.
 *   post-it   square, a slightly deeper band along the top where the glue is, a soft lift.
 *   notecard  faint blue ruling with a red rule at the top, a stiff square-cornered card.
 *   postcard  a wide border, a divider down the middle and a stamp box top-right.
 *   tag       a hole with a ring, and a clipped corner on the left.
 */
function shapeStyle(shape: NonNullable<CoverTextDecoration['bg']>['shape'], w: number, h: number) {
  switch (shape) {
    case 'rect':
      return { borderRadius: 0, borderWidth: 1, borderColor: 'rgba(0,0,0,0.45)' };
    case 'rounded':
      return { borderRadius: Math.min(w, h) * 0.18 };
    case 'circle':
      return { borderRadius: Math.max(w, h) };
    case 'postit':
      return { borderRadius: 0, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 4, shadowOffset: { width: 1, height: 3 }, elevation: 3 };
    case 'notecard':
      return { borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.22)' };
    case 'postcard':
      return { borderRadius: 2, borderWidth: Math.max(1, w * 0.012), borderColor: 'rgba(0,0,0,0.28)' };
    case 'tag':
      return { borderRadius: Math.min(w, h) * 0.12, borderTopLeftRadius: Math.min(w, h) * 0.45, borderBottomLeftRadius: Math.min(w, h) * 0.45 };
    default:
      return { borderRadius: 0 };
  }
}

/** The extra marks a shape carries, drawn over its fill and under the words. */
function ShapeDetail({ shape, w, h, px }: { shape: NonNullable<CoverTextDecoration['bg']>['shape']; w: number; h: number; px: number }) {
  if (shape === 'postit') {
    return <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(3, h * 0.14), backgroundColor: 'rgba(0,0,0,0.07)' }} />;
  }
  if (shape === 'notecard') {
    return (
      <>
        <NotecardRules h={h} px={px} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: Math.max(6, px * 1.2), height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(200,60,60,0.55)' }} />
      </>
    );
  }
  if (shape === 'postcard') {
    const stamp = Math.max(8, Math.min(w, h) * 0.22);
    return (
      <>
        <View pointerEvents="none" style={{ position: 'absolute', left: w / 2, top: h * 0.12, bottom: h * 0.12, width: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(0,0,0,0.22)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', right: Math.max(3, w * 0.03), top: Math.max(3, h * 0.05), width: stamp, height: stamp * 1.15, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(0,0,0,0.3)', borderStyle: 'dashed' }} />
      </>
    );
  }
  if (shape === 'tag') {
    const hole = Math.max(4, Math.min(w, h) * 0.14);
    return <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(3, Math.min(w, h) * 0.18), top: h / 2 - hole / 2, width: hole, height: hole, borderRadius: hole, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(0,0,0,0.35)' }} />;
  }
  return null;
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
          <ShapeDetail shape={bg.shape} w={w} h={h} px={px} />
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
  naturalAspect,
  onNaturalSize,
}: {
  d: CoverDecoration;
  /** The surface's width and height in px. */
  W: number;
  H: number;
  /** The source's width ÷ height when the editor has seen it load and the row does not store it yet. */
  naturalAspect?: number;
  /** Reported once per image load, so the editor can letterbox a crop before the aspect is stored. */
  onNaturalSize?: (id: string, w: number, h: number) => void;
}) {
  if (d.hidden) return null;
  if (d.kind === 'text') return <TextDecoration d={d} W={W} H={H} />;
  return <ImageDecoration d={d} W={W} H={H} naturalAspect={naturalAspect} onNaturalSize={onNaturalSize} />;
});
