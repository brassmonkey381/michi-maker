import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CoverSurface } from '@/components/binder/BinderCover';
import { BinderGrid, pageBoxHeight } from '@/components/binder/BinderGrid';
import { ThemedText } from '@/components/themed-text';
import { Radii, Radius, Shadows } from '@/constants/theme';
import { binderModel } from '@/data/binderModels';
import { binderMetaLine } from '@/data/binderShape';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';
import { cardThumbUrl } from '@/lib/catalogConfig';

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
  // A page shorter than the box (a 3x4, a 2x2) used to have its mat stretched to fill it, which
  // left a band of blank mat above and below the pockets that read as unfinished. The mat now
  // keeps its own height and sits on a blurred enlargement of the page's own art, the same ground
  // the share image and the single-page viewer use, so the band reads as the binder's colours.
  // A page that fills the box hides the ground entirely, so a 3x3 looks exactly as it did.
  const naturalH = firstPage ? pageBoxHeight(width, firstPage.rows, firstPage.cols) : boxH;
  const letterboxed = firstPage ? naturalH < boxH - 2 : false;
  const backdrop = firstPage ? backdropOf(firstPage) : null;
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
        // It stands on the same blurred ground as a short page, so the shelf around it is not blank.
        <View style={[styles.box, { height: boxH }]}>
          {backdrop ? <Ground uri={backdrop} width={width} height={boxH} /> : null}
          <CoverSurface
            model={binderModel(cover.modelId)}
            colourwayId={cover.colourway}
            surface="front"
            width={width}
            stickers={cover.surfaces?.front}
          />
        </View>
      ) : firstPage && letterboxed && backdrop ? (
        <View style={[styles.box, styles.ground, { height: boxH }]}>
          <Ground uri={backdrop} width={width} height={boxH} />
          <View style={styles.pageShadow}>
            <BinderGrid page={firstPage} width={width} />
          </View>
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

/**
 * The picture a page can offer as its ground: its first artwork panel when it has one (a big,
 * colourful picture the page was composed around), else its first card's image.
 */
function backdropOf(page: DemoPage): string | null {
  const art = page.slots.find((s) => s.type === 'artwork' && s.imageUrl);
  if (art?.imageUrl) return art.imageUrl;
  const card = page.slots.find((s) => s.cardId);
  return card?.cardId ? cardThumbUrl(card.cardId, 245) : null;
}

/** A blurred, brightened enlargement of one picture under a cream scrim, filling the tile's box. */
function Ground({ uri, width, height }: { uri: string; width: number; height: number }) {
  return (
    <View style={[styles.groundLayer, { width, height }]} pointerEvents="none">
      <Image source={{ uri }} style={{ width, height }} contentFit="cover" blurRadius={28} cachePolicy="memory-disk" transition={0} />
      <View style={[styles.scrim, { width, height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  pageShadow: { borderRadius: Radii.page, ...Shadows.page },
  /** The shelf's box: a cover shorter than it sits in the middle. */
  box: { justifyContent: 'center', alignItems: 'center' },
  ground: { borderRadius: Radii.page, overflow: 'hidden' },
  groundLayer: { position: 'absolute', left: 0, top: 0, borderRadius: Radii.page, overflow: 'hidden' },
  // Lighter than the share image's scrim: at tile size the blur is the only colour the band has.
  scrim: { position: 'absolute', left: 0, top: 0, backgroundColor: 'rgba(250,246,239,0.18)' },
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
