import { Image } from 'expo-image';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { CARDS } from '@/data/sampleData';

export default function BrowseScreen() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MaxContentWidth) - Spacing.four * 2;
  const columns = contentWidth > 600 ? 5 : contentWidth > 420 ? 4 : 3;
  const gap = Spacing.three;
  const tileWidth = (contentWidth - gap * (columns - 1)) / columns;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title" style={styles.h1}>
            Browse
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
            {CARDS.length} cards · sample catalogue. Add cards to pages in the binder editor.
          </ThemedText>

          <View style={[styles.grid, { gap }]}>
            {CARDS.map((card) => (
              <View key={card.id} style={{ width: tileWidth }}>
                <View style={[styles.imageWrap, { backgroundColor: `${card.dominantColor}22` }]}>
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
