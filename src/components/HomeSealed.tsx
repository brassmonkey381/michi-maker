/**
 * Sealed-products carousel — CURATED by set. Groups the sealed catalog by set, keeps only the
 * RECENT or UPCOMING sets (matching the Recent & Upcoming feed's window), and shows each set's
 * top products by headline value. Rendered through the shared PagedCarousel (snap pages,
 * wrap-around arrows, mouse-wheel paging, dots) — the same model as the binder carousels — with
 * a small "set card" before each set's run.
 *
 * Deliberately catalog-FREE: the sealed artifacts are small public files, so this renders for
 * guests and before/without the card catalog. Tapping a product opens its TCGPlayer page.
 */
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CARD_SIZE_SCALE,
  productUrl,
  sealedLanguageOf,
  useSealed,
  type CardLanguage,
  type SealedCatalog,
  type SealedProduct,
  type SealedSet,
} from 'tcgscan-browse';

import { useCardSize } from '@/lib/cardSizePref';

import { CardPlaceholder } from '@/components/CardPlaceholder';
import { HomeSection } from '@/components/HomeSection';
import { PagedCarousel } from '@/components/PagedCarousel';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

/** Curation knobs. The recency window matches the Recent & Upcoming cards/sets feed
 *  (RecentProducts `monthsBack`): a set counts as "recent/upcoming" if its newest product
 *  releases within the last MONTHS_BACK months or in the future. Each set shows its top
 *  PER_SET products by value. */
const MONTHS_BACK = 12;
const PER_SET = 10;
/** Only bounds the stale-data fallback (when nothing falls in the window). */
const FALLBACK_SETS = 6;
const IMG_H = 132;

const todayIso = () => new Date().toISOString().slice(0, 10);
/** Cutoff date `MONTHS_BACK` months ago (setMonth handles year rollover) — same as the feed. */
const recentCutoff = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - MONTHS_BACK);
  return d.toISOString().slice(0, 10);
};

interface SetGroup {
  set: SealedSet;
  /** The set's release date (its newest product's), yyyy-mm-dd. */
  date: string;
  products: SealedProduct[];
}

/** Group products by set, keep recent/upcoming sets, rank each set's products by value.
 *  `langSet` (null = unconstrained) limits which printing languages appear. */
function buildGroups(
  sealed: SealedCatalog,
  priceOf: (id: string) => number,
  langSet: Set<CardLanguage> | null,
): SetGroup[] {
  const bySet = new Map<string, SealedProduct[]>();
  for (const p of sealed.products) {
    if (!p.setId) continue;
    if (langSet && !langSet.has(sealedLanguageOf(p))) continue;
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

  const cutoff = recentCutoff();
  const recent = all.filter((g) => g.date >= cutoff);
  // Show every set in the recent/upcoming window (matching the Recent & Upcoming feed). If
  // stale data leaves nothing recent, fall back to the newest few sets so it never vanishes.
  return recent.length > 0 ? recent : all.slice(0, FALLBACK_SETS);
}

type Item =
  | { type: 'header'; key: string; set: SealedSet; date: string; upcoming: boolean }
  | { type: 'product'; key: string; product: SealedProduct; value: number };

export function HomeSealed({ languages }: { languages?: CardLanguage[] }) {
  const { sealed, priceOf } = useSealed();
  const [width, setWidth] = useState(0);
  const [cardSize] = useCardSize();
  const sizeScale = CARD_SIZE_SCALE[cardSize];
  const gap = Spacing.two;
  const langSet = useMemo(
    () => (languages && languages.length ? new Set(languages) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [languages?.join(',')],
  );

  const items = useMemo<Item[]>(() => {
    if (!sealed) return [];
    const today = todayIso();
    return buildGroups(sealed, priceOf, langSet).flatMap((g): Item[] => [
      { type: 'header', key: `h-${g.set.id}`, set: g.set, date: g.date, upcoming: g.date > today },
      ...g.products.map(
        (p): Item => ({ type: 'product', key: p.id, product: p, value: priceOf(p.id) }),
      ),
    ]);
  }, [sealed, priceOf, langSet]);

  if (!sealed || items.length === 0) return null; // no gap until the (small) sealed catalog lands

  // Uniform tiles chunked into full-width pages so paging snaps cleanly. The ~144px target and the
  // image height scale with the app-wide card size (S/M/L) so sealed tiles match every other strip.
  const tileTarget = 144 * sizeScale;
  const imgH = Math.round(IMG_H * sizeScale);
  const perPage = width > 0 ? Math.max(2, Math.min(8, Math.floor((width + gap) / (tileTarget + gap)))) : 3;
  const tileWidth = width > 0 ? (width - gap * (perPage - 1)) / perPage : 0;
  const pages: Item[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));

  return (
    <HomeSection title="Sealed Products" collapsible={false}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <PagedCarousel
          width={width}
          prevLabel="Previous sealed products"
          nextLabel="More sealed products"
          pages={pages.map((pg, pi) => (
            <View key={pi} style={[styles.page, { gap }]}>
              {pg.map((item) =>
                item.type === 'header' ? (
                  <SetHeader key={item.key} set={item.set} date={item.date} upcoming={item.upcoming} width={tileWidth} />
                ) : (
                  <SealedTile key={item.key} product={item.product} value={item.value} width={tileWidth} imgH={imgH} />
                ),
              )}
            </View>
          ))}
        />
      </View>
    </HomeSection>
  );
}

function SetHeader({
  set,
  date,
  upcoming,
  width,
}: {
  set: SealedSet;
  date: string;
  upcoming: boolean;
  width: number;
}) {
  return (
    <View style={[styles.header, { width }]}>
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

function SealedTile({
  product,
  value,
  width,
  imgH,
}: {
  product: SealedProduct;
  value: number;
  width: number;
  imgH: number;
}) {
  return (
    <Pressable
      style={{ width }}
      onPress={() => Linking.openURL(productUrl(product.id)).catch(() => {})}
      accessibilityRole="link">
      <View style={[styles.imageWrap, { height: imgH }]}>
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
  page: { flexDirection: 'row', alignItems: 'stretch' },
  imageWrap: {
    width: '100%',
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
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.panel,
    backgroundColor: Palette.panelAlt,
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
