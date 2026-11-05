/**
 * A SPOTLIGHT OVER THE WHOLE WINDOW, WEB ONLY: everything dims except the holes. The seeded
 * walkthrough's last step points at the Theme button inside the card browser, which is the shared
 * kit's and sits in its own dock above the page; a veil drawn in the page's layer never reaches
 * it. This one is rendered straight into document.body, so no dock or stacking context sits over
 * it, and the holes (the button, the ringed pocket, the callout) stay bright. Above a phone's
 * bottom-sheet Modal too (react-native-web puts those at 9999). Nothing here takes a
 * pointer event.
 */
import { createPortal } from 'react-dom';

import type { PocketRect } from '@/components/binder/PocketRing';

export function Spotlight({ holes }: { holes: PocketRect[] }) {
  if (typeof document === 'undefined' || holes.length === 0) return null;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pad = 6;
  const r = 10;
  // A hole clipped to the window; one that lies off screen (a pocket behind a phone's sheet) is
  // dropped rather than drawn inside out.
  const hole = (b: PocketRect) => {
    const x = Math.max(0, b.x - pad);
    const y = Math.max(0, b.y - pad);
    const bw = Math.min(w - x, b.width + pad * 2);
    const bh = Math.min(h - y, b.height + pad * 2);
    if (bw < 2 * r + 1 || bh < 2 * r + 1) return '';
    const sw = bw - 2 * r;
    const sh = bh - 2 * r;
    return `M${x + r},${y} h${sw} a${r},${r} 0 0 1 ${r},${r} v${sh} a${r},${r} 0 0 1 -${r},${r} h-${sw} a${r},${r} 0 0 1 -${r},-${r} v-${sh} a${r},${r} 0 0 1 ${r},-${r} z`;
  };
  const d = `M0,0 h${w} v${h} h-${w} z ${holes.map(hole).filter(Boolean).join(' ')}`;
  return createPortal(
    <svg
      data-testid="walkthrough-spotlight"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, pointerEvents: 'none' }}
      aria-hidden="true">
      <path d={d} fill="rgba(20, 18, 24, 0.32)" fillRule="evenodd" />
    </svg>,
    document.body,
  );
}
