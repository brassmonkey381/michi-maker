/**
 * "My collection" — the signed-in user's card inventory (`user_cards`), fed live by
 * tcgscan-app scans. Renders nothing until the inventory has rows, so the section simply
 * appears the first time a scan (or, later, an import) lands — and updates in real time
 * while the page is open (scan a card in tcgscan, watch it show up here).
 *
 * Catalog-free: tiles resolve images straight from the card id (cardThumbUrl), so this
 * paints without the big catalog. The header shows count + total value once the shared
 * price summary resolves.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { HomeSection } from '@/components/HomeSection';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { fetchUserCards, subscribeUserCards, type UserCard } from '@/data/collectionRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { cardThumbUrl } from '@/lib/catalogConfig';
import { formatUsd, usePriceSummary } from '@/lib/prices';
import { useAuth } from '@/store/auth';

const TILE_W = 96;
const CARD_ASPECT = 88 / 63;

export function HomeCollection({ onFindSimilar }: { onFindSimilar?: (cardId: string) => void }) {
  const { user } = useAuth();
  const [cards, setCards] = useState<UserCard[] | null>(null);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    const load = () =>
      fetchUserCards()
        .then((rows) => {
          if (active) setCards(rows);
        })
        .catch(() => {});
    load();
    const unsubscribe = subscribeUserCards(userId, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  if (!cards || cards.length === 0) return null; // appears with the first scan/import
  return <CollectionStrip cards={cards} onFindSimilar={onFindSimilar} />;
}

/** Split out so the price summary (a ~MB shared fetch) only loads once rows actually exist. */
function CollectionStrip({
  cards,
  onFindSimilar,
}: {
  cards: UserCard[];
  onFindSimilar?: (cardId: string) => void;
}) {
  const priceSummary = usePriceSummary();
  const copies = cards.reduce((n, c) => n + c.quantity, 0);
  const value = priceSummary
    ? cards.reduce((sum, c) => sum + c.quantity * (priceSummary[c.cardId]?.cur ?? 0), 0)
    : 0;
  const headline = [
    `${copies} card${copies === 1 ? '' : 's'}`,
    value > 0 ? formatUsd(value) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <HomeSection
      title="My collection"
      action={
        <ThemedText type="small" themeColor="textSecondary">
          {headline}
        </ThemedText>
      }>
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(c) => `${c.cardId}|${c.condition}`}
        renderItem={({ item }) => <CardTile card={item} onPress={onFindSimilar} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      />
    </HomeSection>
  );
}

function CardTile({ card, onPress }: { card: UserCard; onPress?: (cardId: string) => void }) {
  const uri = cardThumbUrl(card.cardId, 245);
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      onPress={onPress ? () => onPress(card.cardId) : undefined}
      accessibilityLabel={`Find cards similar to this one`}>
      <View style={styles.imageWrap}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={card.cardId}
            transition={100}
            draggable={false}
          />
        ) : (
          <Text style={styles.imageFallback}>?</Text>
        )}
        {card.quantity > 1 ? (
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyText}>×{card.quantity}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { gap: Spacing.two, paddingVertical: Spacing.one },
  tile: { width: TILE_W },
  pressed: { opacity: 0.8 },
  imageWrap: {
    width: TILE_W,
    height: TILE_W * CARD_ASPECT,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  imageFallback: { fontSize: FontSize.h2, color: Palette.muted },
  qtyBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Palette.scrim62,
  },
  qtyText: { color: Palette.white, fontSize: FontSize.xs, fontWeight: Weight.bold },
});
