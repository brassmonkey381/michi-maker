import { useEffect, useState } from 'react';

import { getCatalog, getLoadedCatalog, type Catalog } from '@/lib/catalog';

/**
 * Load state for the shared catalog. The underlying fetch/parse is a load-once
 * singleton (see `getCatalog`), so mounting many screens triggers exactly one
 * fetch/parse app-wide — each consumer just subscribes to the same promise.
 */
export interface UseCatalog {
  catalog: Catalog | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Subscribe to the shared browse catalog. `catalog` is null until it resolves.
 *
 * `enabled` (default `true`) gates whether this hook *forces* the fetch: pass `false`
 * to subscribe cheaply (pick up an already-loaded snapshot) without kicking off the
 * 9.87MB load. A persistently-mounted consumer can pass `enabled` = its own
 * visibility so the load isn't forced until it's actually shown — the deliberate
 * background `prefetchCatalog()` warms the shared promise off the critical path.
 */
export function useCatalog(enabled = true): UseCatalog {
  // Seed synchronously from the load-once snapshot: if the catalog already resolved,
  // this mount starts non-null with no loading flash (and avoids a setState in the
  // effect body). Otherwise we subscribe to the shared promise below.
  const [catalog, setCatalog] = useState<Catalog | null>(() => getLoadedCatalog());
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(() => getLoadedCatalog() === null);

  useEffect(() => {
    if (catalog) return; // already loaded — nothing to await
    // Subscribe-only when disabled: don't force the 9.87MB fetch. The mount-time seed
    // (getLoadedCatalog) already adopted any resolved catalog; if a background prefetch
    // resolves later, this re-runs and picks it up once `enabled` flips true.
    if (!enabled) return;
    let cancelled = false;
    getCatalog()
      .then((c) => {
        if (cancelled) return;
        setCatalog(c);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, enabled]);

  return { catalog, loading, error };
}
