import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CoverSurface } from '@/components/binder/BinderCover';
import { BinderGrid } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import { Radii, Radius, Shadows } from '@/constants/theme';
import { binderModel } from '@/data/binderModels';
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
  const pageCount = binder.pages.length;
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
            {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </ThemedText>
        </View>
        {accessory}
      </View>
      {cover ? (
        // A cover brings its own shadow and its own proportions, so it is not wrapped in the page
        // shadow: a binder is a different object from a page and should not be pretending to be one.
        <CoverSurface
          model={binderModel(cover.modelId)}
          colourwayId={cover.colourway}
          surface="front"
          width={width}
          stickers={cover.surfaces?.front}
        />
      ) : firstPage ? (
        // The soft page shadow makes the binder page read as a physical object on the shelf —
        // shared by every carousel (home, Featured, examples, profiles) for one consistent look.
        <View style={styles.pageShadow}>
          <BinderGrid page={firstPage} width={width} />
        </View>
      ) : (
        <View style={[styles.placeholder, { width, height: width * 1.2 }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  pageShadow: { borderRadius: Radii.page, ...Shadows.page },
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
