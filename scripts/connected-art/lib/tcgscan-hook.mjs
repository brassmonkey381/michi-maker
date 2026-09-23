/**
 * Import tcgscan-app's PURE recognition modules from here, without copying them.
 *
 * The binder-page shape inference (page-from-still, page-shapes, page-reshape) and the recognition
 * core (letterbox, YOLOX decode, NMS, aspect gate, cosine top-K) are plain TypeScript with no
 * React Native in them, and they have been tuned against labelled scan sessions. Copying them into
 * this repo would fork tuned code, and the fork would be the copy nobody edits. So this maps
 * their `@/…` alias at resolve time and imports the originals in place.
 *
 * Modelled on tcgscan-app/scripts/alias-hooks.mjs, which does the same thing inside that repo.
 * Node strips the TypeScript types natively, so there is no build step on either side.
 *
 * Usage: node --import ./scripts/connected-art/lib/register.mjs <script>
 */
import { existsSync } from 'node:fs';

/** The sibling checkout. Both repos live under the same workspace root by convention. */
const APP_SRC = new URL('../../../../tcgscan-app/src/', import.meta.url);

const EXTS = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, next) {
  // `@/lib/x` -> <tcgscan-app>/src/lib/x.ts
  if (specifier.startsWith('@/')) {
    const base = new URL(specifier.slice(2), APP_SRC);
    for (const ext of EXTS) {
      const cand = new URL(base.href + ext);
      if (existsSync(cand)) return next(cand.href, context);
    }
  }
  // Their modules also import siblings as './recognition-core' with no extension.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parent = context.parentURL ?? '';
    if (parent.includes('/tcgscan-app/src/')) {
      const base = new URL(specifier, parent);
      // Only fill in an extension when the bare specifier does not already resolve.
      if (!existsSync(base)) {
        for (const ext of EXTS) {
          const cand = new URL(base.href + ext);
          if (ext && existsSync(cand)) return next(cand.href, context);
        }
      }
    }
  }
  return next(specifier, context);
}
