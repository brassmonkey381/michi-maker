/**
 * The signed-in user's real-scan lookup: cardId → public URL of the card's newest scanned
 * crop, read from tcgscan's portfolio_entries (scan_path, RLS owner-only). Powers the "Scans"
 * pill on the binder view and the Real-scans chip in My collection.
 *
 * Fetch-once per identity, DELIBERATELY unsubscribed (unlike useOwnedCards): the pill is a
 * session-only viewer toggle, and a scan filed mid-browse appearing on the next visit is fine;
 * a realtime feed on portfolio_entries would re-derive on every quantity edit for a map that
 * almost never changes.
 *
 * Returns undefined for guests / unconfigured Supabase / before the first load / no scans, so
 * callers can gate their toggle on presence exactly like the Owned pill gates on inventory.
 */
import { useEffect, useState } from 'react';

import { fetchScanImages } from '@/data/collectionRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

export function useScanImages(): ReadonlyMap<string, string> | undefined {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Keyed by the identity it was loaded for, so a signed-out or switched user derives to
  // "no scans" during render rather than leaking the previous account's map.
  const [loaded, setLoaded] = useState<{ userId: string; map: Map<string, string> } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    fetchScanImages()
      .then((map) => {
        if (active) setLoaded({ userId, map });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  const map = loaded && loaded.userId === userId ? loaded.map : undefined;
  return map && map.size > 0 ? map : undefined;
}
