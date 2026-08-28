/**
 * The signed-in user's real-scan lookup — per card (newest crop) and per owned copy (entry id),
 * read from tcgscan's portfolio_entries (scan_path, RLS owner-only). Powers the "Scans" pill on
 * the binder view and the Real-scans chip in My collection.
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

import { fetchScanImages, type ScanImages } from '@/data/collectionRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

export function useScanImages(): ScanImages | undefined {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Keyed by the identity it was loaded for, so a signed-out or switched user derives to
  // "no scans" during render rather than leaking the previous account's map.
  const [loaded, setLoaded] = useState<{ userId: string; scans: ScanImages } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    fetchScanImages()
      .then((scans) => {
        if (active) setLoaded({ userId, scans });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  const scans = loaded && loaded.userId === userId ? loaded.scans : undefined;
  // Presence gates the pills, so empty means undefined. byCard covers byEntry: every scanned
  // entry contributes to both, so one emptiness check is the other's.
  return scans && scans.byCard.size > 0 ? scans : undefined;
}
