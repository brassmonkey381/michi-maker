import { Image } from 'expo-image';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { DemoCard } from '@/data/binderTypes';
import { useCatalog } from '@/hooks/use-catalog';
import { catalogCardToDemoCard } from '@/lib/catalog';

export default function BrowseScreen() {
  const { width } = useWindowDimensions();
  const { catalog, loading } = useCatalog();
  const contentWidth = Math.min(width, MaxContentWidth) - Spacing.four * 2;
  const columns = contentWidth > 600 ? 5 : contentWidth > 420 ? 4 : 3;
  const gap = Spacing.three;
  const tileWidth = (contentWidth - gap * (columns - 1)) / columns;

  // A representative preview slice of the catalog: the first non-empty set of the newest
  // series. The full ~28k-card browse (Series → Set → Card) lives in the binder editor's
  // <CatalogBrowser>; this screen is just a gallery taste of the catalog.
  const cards = useMemo<DemoCard[]>(() => {
    if (!catalog) return [];
    for (const series of catalog.listSeries()) {
      for (const set of catalog.listSets(series.id)) {
        const setCards = catalog.listCards(set.id);
        if (setCards.length > 0) return setCards.slice(0, 60).map(catalogCardToDemoCard);
      }
    }
    return [];
  }, [catalog]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title" style={styles.h1}>
            Browse
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            {catalog
              ? `${catalog.cardCount.toLocaleString()} cards in the catalog · a preview below. Add cards to pages in the binder editor.`
              : 'Loading the card catalog…'}
          </ThemedText>

          {loading && !catalog ? <ActivityIndicator style={styles.loading} /> : null}

          <View style={[styles.grid, { gap }]}>
            {cards.map((card) => (
              <View key={card.id} style={{ width: tileWidth }}>
                <View
                  style={[
                    styles.imageWrap,
                    { backgroundColor: card.dominantColor ? `${card.dominantColor}22` : '#f0f0f3' },
                  ]}>
                  <Image source={{ uri: card.imageUrl }} style={styles.image} contentFit="contain" />
                </View>
                <ThemedText type="small" numberOfLines={1} style={styles.name}>
                  {card.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {card.setName}
                </ThemedText>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  loading: { marginVertical: Spacing.six },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  h1: { fontSize: 34, lineHeight: 40 },
  sub: { marginTop: Spacing.one, marginBottom: Spacing.four },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  imageWrap: {
    width: '100%',
    aspectRatio: 63 / 88,
    borderRadius: 10,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  name: { marginTop: Spacing.one },
});
