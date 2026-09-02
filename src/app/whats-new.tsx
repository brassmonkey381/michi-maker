/**
 * `/whats-new`: the public changelog for BOTH products. Entries come from src/data/changelog.ts;
 * shipping a feature means appending one object there and this page (plus the footer link
 * everywhere) does the rest. See the house rules in that file before writing an entry.
 *
 * IT IS READ BY SCANNING, NOT BY READING. Seventy items of prose is a wall, and a wall gets
 * skipped whole. So the tags do the work: a coloured kind (New, Improved, Fixed), an area, and the
 * handful of items in a release worth stopping for, which sort to the top of it and carry a rule
 * down their edge in their own colour. The sentence under each head is for the one item in ten
 * that earns a second of attention.
 *
 * THE FILTERS ARE INDEPENDENT TOGGLES, not segmented controls, because the honest answer to "which
 * of these do you want" is usually "more than one". All start on. Turning a whole row off shows
 * nothing and says so, rather than silently falling back to everything, which would make the
 * toggles a lie.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import {
  CHANGE_AREAS,
  CHANGE_KINDS,
  CHANGELOG,
  CHANGELOG_PRODUCTS,
  type ChangeKind,
  type ChangelogProduct,
} from '@/data/changelog';

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

/** A status colour at a tint, for a chip that has to carry small text on top of it. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * One colour per kind, taken from the theme's own status roles so both schemes resolve: green for
 * something that was not there before, blue for something that got better, amber for something
 * that was broken.
 */
const KIND_COLOR: Record<ChangeKind, string> = {
  new: Palette.success,
  better: Palette.accent,
  fix: Palette.warning,
};

export default function WhatsNewScreen() {
  const [products, setProducts] = useState<ChangelogProduct[]>(CHANGELOG_PRODUCTS.map((p) => p.id));
  const [kinds, setKinds] = useState<ChangeKind[]>(CHANGE_KINDS.map((k) => k.id));

  const toggleProduct = (id: ChangelogProduct) =>
    setProducts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleKind = (id: ChangeKind) =>
    setKinds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Filter the ITEMS, then drop any release left with nothing: a day where only the other product
  // shipped, or only fixes, should not leave an empty card behind.
  const entries = CHANGELOG.map((entry) => ({
    ...entry,
    items: entry.items
      .filter((item) => item.products.some((p) => products.includes(p)) && kinds.includes(item.kind))
      // The ones worth stopping for come first; the rest keep the order they were written in,
      // which is roughly the order they matter in.
      .sort((a, b) => Number(Boolean(b.big)) - Number(Boolean(a.big))),
  })).filter((entry) => entry.items.length > 0);

  const productLabel = (id: ChangelogProduct) =>
    CHANGELOG_PRODUCTS.find((p) => p.id === id)?.label ?? id;
  const kindLabel = (id: ChangeKind) => CHANGE_KINDS.find((k) => k.id === id)?.label ?? id;

  return (
    <PageShell
      title="What’s new in michi-maker and TCGScan"
      description="New features, improvements and fixes in michi-maker and TCGScan, grouped by release date.">
      <ThemedText type="subtitle" style={styles.h1}>
        What’s new
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        Newest first. Both products share an account and a card catalogue, so plenty of this lands
        in both.
      </ThemedText>

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          {CHANGELOG_PRODUCTS.map((product) => {
            const on = products.includes(product.id);
            return (
              <Pressable
                key={product.id}
                onPress={() => toggleProduct(product.id)}
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
        <View style={styles.filterRow}>
          {CHANGE_KINDS.map((kind) => {
            const on = kinds.includes(kind.id);
            const color = KIND_COLOR[kind.id];
            return (
              <Pressable
                key={kind.id}
                onPress={() => toggleKind(kind.id)}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Show ${kind.label}`}
                style={({ pressed }) => [
                  styles.kindFilter,
                  { borderColor: color },
                  on && { backgroundColor: tint(color, 0.14) },
                  pressed && styles.pressed,
                ]}>
                <View
                  style={[styles.dot, { backgroundColor: on ? color : 'transparent', borderColor: color }]}
                />
                <ThemedText style={[styles.kindFilterText, { color: on ? color : Palette.muted }]}>
                  {kind.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {entries.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          Nothing matches. Turn something back on above.
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
              {entry.items.map((item) => {
                const color = KIND_COLOR[item.kind];
                return (
                  <View
                    key={`${item.products.join()}:${item.head}`}
                    style={[styles.item, item.big && styles.bigItem, item.big && { borderLeftColor: color }]}>
                    <View style={styles.tags}>
                      <View style={[styles.kindTag, { backgroundColor: tint(color, 0.16) }]}>
                        <ThemedText style={[styles.kindTagText, { color }]}>
                          {kindLabel(item.kind).toUpperCase()}
                        </ThemedText>
                      </View>
                      <View style={styles.areaTag}>
                        <ThemedText style={styles.areaTagText}>{CHANGE_AREAS[item.area]}</ThemedText>
                      </View>
                      {/* Which products this one is. Shown even when only one filter is on, so an
                          item copied out of here, or landed on from a link, still says. */}
                      <ThemedText style={styles.productText}>
                        {item.products.map(productLabel).join(' · ')}
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold" style={[styles.itemHead, item.big && styles.bigHead]}>
                      {item.head}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.itemBody}>
                      {item.body}
                    </ThemedText>
                  </View>
                );
              })}
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
  filters: { gap: Spacing.two, marginBottom: Spacing.four },
  filterRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  pressed: { opacity: 0.7 },
  kindFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  kindFilterText: { fontSize: FontSize.label, fontWeight: Weight.semibold },
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
    marginBottom: Spacing.one,
  },
  cardTitle: { fontSize: FontSize.md },
  item: { gap: 2 },
  // The few worth stopping for: a rule in their own kind's colour, and room to breathe.
  bigItem: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.two,
    marginLeft: -Spacing.two,
    paddingVertical: 2,
  },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 1 },
  kindTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.tag },
  kindTagText: { fontSize: FontSize.tag, fontWeight: Weight.bold, letterSpacing: 0.4 },
  areaTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.tag,
    backgroundColor: Palette.panel,
  },
  areaTagText: { fontSize: FontSize.tag, color: Palette.ink2, fontWeight: Weight.semibold },
  productText: { fontSize: FontSize.tag, color: Palette.muted2 },
  itemHead: { lineHeight: 20 },
  bigHead: { fontSize: FontSize.control, lineHeight: 22 },
  itemBody: { lineHeight: 20 },
});
