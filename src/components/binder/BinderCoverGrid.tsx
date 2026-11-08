/**
 * BINDERS AS A GRID OF COVERS, ALL AT ONCE (MIC-017, 2026-11-08: "My Binders: B3's cover grid,
 * more binders visible at once"; Discover without a featured slot). The carousel showed one binder
 * per screen on a phone and paged sideways; a shelf of binders reads better as a wall you scan.
 *
 * Columns come from the measured width, between `minCols` and `maxCols`, with tiles no narrower
 * than `minTile`: My Binders asks for 3 on a phone and up to 6 on a desk, Discover for 2 and 5.
 * Each tile is the shared BinderThumb (its cover or first page, title, details), so the grid and
 * the carousels elsewhere show the same face for a binder. `trailing` draws one more cell at the
 * end, at the tile's size (My Binders' New binder).
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BinderThumb } from '@/components/binder/BinderThumb';
import type { DemoBinder } from '@/data/binderTypes';

export function BinderCoverGrid({
  binders,
  onOpen,
  accessory,
  trailing,
  minTile = 104,
  minCols = 2,
  maxCols = 6,
  gap = 12,
  testID,
}: {
  binders: readonly DemoBinder[];
  onOpen: (id: string) => void;
  /** A small control on each tile (the ⋯ menu for your own binders). */
  accessory?: (binder: DemoBinder) => ReactNode;
  /** One more cell after the binders, given the tile width (a New binder tile). */
  trailing?: (tileWidth: number) => ReactNode;
  minTile?: number;
  minCols?: number;
  maxCols?: number;
  gap?: number;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const cols = width > 0 ? Math.max(minCols, Math.min(maxCols, Math.floor((width + gap) / (minTile + gap)))) : minCols;
  const tileWidth = width > 0 ? Math.floor((width - gap * (cols - 1)) / cols) : 0;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={[styles.grid, { gap }]} testID={testID}>
      {tileWidth > 0
        ? binders.map((binder) => (
            <BinderThumb key={binder.id} binder={binder} width={tileWidth} onPress={() => onOpen(binder.id)} accessory={accessory?.(binder)} />
          ))
        : null}
      {tileWidth > 0 && trailing ? trailing(tileWidth) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
});
