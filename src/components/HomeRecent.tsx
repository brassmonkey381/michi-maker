/**
 * "Recent & Upcoming" — the newest and not-yet-released Pokémon sets, shown at the top
 * of the home screen. A thin wrapper over the shared `RecentProducts` feed that forces
 * the catalog load.
 *
 * Note: the rest of the home screen deliberately stays catalog-free (binder covers
 * resolve straight from card ids), but this feed needs set + card data, so it calls
 * `useCatalog(true)`. That's off the first-paint path — covers still paint immediately
 * and the feed pops in once the catalog resolves; until then this renders nothing (no
 * spinner, no layout jump). Tiles link out to TCGPlayer via each card's id.
 */
import { View } from 'react-native';
import { RecentProducts } from 'tcgscan-browse';

import { Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';

export function HomeRecent() {
  const { catalog } = useCatalog(true);
  // Render nothing (no gap, no spinner) until the catalog resolves.
  if (!catalog) return null;
  return (
    <View style={{ marginBottom: Spacing.five }}>
      <RecentProducts catalog={catalog} />
    </View>
  );
}
