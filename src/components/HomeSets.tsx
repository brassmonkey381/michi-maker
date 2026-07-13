/**
 * Catalog-FREE "Recent & Upcoming" sets carousel — upcoming sets first (badged), then the
 * recently released, newest→oldest. Renders for everyone (guests included) whenever the rich
 * catalog-backed feed (HomeRecent) can't: the full catalog is a signed-in perk, but the sets
 * themselves are public data.
 *
 * Data: two slim PostgREST queries (the `sets` table carries no release dates, so dates derive
 * from a recent-window `cards` slice — set date = earliest card date, same as the catalog):
 *   1. cards?select=set_id,release_date&release_date=gte.<window> → per-set dates + a shop card
 *   2. sets?id=in.(…) → names, series, logos, card counts
 * Load-once module cache; fails soft (renders nothing).
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getApiKey, getApiUrl, setShopUrl } from 'tcgscan-browse';

import { HomeSection } from '@/components/HomeSection';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';

/** Sets whose first card released in the last N months (plus every future-dated set). */
const MONTHS_BACK = 8;
const TILE_W = 168;
const IMG_H = 84;

interface SetTile {
  id: number;
  name: string;
  series: string;
  logoUrl: string;
  cardCount: number;
  releaseDate: string; // yyyy-mm-dd (earliest card)
  upcoming: boolean;
  /** TCGPlayer set slug source (sets.url_name) — powers the "Shop →" link. */
  urlName: string;
}

let cache: SetTile[] | null = null;
let loadPromise: Promise<SetTile[]> | null = null;

async function loadSetTiles(): Promise<SetTile[]> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      const apiUrl = getApiUrl();
      const apiKey = getApiKey();
      if (!apiUrl || !apiKey) return [];
      const today = new Date().toISOString().slice(0, 10);
      const cutoff = new Date(Date.now() - MONTHS_BACK * 30 * 86400e3).toISOString().slice(0, 10);

      const cardsRes = await fetch(
        `${apiUrl}/cards?select=set_id,release_date&release_date=gte.${cutoff}&order=release_date.desc&limit=4000`,
        { headers: { apikey: apiKey } },
      );
      if (!cardsRes.ok) return [];
      const cards = (await cardsRes.json()) as { set_id: number; release_date: string }[];

      // Per set: earliest card date = the set's release (rows are date-desc).
      const bySet = new Map<number, { first: string }>();
      for (const c of cards) {
        const cur = bySet.get(c.set_id);
        if (!cur) bySet.set(c.set_id, { first: c.release_date });
        else if (c.release_date < cur.first) cur.first = c.release_date;
      }
      if (bySet.size === 0) return [];

      const setIds = [...bySet.keys()];
      const setsRes = await fetch(
        `${apiUrl}/sets?select=id,name,series,logo_url,card_count,url_name&id=in.(${setIds.join(',')})`,
        { headers: { apikey: apiKey } },
      );
      if (!setsRes.ok) return [];
      const sets = (await setsRes.json()) as {
        id: number;
        name: string;
        series: string | null;
        logo_url: string | null;
        card_count: number | null;
        url_name: string | null;
      }[];

      const tiles: SetTile[] = sets.map((s) => {
        const d = bySet.get(s.id)!;
        return {
          id: s.id,
          name: s.name,
          series: s.series ?? '',
          logoUrl: s.logo_url ?? '',
          cardCount: s.card_count ?? 0,
          releaseDate: d.first,
          upcoming: d.first > today,
          urlName: s.url_name ?? '',
        };
      });
      // Upcoming first (soonest release leading), then released newest→oldest.
      tiles.sort((a, b) =>
        a.upcoming !== b.upcoming
          ? Number(b.upcoming) - Number(a.upcoming)
          : a.upcoming
            ? a.releaseDate.localeCompare(b.releaseDate)
            : b.releaseDate.localeCompare(a.releaseDate),
      );
      cache = tiles;
      return tiles;
    })().catch(() => []);
  }
  return loadPromise;
}

export function HomeSets({ onOpenSet }: { onOpenSet?: (setId: string, series: string) => void }) {
  // Only the cold/guest fallback: when the full catalog is loaded, HomeRecent renders the richer
  // feed (set tiles with card montages + card strips) in this same slot.
  const { catalog } = useCatalog(false);
  const [tiles, setTiles] = useState<SetTile[] | null>(cache);

  useEffect(() => {
    if (catalog || tiles) return;
    let active = true;
    loadSetTiles().then((t) => {
      if (active) setTiles(t);
    });
    return () => {
      active = false;
    };
  }, [catalog, tiles]);

  if (catalog || !tiles || tiles.length === 0) return null;

  return (
    <HomeSection title="Recent & Upcoming">
      <FlatList
        horizontal
        data={tiles}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <SetTileView tile={item} onOpenSet={onOpenSet} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      />
    </HomeSection>
  );
}

function SetTileView({
  tile,
  onOpenSet,
}: {
  tile: SetTile;
  onOpenSet?: (setId: string, series: string) => void;
}) {
  const date = tile.releaseDate ? tile.releaseDate.slice(0, 7) : '';
  const shop = setShopUrl(tile.urlName);
  return (
    // Tile → open this set in the home card browser (catalog-free viewSetById command).
    <Pressable
      style={styles.tile}
      onPress={() => onOpenSet?.(String(tile.id), tile.series)}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${tile.name}${tile.upcoming ? ' (upcoming)' : ''}`}>
      <View style={styles.logoWrap}>
        {tile.logoUrl ? (
          <Image
            source={{ uri: tile.logoUrl }}
            style={styles.logo}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={String(tile.id)}
            transition={100}
          />
        ) : (
          <Text style={styles.logoFallback} numberOfLines={2}>
            {tile.name}
          </Text>
        )}
        {tile.upcoming ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Upcoming</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {tile.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {[date, tile.cardCount ? `${tile.cardCount} cards` : ''].filter(Boolean).join(' · ')}
      </Text>
      {/* Shop → the set's TCGPlayer category page (separate tap target inside the tile). */}
      {shop ? (
        <Pressable
          onPress={() => Linking.openURL(shop).catch(() => {})}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel={`Shop ${tile.name} on TCGPlayer`}>
          <Text style={styles.link}>Shop →</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { gap: Spacing.three, paddingVertical: Spacing.one },
  tile: { width: TILE_W },
  logoWrap: {
    width: TILE_W,
    height: IMG_H,
    borderRadius: Radius.panel,
    backgroundColor: Palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: Spacing.one,
  },
  logo: { width: '100%', height: '100%' },
  logoFallback: {
    fontSize: FontSize.sm,
    fontWeight: Weight.bold,
    color: Palette.muted,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: Palette.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: Palette.accentText, fontSize: FontSize.micro, fontWeight: Weight.bold },
  name: {
    marginTop: Spacing.one,
    fontSize: FontSize.sm,
    lineHeight: 14,
    fontWeight: Weight.semibold,
    color: Palette.ink,
  },
  meta: { fontSize: FontSize.xs, color: Palette.muted, marginTop: 2 },
  link: { fontSize: FontSize.xs, color: Palette.accent, fontWeight: Weight.semibold, marginTop: 2 },
});
