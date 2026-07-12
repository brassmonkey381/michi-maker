import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  getCatalog,
  getLoadedCatalog,
  subscribeCatalog,
  useCatalogStatus,
  type Catalog,
  type CatalogStatus,
} from '@/lib/catalog';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

/**
 * Load state for the shared catalog. The underlying fetch/parse is a load-once
 * singleton (see `getCatalog`), so mounting many screens triggers exactly one
 * fetch/parse app-wide — each consumer just subscribes to the same promise.
 */
export interface UseCatalog {
  catalog: Catalog | null;
  loading: boolean;
  error: Error | null;
  /** Load phase (downloading → parsing → ready) for progress UI. */
  status: CatalogStatus;
  /** Build progress 0→1 while the in-memory index is being built (status 'parsing'). */
  progress: number;
  /**
   * True when the catalog won't load because the viewer isn't signed in (guest / signed-out in
   * cloud mode — the tier gate below). Catalog-dependent features should show a "sign in to use
   * this" note instead of a spinner that never resolves.
   */
  guestGated: boolean;
}

/**
 * Subscribe to the shared browse catalog. `catalog` is null until it resolves, then updates
 * reactively for every consumer — via `useSyncExternalStore` over the module snapshot — the
 * moment it loads, whoever kicked off the load.
 *
 * `enabled` (default `true`) gates whether this hook *forces* the 25 MB fetch. Pass `false` to
 * subscribe cheaply: the hook still re-renders when the catalog becomes available (e.g. a
 * background `prefetchCatalog()` or another screen loaded it), but it never initiates the load
 * itself. Rendering that only needs card *images* doesn't need the catalog at all (image URLs
 * are derived from the card id — see `cardThumbUrl`), so those consumers pass `false`.
 */
export function useCatalog(enabled = true): UseCatalog {
  // Reactive snapshot of the load-once catalog: updates for enabled AND passive consumers
  // when the catalog publishes, without either of them forcing the fetch.
  const catalog = useSyncExternalStore(subscribeCatalog, getLoadedCatalog, getLoadedCatalog);
  const { status, progress } = useCatalogStatus();
  const [error, setError] = useState<Error | null>(null);

  // TIER GATE (DATA-PROTECTION-PLAN): the full offline catalog is a signed-up perk. Guests
  // never request it — they browse via server search (cold mode) and binder images resolve
  // by id (cardThumbUrl), no catalog needed. Local/static mode (no Supabase) keeps loading
  // from the local /browse files as before.
  const { ready, isSignedIn } = useAuth();
  const tierAllowed = !isSupabaseConfigured || (ready && isSignedIn);
  const wantLoad = enabled && tierAllowed;
  const guestGated = isSupabaseConfigured && ready && !isSignedIn && !catalog;

  useEffect(() => {
    if (catalog || !wantLoad) return; // loaded already, or subscribe-only/guest: don't force
    let cancelled = false;
    getCatalog()
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, wantLoad]);

  // Derived: we're loading while a load is actually wanted, not yet resolved, and no error.
  const loading = wantLoad && !catalog && !error;
  return { catalog, loading, error, status, progress, guestGated };
}
