/**
 * Reddit Pixel (owner, 2026-10-30: "we need a reddit pixel for cost per account created for
 * sure"). Web only, and only when EXPO_PUBLIC_REDDIT_PIXEL_ID is set at build time: without the
 * id every function here is a no-op, so development and the native apps stay clean.
 *
 * WHAT THE PAGE SENDS, and nothing else (analytics-studio work order, 2026-10-30):
 *   - PageVisit  once, by the base snippet, when the pixel loads.
 *   - SignUp     at the exact moment analytics records account.created (src/lib/analytics.ts
 *                `track`), once per account, conversionId = the new uid so Reddit dedupes retries.
 *   - ViewContent on the first card placed in this page load (the first card.add that is not a
 *                swap), a mid-funnel signal while accounts are few.
 *   No Purchase, no custom events. Adding one is a taxonomy change: tell analytics-studio.
 *
 * The id lives in Vercel's env (and .env locally), never in code. Reddit Ads Manager > Events
 * Manager shows it.
 */

import { Platform } from 'react-native';

type Rdt = ((...args: unknown[]) => void) & { callQueue?: unknown[]; sendEvent?: (...args: unknown[]) => void };

const PIXEL_ID = process.env.EXPO_PUBLIC_REDDIT_PIXEL_ID?.trim() || '';
const SCRIPT_SRC = 'https://www.redditstatic.com/ads/pixel.js';

let loaded = false;
let viewContentSent = false;

function rdt(): Rdt | null {
  if (!PIXEL_ID || Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return null;
  const w = window as unknown as { rdt?: Rdt };
  if (!w.rdt) {
    // The official base snippet, written out: a queue that the real script drains once it lands.
    const q: Rdt = (...args: unknown[]) => {
      if (q.sendEvent) q.sendEvent(...args);
      else q.callQueue!.push(args);
    };
    q.callQueue = [];
    w.rdt = q;
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    document.head.appendChild(s);
  }
  return w.rdt;
}

/** Load the pixel and send its PageVisit. Safe to call more than once; later calls do nothing. */
export function initRedditPixel(): void {
  if (loaded) return;
  const r = rdt();
  if (!r) return;
  loaded = true;
  try {
    r('init', PIXEL_ID);
    r('track', 'PageVisit');
  } catch {
    // a blocked or failed pixel must never surface
  }
}

/** The account was created (analytics account.created). `conversionId` is the uid. */
export function redditSignUp(conversionId: string | null | undefined): void {
  initRedditPixel();
  const r = rdt();
  if (!r) return;
  try {
    r('track', 'SignUp', conversionId ? { conversionId } : {});
  } catch {
    // never surface
  }
}

/** The first card placed on this page load (analytics card.add, not a swap). Once per load. */
export function redditFirstCardPlaced(): void {
  if (viewContentSent) return;
  initRedditPixel();
  const r = rdt();
  if (!r) return;
  viewContentSent = true;
  try {
    r('track', 'ViewContent');
  } catch {
    // never surface
  }
}

/** For tests and the studio: whether a build carries a pixel id at all. */
export const redditPixelConfigured = PIXEL_ID.length > 0;
