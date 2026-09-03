import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CoverSurface } from '@/components/binder/BinderCover';
import { BinderGrid, pageBoxHeight } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import { Radii, Radius, Shadows } from '@/constants/theme';
import { binderModel } from '@/data/binderModels';
import { binderMetaLine } from '@/data/binderShape';
import type { DemoBinder } from '@/data/binderTypes';

interface BinderThumbProps {
  binder: DemoBinder;
  width: number;
  onPress: () => void;
  /** Optional trailing control in the title row (e.g. the ⋯ actions button). */
  accessory?: ReactNode;
}

export function BinderThumb({ binder, width, onPress, accessory }: BinderThumbProps) {
  const firstPage = binder.pages[0];
  // ONE BOX FOR EVERY SHAPE. The shelf shows a 2×2 and a 4×4 at the 3×3's size, and a 3×4 has to
  // get the same treatment: drawn to its own aspect it came out shorter than the 3×3 beside it
  // and read as the smaller binder, which is the opposite of the truth. Page and cover alike are
  // given the 3×3 box for this width and keep their own proportions inside it, centred: the page
  // gains margin above and below its pockets, the cover gains shelf above and below itself.
  // Nothing is stretched — a card face or a cover's art a third taller would be worse than the
  // mismatch this fixes.
  const boxH = pageBoxHeight(width, 3, 3);
  // THE FACE THIS BINDER SHOWS. Its front cover if the owner asked for that, else its first page,
  // which is what every binder showed before covers existed.
  const cover = binder.cover?.showCover ? binder.cover : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={styles.textCol}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
            {binder.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {binder.authorName ? `by ${binder.authorName} · ` : ''}
            {binderMetaLine(binder.pages)}
          </ThemedText>
        </View>
        {accessory}
      </View>
      {cover ? (
        // A cover brings its own shadow and its own proportions, so it is not wrapped in the page
        // shadow: a binder is a different object from a page and should not be pretending to be one.
        <View style={[styles.box, { height: boxH }]}>
          <CoverSurface
            model={binderModel(cover.modelId)}
            colourwayId={cover.colourway}
            surface="front"
            width={width}
            stickers={cover.surfaces?.front}
          />
        </View>
      ) : firstPage ? (
        // The soft page shadow makes the binder page read as a physical object on the shelf —
        // shared by every carousel (home, Featured, examples, profiles) for one consistent look.
        <View style={styles.pageShadow}>
          <BinderGrid page={firstPage} width={width} minHeight={boxH} />
        </View>
      ) : (
        <View style={[styles.placeholder, { width, height: boxH }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  pageShadow: { borderRadius: Radii.page, ...Shadows.page },
  /** The shelf's box: a cover shorter than it sits in the middle. */
  box: { justifyContent: 'center' },
  placeholder: {
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  // Two text lines and the accessory, side by side. The gap under the block lives HERE rather
  // than on the meta line, so the header's height is exactly the two lines (20 + 2 + 20 = 42) and
  // a centred accessory sits square against them instead of being dragged low by trailing space.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  // minWidth 0 so a long title truncates instead of shoving the accessory off the tile.
  textCol: { flex: 1, minWidth: 0 },
  title: { marginBottom: 2 },
});
