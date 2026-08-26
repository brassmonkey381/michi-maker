/**
 * `/whats-new`: the public changelog. Entries come from src/data/changelog.ts; shipping a
 * feature means appending one object there and this page (plus the footer link everywhere)
 * does the rest. See the house rules in that file before writing an entry.
 */
import { StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { CHANGELOG } from '@/data/changelog';

/** "August 26, 2026", stable across locales enough for a changelog heading. */
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
}

export default function WhatsNewScreen() {
  return (
    <PageShell
      title="What’s new in michi-maker"
      description="New features and improvements in michi-maker, grouped by release date.">
      <ThemedText type="subtitle" style={styles.h1}>
        What’s new
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        The features and improvements that changed what you can do here, newest first.
      </ThemedText>

      <View style={styles.list}>
        {CHANGELOG.map((entry) => (
          <ThemedView key={entry.date} type="backgroundElement" style={styles.card}>
            <View style={styles.cardHead}>
              <ThemedText type="smallBold" style={styles.cardTitle}>
                {entry.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {longDate(entry.date)}
              </ThemedText>
            </View>
            {entry.items.map((item) => (
              <View key={item.head} style={styles.item}>
                <ThemedText type="smallBold" style={styles.itemHead}>
                  {item.head}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.itemBody}>
                  {item.body}
                </ThemedText>
              </View>
            ))}
          </ThemedView>
        ))}
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: FontSize.title, lineHeight: 34, marginBottom: Spacing.two },
  lede: { lineHeight: 20, marginBottom: Spacing.four },
  list: { gap: Spacing.three },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  cardTitle: { fontSize: FontSize.md },
  item: { gap: 2 },
  itemHead: { lineHeight: 20 },
  itemBody: { lineHeight: 20 },
});
