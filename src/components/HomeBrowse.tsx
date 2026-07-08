/**
 * A collapsible "Browse all cards" section for the home screen. Collapsed by default so the
 * home page never pays the ~25 MB catalog load or renders any card images on first paint —
 * `useCatalog(open)` only forces the load once the section is expanded. Mounts the shared
 * `CatalogBrowser` (series → set → card, search, facets) in a fixed-height panel so its inner
 * FlatList gets a bounded, scrollable viewport inside the home ScrollView.
 */
import { CatalogBrowser } from 'tcgscan-browse';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';

export function HomeBrowse() {
  const [open, setOpen] = useState(false);
  // Only subscribes-and-loads the catalog when expanded; collapsed is a no-op for page load.
  const { catalog, error } = useCatalog(open);
  const { height } = useWindowDimensions();
  const panelHeight = Math.max(460, Math.round(height * 0.7));

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.header}>
        <ThemedText type="smallBold" style={styles.title}>
          Browse all cards
        </ThemedText>
        <ThemedText type="smallBold" style={styles.chevron}>
          {open ? '▾' : '▸'}
        </ThemedText>
      </Pressable>

      {open ? (
        <View style={[styles.panel, { height: panelHeight }]}>
          {catalog ? (
            // On home, browsing is exploration — placing a card needs a binder, so onPickCard
            // is a no-op for now (Find similar / View set in the card menu still work).
            <CatalogBrowser
              catalog={catalog}
              onPickCard={() => {}}
              footer={null}
              cardTileWidth={140}
              taxTileHeight={180}
            />
          ) : (
            <View style={styles.center}>
              {error ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Card catalog is unavailable right now.
                </ThemedText>
              ) : (
                <ActivityIndicator />
              )}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.five },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  title: { textTransform: 'uppercase', letterSpacing: 0.5 },
  chevron: { color: Palette.muted, fontSize: FontSize.md },
  panel: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
