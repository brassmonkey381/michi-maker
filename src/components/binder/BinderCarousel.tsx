/**
 * A horizontal carousel of binder thumbnails. Collapses a long list (examples) into a
 * single row so the home page stays short and the sections below it are reachable. The paging
 * chrome (snap pages, wrap-around arrows, wheel, dots) lives in the shared PagedCarousel.
 *
 * Responsive: the number of tiles per page derives from the measured width — 2-up on a phone,
 * growing to 5-up on a wide desktop — so wide screens showcase more art instead of leaving
 * dead space. (This is the one binder-grid surface shared by home, Featured, and profiles.)
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BinderThumb } from '@/components/binder/BinderThumb';
import { PagedCarousel } from '@/components/PagedCarousel';
import { Spacing } from '@/constants/theme';
import type { DemoBinder } from '@/data/binderTypes';

export function BinderCarousel({
  binders,
  onOpen,
  accessory,
}: {
  binders: DemoBinder[];
  onOpen: (id: string) => void;
  /** Optional trailing control per tile (e.g. the ⋯ actions button for your own binders). */
  accessory?: (binder: DemoBinder) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const gap = Spacing.three;

  // Tiles per page from the measured width — bigger binders: 1 (phone), 2 (tablet), 3 (wide
  // desktop), capped at 3. Each page is exactly the container width so paging snaps cleanly.
  const perPage = width > 0 ? Math.max(1, Math.min(3, Math.floor((width + gap) / (300 + gap)))) : 1;
  const tileWidth = width > 0 ? (width - gap * (perPage - 1)) / perPage : 0;

  const pages: DemoBinder[][] = [];
  for (let i = 0; i < binders.length; i += perPage) pages.push(binders.slice(i, i + perPage));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <PagedCarousel
        width={width}
        prevLabel="Previous examples"
        nextLabel="More examples"
        pages={pages.map((pg, pi) => (
          <View key={pi} style={[styles.page, { gap }]}>
            {pg.map((binder) => (
              <BinderThumb
                key={binder.id}
                binder={binder}
                width={tileWidth}
                onPress={() => onOpen(binder.id)}
                accessory={accessory?.(binder)}
              />
            ))}
          </View>
        ))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexDirection: 'row' },
});
