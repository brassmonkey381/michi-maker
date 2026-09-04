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
import { memo, useState } from 'react';
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
  // Above the early return below, with the other hooks.
  const [measured, setMeasured] = useState<number | undefined>(undefined);
  const uri = d.cardId ? cardThumbUrl(d.cardId, 640) : d.imageUrl;
  if (!uri) return null;
  const box = decorationBox(d, W, H);
  const w = Math.max(8, box.w);
  const h = Math.max(8, box.h);
  const radius = maskRadius(d, w, h);
  const fill = d.fit === 'fill';
  const crop = d.crop;
  // THE ASPECT, FROM WHEREVER IT CAN BE HAD. Stored on the row; else the editor's measured
  // table; else measured HERE from the image itself. The last was missing, and it is the one
  // the viewer needs: only the editor passes `naturalAspect`, so a sliced picture whose row
  // carries no aspect was cropped while editing and drawn whole the moment editing ended.
  const aspect = d.aspect ?? naturalAspect ?? measured;
  const learn = (w: number, h: number) => {
    if (w > 0 && h > 0) setMeasured(w / h);
    onNaturalSize?.(d.id, w, h);
  };
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
          onLoad={!d.aspect ? (e) => learn(e.source.width, e.source.height) : undefined}
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
            onLoad={!d.aspect ? (e) => learn(e.source.width, e.source.height) : undefined}
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
function shapeStyle(bg: NonNullable<CoverTextDecoration['bg']>, w: number, h: number) {
  // The surface's own body: a plain Normal has nothing at all — that is what "unstyled" means.
  const surface = (() => {
    switch (bg.shape) {
      case 'postit':
        return { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 4, shadowOffset: { width: 1, height: 3 }, elevation: 3 };
      case 'notecard':
        return { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.22)' };
      case 'postcard':
        return { borderWidth: Math.max(1, w * 0.012), borderColor: 'rgba(0,0,0,0.28)' };
      default:
        return {};
    }
  })();
  // The corners: the edge dial when it is set, else the surface's own habit (a tag's clipped end).
  const edge = (() => {
    switch (bg.edge) {
      case 'rounded':
        return { borderRadius: Math.min(w, h) * 0.18 };
      case 'circle':
        return { borderRadius: Math.max(w, h) };
      case 'square':
        return { borderRadius: 0 };
      default:
        return bg.shape === 'tag'
          ? { borderRadius: Math.min(w, h) * 0.12, borderTopLeftRadius: Math.min(w, h) * 0.45, borderBottomLeftRadius: Math.min(w, h) * 0.45 }
          : bg.shape === 'notecard' || bg.shape === 'postcard'
            ? { borderRadius: 2 }
            : { borderRadius: 0 };
    }
  })();
  return { ...surface, ...edge };
}

/** Where a postcard's stamp box sits: top-right, a fifth of the shorter side, a little taller than wide. */
function postcardStamp(w: number, h: number) {
  const size = Math.max(8, Math.min(w, h) * 0.22);
  return { top: Math.max(3, h * 0.05), right: Math.max(3, w * 0.03), width: size, height: size * 1.15 };
}

/**
 * The extra marks a shape carries, drawn over its fill and under the words.
 *
 * A NOTECARD'S RULING FOLLOWS THE TEXT: one line under each line of writing, at the writing's own
 * pitch, wherever the block of text has ended up — so two lines of text sit on two rules and four
 * on four, the way a card you have written on looks. That needs the text's measured box, which
 * the text reports from its own layout; until it has, the card is unruled for a frame.
 */
function ShapeDetail({
  shape,
  w,
  h,
  px,
  textBox,
  lineHeight,
}: {
  shape: NonNullable<CoverTextDecoration['bg']>['shape'];
  w: number;
  h: number;
  px: number;
  textBox: { y: number; height: number } | null;
  lineHeight: number;
}) {
  if (shape === 'postit') {
    return <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(3, h * 0.14), backgroundColor: 'rgba(0,0,0,0.07)' }} />;
  }
  if (shape === 'notecard') {
    const lines = textBox && lineHeight > 0 ? Math.max(1, Math.round(textBox.height / lineHeight)) : 0;
    // The red head rule a real index card has, kept above the first line of writing when there is
    // room for it, and left off when the writing starts at the top.
    const headY = textBox ? textBox.y - lineHeight * 0.45 : -1;
    return (
      <>
        {headY > 2 ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: headY, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(200,60,60,0.55)' }} />
        ) : null}
        {textBox
          ? Array.from({ length: lines }, (_, i) => (
              <View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  // The rule sits just under the line box's bottom, where the pen would rest.
                  top: textBox.y + (i + 1) * lineHeight - Math.max(1, px * 0.08),
                  height: StyleSheet.hairlineWidth * 2,
                  backgroundColor: 'rgba(60,90,180,0.35)',
                }}
              />
            ))
          : null}
      </>
    );
  }
  if (shape === 'postcard') {
    const stamp = postcardStamp(w, h);
    return (
      <>
        <View pointerEvents="none" style={{ position: 'absolute', left: w / 2, top: h * 0.12, bottom: h * 0.12, width: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(0,0,0,0.22)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', right: stamp.right, top: stamp.top, width: stamp.width, height: stamp.height, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(0,0,0,0.3)', borderStyle: 'dashed' }} />
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
  const lineHeight = px * leading;
  // Where the block of text landed, from its own layout — what a notecard's ruling follows.
  const [textBox, setTextBox] = useState<{ y: number; height: number } | null>(null);
  // A POSTCARD IS WRITTEN ON THE RIGHT, under the stamp, so the left half stays clear for a photo
  // and the stamp box for a stamp — the reader's own, if they add one as a layer on top.
  const postcard = bg?.shape === 'postcard';
  const stamp = postcard ? postcardStamp(w, h) : null;
  const textFrame = stamp
    ? { position: 'absolute' as const, left: w / 2 + pad, right: pad, top: stamp.top + stamp.height + Math.max(2, px * 0.4), bottom: pad, justifyContent: 'flex-start' as const }
    : null;
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
            shapeStyle(bg, w, h),
          ]}>
          <ShapeDetail shape={bg.shape} w={w} h={h} px={px} textBox={textBox} lineHeight={lineHeight} />
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
        <View style={textFrame ?? undefined} pointerEvents="none">
          <Text
            allowFontScaling={false}
            numberOfLines={Math.max(1, Math.floor((textFrame ? h - textFrame.top - pad : h) / lineHeight))}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              // Offset into the decoration box when the text sits inside the postcard's frame.
              const top = (textFrame ? textFrame.top : 0) + y;
              setTextBox((cur) => (cur && Math.abs(cur.y - top) < 0.5 && Math.abs(cur.height - height) < 0.5 ? cur : { y: top, height }));
            }}
            style={{
              paddingHorizontal: textFrame ? 0 : pad,
              fontFamily: fontFamilyFor(d.font, Fonts as Record<string, string>),
              fontSize: px,
              lineHeight,
              fontWeight: d.weight === 'bold' ? '700' : '400',
              fontStyle: d.italic ? 'italic' : 'normal',
              textAlign: d.align ?? (postcard ? 'left' : 'center'),
              color: d.color,
            }}>
            {d.text}
          </Text>
        </View>
      )}
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
