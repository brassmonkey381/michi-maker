/**
 * Sealed-products carousel — booster boxes / ETBs / collection boxes from the data server's
 * sealed catalog (browse/sealed.json via the kit's useSealed), newest release first.
 *
 * Deliberately catalog-FREE: the sealed artifacts are small public files, so this renders for
 * guests and before/without the card catalog — it fills the "recent products" slot on home for
 * everyone (HomeRecent needs the full catalog and is a signed-in extra). Tapping a product
 * opens its TCGPlayer page (a pure function of the product id).
 */
import { Image } from 'expo-image';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { productUrl, useSealed, type SealedProduct } from 'tcgscan-browse';

import { HomeSection } from '@/components/HomeSection';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** How many of the newest products the strip shows. */
const STRIP_COUNT = 40;
const TILE_W = 132;
const IMG_H = 132;

export function HomeSealed() {
  const { sealed, priceOf } = useSealed();
  if (!sealed) return null; // no gap/spinner until the (small) sealed catalog lands

  const products = sealed.newestFirst().slice(0, STRIP_COUNT);
  if (products.length === 0) return null;

  return (
    <HomeSection title="Sealed Products" collapsible={false}>
      <FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <SealedTile product={item} value={priceOf(item.id)} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      />
    </HomeSection>
  );
}

function SealedTile({ product, value }: { product: SealedProduct; value: number }) {
  const date = product.releaseDate ? product.releaseDate.slice(0, 7) : '';
  return (
    <Pressable
      style={styles.tile}
      onPress={() => Linking.openURL(productUrl(product.id)).catch(() => {})}
      accessibilityRole="link">
      <View style={styles.imageWrap}>
        {product.imageSmall ? (
          <Image
            source={{ uri: product.imageSmall }}
            style={styles.image}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={product.id}
            transition={100}
          />
        ) : (
          <Text style={styles.imageFallback}>?</Text>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {[product.series, date].filter(Boolean).join(' · ')}
      </Text>
      {value > 0 ? (
        <Text style={styles.value} numberOfLines={1}>
          {value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { gap: Spacing.two, paddingVertical: Spacing.one },
  tile: { width: TILE_W },
  imageWrap: {
    width: TILE_W,
    height: IMG_H,
    borderRadius: Radius.panel,
    backgroundColor: Palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  imageFallback: { fontSize: FontSize.h2, color: Palette.muted },
  name: {
    marginTop: Spacing.one,
    fontSize: FontSize.sm,
    lineHeight: 14,
    fontWeight: Weight.semibold,
    color: Palette.ink,
  },
  meta: { fontSize: FontSize.xs, color: Palette.muted, marginTop: 2 },
  value: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.accent, marginTop: 2 },
});
