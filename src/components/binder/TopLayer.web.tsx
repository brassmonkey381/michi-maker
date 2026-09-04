/**
 * ABOVE EVERYTHING. A layer for the few things that must be visible whatever else is on screen.
 *
 * WHY A PORTAL AND NOT A Z-INDEX. react-native-web renders every `Modal` through a portal into a
 * fresh `<div>` appended to `document.body`, so a modal is not inside the app's DOM at all — no
 * z-index applied anywhere in the app tree can reach over it, and the modal wins simply by being a
 * later sibling of the app root. That is why the cap toast kept vanishing: it lived in the page,
 * and any sheet, dialog or picker that happened to be up painted straight over it. A toast that
 * tells you why the thing you just tried did not happen is the last thing that should be coverable.
 *
 * So this appends its own body-level host and gives it a real z-index. RNW's modal host sets none
 * (its content is a plain fixed-position View at z-index 0), so an explicit one here sits above
 * every modal, present and future, without any of them having to know.
 *
 * WHY IT DOES NOT BLOCK. The host is `pointer-events: none`, so the layer is invisible to the
 * mouse across its whole area; children opt back IN (`box-none` on a View gives its children
 * `pointer-events: auto`), which is what keeps the toast's dismiss and its CTA clickable while
 * every pixel around them still belongs to the app underneath. Wrapping the toast in a Modal
 * instead would have covered the screen with a touch-swallowing sheet for five seconds.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Just under the 32-bit maximum, leaving headroom above it for anything that genuinely has to
 * outrank this one day. Nothing in the app or in react-native-web sets a z-index near it.
 */
const TOP_Z = 2147483000;

/** The host element, built but NOT yet attached. Pure enough to run in a state initialiser. */
function makeHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.setAttribute('data-michi-top-layer', '');
  // Spelled out rather than the `inset` shorthand: this host outlives the app's own styling and
  // should not lean on a shorthand for something this load-bearing.
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.right = '0';
  el.style.bottom = '0';
  el.style.left = '0';
  el.style.zIndex = String(TOP_Z);
  el.style.pointerEvents = 'none';
  return el;
}

export function TopLayer({ children }: { children: ReactNode }) {
  // Built during the first render so the portal has somewhere to go immediately — a host created
  // in an effect would cost the toast a frame and put a setState inside that effect.
  const [host] = useState(makeHost);

  // ATTACHED in the effect, which is where touching the document belongs. Portaling into a
  // detached node is fine: React renders into it, and appending later carries the content along.
  useEffect(() => {
    if (!host) return;
    document.body.appendChild(host);
    return () => {
      host.remove();
    };
  }, [host]);

  return host ? createPortal(children, host) : null;
}
