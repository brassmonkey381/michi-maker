/**
 * A REAL PAGE, BUILDING ITSELF. The seed card lands first, then the rest arrive one at a time
 * around it, then it clears and goes again. It is the method in one loop — one card the page is
 * about, everything else chosen to sit with it — played on an actual page with actual cards,
 * rather than a clip of a screen.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import type { DemoPage, DemoSlot } from '@/data/binderTypes';

const STEP_MS = 520;
const HOLD_MS = 2600;

/** The seed is the centre pocket when there is one, else the first slot; the rest follow row by row. */
function orderSlots(page: DemoPage): DemoSlot[] {
  const midRow = Math.floor(page.rows / 2);
  const midCol = Math.floor(page.cols / 2);
  const slots = [...page.slots];
  slots.sort((a, b) => a.row - b.row || a.col - b.col);
  const seedIdx = slots.findIndex((s) => s.row === midRow && s.col === midCol);
  if (seedIdx > 0) {
    const [seed] = slots.splice(seedIdx, 1);
    slots.unshift(seed);
  }
  return slots;
}

export function PageReplay({ page, width, caption }: { page: DemoPage; width: number; caption?: string }) {
  const ordered = orderSlots(page);
  const total = ordered.length;
  const [shown, setShown] = useState(1);
  useEffect(() => {
    // One timer at a time: a step while cards are landing, a longer hold on the finished page,
    // then back to the seed alone.
    const t = setTimeout(
      () => setShown((n) => (n >= total ? 1 : n + 1)),
      shown >= total ? HOLD_MS : STEP_MS,
    );
    return () => clearTimeout(t);
  }, [shown, total]);
  const partial: DemoPage = { ...page, slots: ordered.slice(0, shown) };
  return (
    <View style={styles.wrap}>
      <BinderGrid page={partial} width={width} />
      {caption ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
          {shown === 1 ? 'The seed: the card the page is about.' : shown < total ? `${shown - 1} of ${total - 1} chosen to sit with it…` : caption}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  caption: { textAlign: 'center', minHeight: 20 },
});
