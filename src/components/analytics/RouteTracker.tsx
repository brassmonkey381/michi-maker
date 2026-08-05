/**
 * RouteTracker — emits a `page.view` analytics event whenever the active route changes.
 *
 * There is no navigation listener elsewhere; this is mounted once in app/_layout inside the
 * provider tree. It renders nothing. It records the LANDING route too (the first real pathname),
 * then de-dupes only genuine back-to-back repeats via a ref, so every distinct route the user
 * visits — including where the session started — is emitted exactly once.
 *
 * The pathname from expo-router is the normalized route (e.g. `/binder/<id>`), no query params.
 * A binder id in the path is fine (not PII); nothing here logs personal data.
 */
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { track } from '@/lib/analytics';

export function RouteTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return; // undefined/empty on the very first render → nothing to record yet
    if (pathname === lastPath.current) return; // genuine back-to-back repeat → already recorded
    lastPath.current = pathname;
    track('page.view', { route: pathname });
  }, [pathname]);

  return null;
}
