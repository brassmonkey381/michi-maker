/**
 * The glint: a foil card catches the light as the pointer crosses it.
 *
 * IT KNOWS WHICH KIND OF FOIL IT IS, which is the point. A classic holo has foil inside the
 * illustration window and matte card stock around it; a REVERSE holo is precisely the other way
 * round; and a full art, secret or illustration rare is foil edge to edge. Any collector reads
 * those differences instantly, so lighting all three the same way would say something false about
 * what is in the sleeve. Which mask a card gets is decided by glintMask() from its finish and
 * rarity — see there for why an unknown card is lit whole rather than masked.
 *
 * That rectangle is the app's own ART_WINDOW (SliceStudio), the illustration window of a standard
 * card, reused rather than re-guessed so a correction in one place fixes both.
 *
 * DELIBERATELY RESTRAINED. The reference implementations (pokemon-cards-css and its many copies)
 * tilt the card in 3D, run a rainbow sweep and layer a sparkle mask — wonderful on a page showing
 * one card, unbearable on a page showing nine. This is one soft highlight following the pointer,
 * and no tilt: cards sit in a binder, and pockets that lean about as the mouse passes read as a
 * toy rather than as a shelf.
 *
 * ONLY WHERE THE FINISH IS KNOWN. A Normal card that shimmered would misrepresent the sleeve, and
 * an unanswered pocket does not shimmer on a guess — which is exactly why the finish had to become
 * settable per pocket before this could exist.
 *
 * Web only, by filename: it is a pointer affordance and there is no hover on a touch screen. The
 * static sheen underneath stays on every platform, so a foil still reads as a foil without a mouse.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GlintMask } from '@/constants/printVariant';

/** The illustration window, as fractions of the card — mirrors ART_WINDOW in SliceStudio. */
const ART = { x: 0.06, y: 0.11, w: 0.88, h: 0.42 };
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/** Inside the illustration window: a plain inset, the foil of an ordinary holo. */
const HOLO_CLIP = `inset(${pct(ART.y)} ${pct(1 - ART.x - ART.w)} ${pct(1 - ART.y - ART.h)} ${pct(ART.x)})`;

/**
 * Everything EXCEPT the illustration window — a rectangle with a rectangular hole, traced as one
 * self-intersecting polygon (out to the card's edge, in around the art, back). Verified rendering
 * as a true inverse rather than assumed: a clip that silently resolves to nothing would delete the
 * effect with no error anywhere.
 */
const REVERSE_CLIP = [
  'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,',
  `${pct(ART.x)} ${pct(ART.y)},`,
  `${pct(ART.x)} ${pct(ART.y + ART.h)},`,
  `${pct(ART.x + ART.w)} ${pct(ART.y + ART.h)},`,
  `${pct(ART.x + ART.w)} ${pct(ART.y)},`,
  `${pct(ART.x)} ${pct(ART.y)})`,
].join(' ');

export function FoilGlint({ radius, mask }: { radius: number; mask: GlintMask }) {
  // Pointer position as a fraction of the card. Plain state, not a shared value: this is a CSS
  // gradient rather than a transform, so a worklet per pocket would buy nothing.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const move = (e: { clientX: number; clientY: number; currentTarget: unknown }) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!r.width || !r.height) return;
    setPos({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };

  // A highlight centred on the pointer that falls off well before the card's edge, so it reads as
  // light moving across a surface rather than a shape drawn on top of one.
  const lit = pos
    ? `radial-gradient(circle at ${(pos.x * 100).toFixed(1)}% ${(pos.y * 100).toFixed(1)}%,` +
      ' rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.11) 30%, rgba(255,255,255,0) 64%)'
    : 'none';

  return (
    <View
      // @ts-expect-error — web-only pointer props; this file only ever renders on web.
      onPointerMove={move}
      onPointerLeave={() => setPos(null)}
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: radius,
          overflow: 'hidden',
          backgroundImage: lit,
          // 'full' takes no clip at all: modern foiling runs edge to edge, and a rectangle drawn
          // across a full art would be the one version of this effect anybody notices as wrong.
          clipPath: mask === 'frame' ? REVERSE_CLIP : mask === 'art' ? HOLO_CLIP : undefined,
          // The fade is what stops the highlight snapping on and off as the pointer crosses from
          // one pocket to the next.
          transition: 'opacity 180ms ease-out',
          opacity: pos ? 1 : 0,
        } as object,
      ]}
    />
  );
}
