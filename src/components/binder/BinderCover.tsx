/**
 * THE BINDER ITSELF, drawn rather than photographed.
 *
 * A michi binder's pages have always floated on a plain ground. This draws the object they live
 * in: a padded Exo-Tec shell with its stitching, its zip, its spine and its microfibre lining,
 * built from the model's own published facts (see binderModels.ts) rather than from an asset, so a
 * new colourway is six hex values and no new artwork.
 *
 * IT IS BUILT FROM PLAIN VIEWS ON PURPOSE. Every part of the material is a shape with a reason:
 * the weave is a grid because Exo-Tec is a woven fabric, the shell is lighter at the top because a
 * padded panel catches the light there, the seam is a dashed line inset from the edge because that
 * is where a binder is actually stitched. An image of a binder would look better for one product
 * and be useless for the next one; this scales to a catalogue, prints at any size, and recolours
 * without a round trip to anyone with a paint tool.
 *
 * A SURFACE IS A CANVAS. All four of them (front, inside front, inside back, back) take stickers,
 * placed by fraction so a cover drawn 200px wide in a list and 900px wide in the editor is the
 * same cover. Rendering is shared; only the editor adds handles on top.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import {
  binderColourway,
  coverAspect,
  surfaceIsInside,
  surfaceSide,
  type BinderModel,
  type CoverSurfaceId,
} from '@/data/binderModels';
import type { CoverSticker } from '@/data/binderTypes';
import { cardThumbUrl } from '@/lib/catalogConfig';

/** Fractions of the cover's width. A real binder's proportions do not change with its size. */
const SEAM_INSET = 0.045;
const ZIP_WIDTH = 0.032;
const SPINE_MIN = 10;
/** Below this the weave is noise rather than texture, so it is left off entirely. */
const WEAVE_MIN_WIDTH = 140;
const WEAVE_PITCH = 11;

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * The woven grain of the shell. Two sets of hairlines, one lighter and one darker, so the fabric
 * reads as threads crossing rather than as a printed grid.
 */
function Weave({ width, height, light }: { width: number; height: number; light?: boolean }) {
  if (width < WEAVE_MIN_WIDTH) return null;
  const cols = Math.floor(width / WEAVE_PITCH);
  const rows = Math.floor(height / WEAVE_PITCH);
  const lit = light ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.05)';
  const dim = light ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.16)';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: cols }, (_, i) => (
        <View
          key={`v${i}`}
          style={{ position: 'absolute', top: 0, bottom: 0, left: i * WEAVE_PITCH, width: 1, backgroundColor: dim }}
        />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={`h${i}`}
          style={{ position: 'absolute', left: 0, right: 0, top: i * WEAVE_PITCH, height: 1, backgroundColor: lit }}
        />
      ))}
    </View>
  );
}

/**
 * The zip, running down the opening edge. Teeth are drawn as a dashed border rather than as one
 * view per tooth: a 350mm binder has upwards of a hundred and fifty of them, and a dashed line is
 * one node that says the same thing.
 */
function Zip({
  width,
  height,
  side,
  tape,
  teeth,
  pull,
}: {
  width: number;
  height: number;
  /** The edge the zip runs down: the one AWAY from the spine. */
  side: 'left' | 'right';
  tape: string;
  teeth: string;
  pull: string;
}) {
  const w = Math.max(6, width * ZIP_WIDTH);
  return (
    <View
      pointerEvents="none"
      style={[styles.zip, { width: w, backgroundColor: tape }, side === 'left' ? { left: 0 } : { right: 0 }]}>
      <View style={[styles.zipTeeth, { borderColor: teeth }]} />
      {/* The pull, parked a third of the way down where a closed binder leaves it. */}
      <View
        style={[
          styles.zipPull,
          { backgroundColor: pull, top: height * 0.33, width: w * 0.7, height: w * 2.2, borderRadius: w * 0.35 },
        ]}
      />
    </View>
  );
}

export function CoverSurface({
  model,
  colourwayId,
  surface,
  width,
  stickers,
  style,
  wheelTarget,
  children,
}: {
  model: BinderModel;
  colourwayId: string;
  surface: CoverSurfaceId;
  /** Width in px. Height follows from the model's proportions. */
  width: number;
  stickers?: CoverSticker[];
  style?: StyleProp<ViewStyle>;
  /**
   * Mark this surface as a thing the page wheel flips over. The binder viewer only turns pages
   * when the pointer is over a page rectangle (data-binder-page, see BinderPages' wheel handler),
   * and a cover in the viewer is a page for that purpose. Opt-in, because the same surface is also
   * drawn in pickers and thumbnails where a wheel means scrolling.
   */
  wheelTarget?: boolean;
  /** Editor chrome (selection handles, drop targets) drawn over the finished surface. */
  children?: React.ReactNode;
}) {
  const colour = binderColourway(model, colourwayId);
  const height = width / coverAspect(model);
  const inside = surfaceIsInside(surface);
  const side = surfaceSide(surface);
  // The spine is the binding edge; the zip runs down the other one.
  const openingSide = side === 'left' ? 'left' : 'right';
  const radius = Math.max(6, width * 0.035);
  const seam = Math.max(6, width * SEAM_INSET);

  const base = inside ? colour.lining : colour.shell;
  const lightSurface = inside ? true : Boolean(colour.light);

  return (
    <View
      style={[{ width, height, borderRadius: radius, backgroundColor: base, overflow: 'hidden' }, styles.shell, style]}
      // react-native-web renders dataSet as data-* attributes; the same typed spread BinderGrid
      // uses, because RN's ViewProps does not know about dataSet. No-op on native.
      {...(wheelTarget ? ({ dataSet: { binderPage: '1' } } as unknown as ViewProps) : {})}>
      {/* A padded panel is lit from above and falls away at the foot. */}
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha('#ffffff', lightSurface ? 0.5 : 0.12), 'transparent', withAlpha('#000000', 0.22)]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {inside ? null : <Weave width={width} height={height} light={colour.light} />}

      {/* The seam: stitched in from the edge, all the way round, in the model's thread. */}
      <View
        pointerEvents="none"
        style={[
          styles.seam,
          { margin: seam, borderRadius: Math.max(2, radius - seam / 2), borderColor: colour.stitch },
        ]}
      />

      {/* Interior surfaces are microfibre: no weave, a softer sheen, and the edition stamp. */}
      {inside ? (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', withAlpha('#000000', 0.08)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {model.liningStamp && surface === 'frontInside' && width >= WEAVE_MIN_WIDTH ? (
            <Text
              style={[
                styles.stamp,
                { color: withAlpha(colour.badge, 0.75), fontSize: Math.max(7, width * 0.028), letterSpacing: width * 0.006 },
              ]}>
              {model.liningStamp}
            </Text>
          ) : null}
        </>
      ) : null}

      {/* The brand mark sits low and centred on the front, and nowhere else. */}
      {surface === 'front' && width >= WEAVE_MIN_WIDTH ? (
        <Text
          style={[
            styles.badge,
            { color: colour.badge, fontSize: Math.max(9, width * 0.05), letterSpacing: width * 0.01 },
          ]}>
          {model.brand.toUpperCase()}
        </Text>
      ) : null}

      {/* Everything the owner has put on this surface, in the order they put it there. */}
      {(stickers ?? []).map((sticker) => {
        const uri = sticker.cardId ? cardThumbUrl(sticker.cardId, 640) : sticker.imageUrl;
        if (!uri) return null;
        const w = Math.max(8, sticker.w * width);
        return (
          <Image
            key={sticker.id}
            source={{ uri }}
            style={{
              position: 'absolute',
              left: sticker.x * width - w / 2,
              top: sticker.y * height - w / 2,
              width: w,
              height: w,
              transform: sticker.rot ? [{ rotate: `${sticker.rot}deg` }] : undefined,
            }}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={uri}
            transition={0}
          />
        );
      })}

      {model.closure === 'zip' && !inside ? (
        <Zip
          width={width}
          height={height}
          side={openingSide}
          tape={colour.zipTape}
          teeth={colour.zipTeeth}
          pull={colour.zipPull}
        />
      ) : null}

      {children}
    </View>
  );
}

/**
 * The spine, seen edge-on between two covers. Its width comes from the model's stated depth where
 * there is one, so the XL reads as the thicker object it is.
 */
export function BinderSpine({
  model,
  colourwayId,
  width,
  height,
}: {
  model: BinderModel;
  colourwayId: string;
  width: number;
  height: number;
}) {
  const colour = binderColourway(model, colourwayId);
  return (
    <View style={{ width: Math.max(SPINE_MIN, width), height, backgroundColor: colour.shell, overflow: 'hidden' }}>
      {/* A spine is a curve, so it is dark at both folds and lit along its crown. */}
      <LinearGradient
        colors={[withAlpha('#000000', 0.45), withAlpha('#ffffff', colour.light ? 0.35 : 0.1), withAlpha('#000000', 0.45)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  // Dashed, because that is what a stitch line is: thread, gap, thread.
  seam: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.75,
  },
  zip: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center' },
  zipTeeth: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    marginLeft: '45%',
    opacity: 0.9,
  },
  zipPull: {
    position: 'absolute',
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  badge: {
    position: 'absolute',
    bottom: '9%',
    alignSelf: 'center',
    fontWeight: '700',
    opacity: 0.9,
  },
  stamp: {
    position: 'absolute',
    bottom: '11%',
    alignSelf: 'center',
    fontWeight: '600',
  },
});
