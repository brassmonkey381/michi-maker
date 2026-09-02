/**
 * WARM THE CATALOG WHEREVER YOU LAND, not only when something asks for it.
 *
 * Card labels read real card data, so `BinderGrid` calls `useCatalog(captionOn)` — which means
 * the download only STARTS when labels are switched on, and the labels a page was opened to show
 * arrive well after the page does. The same is true of anything else catalog-backed: it waits for
 * a screen to demand it, and the demand is usually the moment the user is already looking.
 *
 * ONE PLACE, NOT ONE PER SCREEN. Mounted at the root inside AuthProvider, so every route gets it
 * and a route added next month gets it without anyone remembering. Sprinkling `prefetchCatalog()`
 * across home, discover, my binders, the contest and the binder viewer would work today and drift
 * by the third new screen.
 *
 * WHAT IT COSTS, which is the reason this is safe to do everywhere:
 *   - Signed-out visitors: nothing. The catalog is a signed-in perk (see use-catalog's tier gate),
 *     so guests are skipped entirely rather than issuing a request that would be refused.
 *   - First load on a device: the gated path fetches ~1.3 MB encrypted, decrypts and parses it.
 *   - Every load after that: an IndexedDB read, version-checked, no download at all
 *     (see lib/catalogCache). So "warm on every page" is one fetch per publish, not per visit.
 *   - `loadCatalog` is load-once app-wide, so this can be called as often as it likes.
 *
 * AFTER THE PAINT, ALWAYS. Deferred to idle so it never competes with the screen the user is
 * actually looking at: the point is to have the catalog ready a second early, and a warm that
 * stalls the first frame has traded the wrong thing.
 */
import { useEffect } from 'react';

import { prefetchCatalog } from '@/lib/catalog';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

/** Run `fn` when the browser is idle, or shortly after paint where that does not exist. */
function whenIdle(fn: () => void): () => void {
  const w = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    // The timeout matters: on a busy tab idle may never come, and a warm that never runs is the
    // bug this component exists to fix.
    const handle = w.requestIdleCallback(fn, { timeout: 3000 });
    return () => w.cancelIdleCallback?.(handle);
  }
  const t = setTimeout(fn, 1200);
  return () => clearTimeout(t);
}

export function CatalogWarm() {
  const { ready, isSignedIn } = useAuth();
  // Same gate `useCatalog` applies before it forces a load: local/static mode always, cloud mode
  // only for a signed-in viewer. Written the same way on purpose, so the two cannot disagree
  // about who is allowed the catalog.
  const allowed = !isSupabaseConfigured || (ready && isSignedIn);

  useEffect(() => {
    if (!allowed) return;
    return whenIdle(prefetchCatalog);
  }, [allowed]);

  return null;
}
