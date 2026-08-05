/**
 * RouteTracker — emits a `page.view` analytics event whenever the active route changes.
 *
 * There is no navigation listener elsewhere; this is mounted once in app/_layout inside the
 * provider tree. It renders nothing. It skips the very first no-op (the initial mount is not a
 * navigation) and de-dupes repeat paths via a ref, so only genuine route changes are recorded.
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
    if (lastPath.current === pathname) return; // no change → nothing to record
    const first = lastPath.current === null;
    lastPath.current = pathname;
    if (first) return; // initial mount is not a navigation
    track('page.view', { route: pathname });
  }, [pathname]);

  return null;
}
