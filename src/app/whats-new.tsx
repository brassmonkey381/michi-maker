/**
 * `/whats-new`: the public changelog for BOTH products. Entries come from src/data/changelog.ts;
 * shipping a feature means appending one object there and this page (plus the footer link
 * everywhere) does the rest. See the house rules in that file before writing an entry.
 *
 * THE FILTER IS TWO INDEPENDENT TOGGLES, not a segmented control, because the honest answer to
 * "which of these do you want" is often "both". Both start on. Turning both off shows nothing and
 * says so, rather than silently falling back to everything, which would make the toggles a lie.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { CHANGELOG, CHANGELOG_PRODUCTS, type ChangelogProduct } from '@/data/changelog';

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
  const [shown, setShown] = useState<ChangelogProduct[]>(CHANGELOG_PRODUCTS.map((p) => p.id));
  const toggle = (id: ChangelogProduct) =>
    setShown((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  // Filter the ITEMS, then drop any release that has nothing left: a day where only the other
  // product shipped should not leave an empty card behind.
  const entries = CHANGELOG.map((entry) => ({
    ...entry,
    items: entry.items.filter((item) => item.products.some((p) => shown.includes(p))),
  })).filter((entry) => entry.items.length > 0);

  const label = (id: ChangelogProduct) => CHANGELOG_PRODUCTS.find((p) => p.id === id)?.label ?? id;

  return (
    <PageShell
      title="What’s new in michi-maker and TCGScan"
      description="New features and improvements in michi-maker and TCGScan, grouped by release date.">
      <ThemedText type="subtitle" style={styles.h1}>
        What’s new
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        The features and improvements that changed what you can do here, newest first. Both products
        share an account and a card catalogue, so plenty of this lands in both.
      </ThemedText>

      <View style={styles.filter}>
        {CHANGELOG_PRODUCTS.map((product) => {
          const on = shown.includes(product.id);
          return (
            <Pressable
              key={product.id}
              onPress={() => toggle(product.id)}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Show ${product.label} changes`}
              style={({ pressed }) => [pillChip.base, on && pillChip.active, pressed && styles.pressed]}>
              <ThemedText style={[pillChip.text, on && pillChip.textActive]}>
                {product.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {entries.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          Nothing to show. Turn on {CHANGELOG_PRODUCTS.map((p) => p.label).join(' or ')} above.
        </ThemedText>
      ) : (
        <View style={styles.list}>
          {entries.map((entry) => (
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
                <View key={`${item.products.join()}:${item.head}`} style={styles.item}>
                  <View style={styles.itemHeadRow}>
                    <ThemedText type="smallBold" style={styles.itemHead}>
                      {item.head}
                    </ThemedText>
                    {/* Which product this one is. Shown even when only one filter is on, so an
                        item copied out of here, or landed on from a link, still says. */}
                    <View style={styles.tag}>
                      <ThemedText style={styles.tagText}>
                        {item.products.map(label).join(' · ')}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.itemBody}>
                    {item.body}
                  </ThemedText>
                </View>
              ))}
            </ThemedView>
          ))}
        </View>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: FontSize.title, lineHeight: 34, marginBottom: Spacing.two },
  lede: { lineHeight: 20, marginBottom: Spacing.three },
  filter: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.four, flexWrap: 'wrap' },
  pressed: { opacity: 0.7 },
  empty: { lineHeight: 20 },
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
  itemHeadRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  itemHead: { lineHeight: 20 },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.tag,
    backgroundColor: Palette.panel,
  },
  tagText: { fontSize: FontSize.micro, color: Palette.ink2, fontWeight: Weight.semibold },
  itemBody: { lineHeight: 20 },
});
