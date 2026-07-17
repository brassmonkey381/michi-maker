/**
 * Sealed-products carousel — CURATED by set. Instead of a flat newest-first strip, it groups
 * the sealed catalog by set, keeps only the RECENT or UPCOMING sets (by their products'
 * release dates), and shows each set's top products by headline value. One horizontal
 * carousel with a small header before each set's run (up to MAX_SETS × PER_SET tiles).
 *
 * Deliberately catalog-FREE: the sealed artifacts are small public files, so this renders for
 * guests and before/without the card catalog. Tapping a product opens its TCGPlayer page.
 */
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { productUrl, useSealed, type SealedCatalog, type SealedProduct, type SealedSet } from 'tcgscan-browse';

import { CardPlaceholder } from '@/components/CardPlaceholder';
import { HomeSection } from '@/components/HomeSection';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** Curation knobs. A set counts as "recent/upcoming" if its newest product releases within the
 *  last RECENT_DAYS or in the future; we show the top PER_SET by value, across up to MAX_SETS. */
const RECENT_DAYS = 150;
const MAX_SETS = 6;
const PER_SET = 10;
const TILE_W = 132;
const IMG_H = 132;

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

interface SetGroup {
  set: SealedSet;
  /** The set's release date (its newest product's), yyyy-mm-dd. */
  date: string;
  products: SealedProduct[];
}

/** Group products by set, keep recent/upcoming sets, rank each set's products by value. */
function buildGroups(sealed: SealedCatalog, priceOf: (id: string) => number): SetGroup[] {
  const bySet = new Map<string, SealedProduct[]>();
  for (const p of sealed.products) {
    if (!p.setId) continue;
    let arr = bySet.get(p.setId);
    if (!arr) bySet.set(p.setId, (arr = []));
    arr.push(p);
  }

  const all: SetGroup[] = [];
  for (const [setId, prods] of bySet) {
    const set = sealed.sets.get(setId);
    if (!set) continue;
    const date = prods.reduce((max, p) => (p.releaseDate > max ? p.releaseDate : max), '');
    if (!date) continue; // no release date → can't place on the recency timeline
    const products = [...prods]
      .sort((a, b) => priceOf(b.id) - priceOf(a.id) || a.name.localeCompare(b.name))
      .slice(0, PER_SET);
    all.push({ set, date, products });
  }
  all.sort((a, b) => b.date.localeCompare(a.date)); // upcoming + newest sets first

  const cutoff = isoDaysAgo(RECENT_DAYS);
  const recent = all.filter((g) => g.date >= cutoff);
  // Prefer the recent/upcoming window; if nothing is recent (e.g. stale data), still show the
  // newest sets so the section never vanishes.
  return (recent.length > 0 ? recent : all).slice(0, MAX_SETS);
}

type Item =
  | { type: 'header'; key: string; set: SealedSet; date: string }
  | { type: 'product'; key: string; product: SealedProduct; value: number };

export function HomeSealed() {
  const { sealed, priceOf } = useSealed();
  const groups = useMemo(() => (sealed ? buildGroups(sealed, priceOf) : []), [sealed, priceOf]);

  const data = useMemo<Item[]>(
    () =>
      groups.flatMap((g) => [
        { type: 'header', key: `h-${g.set.id}`, set: g.set, date: g.date } as const,
        ...g.products.map(
          (p) => ({ type: 'product', key: p.id, product: p, value: priceOf(p.id) }) as const,
        ),
      ]),
    [groups, priceOf],
  );

  if (!sealed || data.length === 0) return null; // no gap until the (small) sealed catalog lands

  const today = todayIso();
  return (
    <HomeSection title="Sealed Products" collapsible={false}>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(i) => i.key}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <SetHeader set={item.set} date={item.date} upcoming={item.date > today} />
          ) : (
            <SealedTile product={item.product} value={item.value} />
          )
        }
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      />
    </HomeSection>
  );
}

function SetHeader({ set, date, upcoming }: { set: SealedSet; date: string; upcoming: boolean }) {
  return (
    <View style={styles.header}>
      <Text style={[styles.headerKicker, upcoming && styles.headerKickerUpcoming]}>
        {upcoming ? 'UPCOMING' : 'NEW SET'}
      </Text>
      <Text style={styles.headerName} numberOfLines={4}>
        {set.name}
      </Text>
      {date ? <Text style={styles.headerDate}>{date.slice(0, 7)}</Text> : null}
    </View>
  );
}

function SealedTile({ product, value }: { product: SealedProduct; value: number }) {
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
          <CardPlaceholder radius={Radius.panel} />
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
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
  name: {
    marginTop: Spacing.one,
    fontSize: FontSize.sm,
    lineHeight: 14,
    fontWeight: Weight.semibold,
    color: Palette.ink,
  },
  value: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.accent, marginTop: 2 },
  header: {
    width: 96,
    height: IMG_H,
    justifyContent: 'center',
    gap: Spacing.one,
    paddingRight: Spacing.two,
    marginRight: Spacing.one,
    borderRightWidth: 1,
    borderRightColor: Palette.hairline,
  },
  headerKicker: {
    fontSize: FontSize.tag,
    fontWeight: Weight.bold,
    letterSpacing: 1,
    color: Palette.muted,
  },
  headerKickerUpcoming: { color: Palette.accent },
  headerName: { fontSize: FontSize.body, fontWeight: Weight.bold, lineHeight: 17, color: Palette.ink },
  headerDate: { fontSize: FontSize.xs, color: Palette.muted },
});
