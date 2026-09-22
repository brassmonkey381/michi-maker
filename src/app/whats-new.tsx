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
 *
 * IT OPENS ON PINNED, AND ON THE LAST THREE MONTHS (owner, 2026-09-21). The first screen is the
 * short list of what this product is, not the log of last Tuesday; the log is one press away. A
 * pinned item from the last week is FRESH: it wears the accent, because it is the one thing a
 * returning reader has not seen, and the rail's What's New link glows while one exists.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight, MaxContentWidthDoc } from '@/constants/theme';
import { pillChip } from '@/constants/ui';
import { SHOW_CROSS_APP } from '@/lib/crossApp';
import {
  CHANGE_AREAS,
  CHANGE_KINDS,
  CHANGELOG,
  CHANGELOG_PRODUCTS,
  DEFAULT_RECENCY,
  FRESH_DAYS,
  RECENCY_OPTIONS,
  isWithin,
  type ChangeKind,
  type RecencyId,
  type ChangelogProduct,
  type ChangeArea,
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

/**
 * One colour per AREA as well, so a reader scanning for "did binders change" can find the
 * violet tags without reading a word. Fixed hues, tinted for the pill's ground the same way the
 * kind tags are, so each reads on both schemes.
 */
const AREA_COLOR: Record<ChangeArea, string> = {
  binders: '#7C5CBF',
  browse: '#1F7A8C',
  scanning: '#B5561E',
  collection: '#2E7D4F',
  sharing: '#C2185B',
  account: '#5B6B76',
  cards: '#A8780A',
};

/** True when an item's own words name the other product, whatever its product tags say. */
function namesOtherProduct(item: { head: string; body: string }): boolean {
  return /tcgscan/i.test(item.head + ' ' + item.body);
}

export default function WhatsNewScreen() {
  const [products, setProducts] = useState<ChangelogProduct[]>(SHOW_CROSS_APP ? CHANGELOG_PRODUCTS.map((p) => p.id) : ['michi']);
  const [kinds, setKinds] = useState<ChangeKind[]>(CHANGE_KINDS.map((k) => k.id));
  const AREA_IDS = Object.keys(CHANGE_AREAS) as ChangeArea[];
  const [areas, setAreas] = useState<ChangeArea[]>(AREA_IDS);
  // PINNED (owner, 2026-09-21): the curated short list, and nothing else. It does not change the
  // other filters, it sets them ASIDE: they go quiet while it is on and come back exactly as they
  // were left when it goes off. ON by default: the page opens on what matters, and one press
  // turns it into the changelog.
  const [pinnedOnly, setPinnedOnly] = useState(true);
  // How far back to look. Its own axis, beside Pinned rather than under it: it applies to the
  // pinned list too, so "pinned, this week" is a thing a reader can ask for.
  const [recency, setRecency] = useState<RecencyId>(DEFAULT_RECENCY);
  const [recencyOpen, setRecencyOpen] = useState(false);
  const recencyDays = RECENCY_OPTIONS.find((o) => o.id === recency)?.days ?? null;
  const recencyLabel = RECENCY_OPTIONS.find((o) => o.id === recency)?.label ?? '';
  // The clock is read ONCE, when the page opens: a changelog does not need to notice midnight,
  // and the compiler wants render to be pure.
  const [now] = useState(() => Date.now());

  const toggleProduct = (id: ChangelogProduct) =>
    setProducts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleKind = (id: ChangeKind) =>
    setKinds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleArea = (id: ChangeArea) =>
    setAreas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Filter the ITEMS, then drop any release left with nothing: a day where only the other product
  // shipped, or only fixes, should not leave an empty card behind.
  const entries = CHANGELOG.filter((entry) => isWithin(entry.date, recencyDays, now)).map((entry) => ({
    ...entry,
    // Fresh: dated within the last week. Only a PINNED item wears it (below); the rest of a fresh
    // batch is just new, which its date already says.
    fresh: isWithin(entry.date, FRESH_DAYS, now),
    items: entry.items
      .filter((item) =>
        pinnedOnly
          ? Boolean(item.pinned) && item.products.some((p) => products.includes(p))
          : item.products.some((p) => products.includes(p)) && kinds.includes(item.kind) && areas.includes(item.area),
      )
      // Kept apart (lib/crossApp): an item that is about the other product, in whole or in part, waits.
      .filter((item) => SHOW_CROSS_APP || !namesOtherProduct(item))
      // The ones worth stopping for come first; the rest keep the order they were written in,
      // which is roughly the order they matter in.
      .sort((a, b) => Number(Boolean(b.big)) - Number(Boolean(a.big))),
  })).filter((entry) => entry.items.length > 0);

  const productLabel = (id: ChangelogProduct) =>
    CHANGELOG_PRODUCTS.find((p) => p.id === id)?.label ?? id;
  const kindLabel = (id: ChangeKind) => CHANGE_KINDS.find((k) => k.id === id)?.label ?? id;

  return (
    <PageShell
      maxWidth={MaxContentWidthDoc}
      title={SHOW_CROSS_APP ? 'What’s new in michi-maker and TCGScan' : 'What’s new in michi-maker'}
      description={`New features, improvements and fixes in ${SHOW_CROSS_APP ? 'michi-maker and TCGScan' : 'michi-maker'}, grouped by release date.`}>
      <ThemedText type="subtitle" style={styles.h1}>
        What’s New
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        {SHOW_CROSS_APP
          ? 'Newest first. Both products share an account and a card catalogue, so plenty of this lands in both.'
          : 'Newest first.'}
      </ThemedText>

      <View style={styles.filters}>
        <View style={[styles.filterRow, styles.topRow]}>
          <Pressable
            onPress={() => setPinnedOnly((on) => !on)}
            accessibilityRole="switch"
            accessibilityState={{ checked: pinnedOnly }}
            accessibilityLabel="Show only the pinned updates"
            testID="whatsnew-pinned"
            style={({ pressed }) => [
              styles.kindFilter,
              styles.pinnedFilter,
              pinnedOnly && styles.pinnedFilterOn,
              pressed && styles.pressed,
            ]}>
            <ThemedText style={[styles.kindFilterText, { color: pinnedOnly ? Palette.accentText : Palette.accent }]}>
              {pinnedOnly ? '★ Pinned: the important ones' : '★ Pinned'}
            </ThemedText>
          </Pressable>
          {/* THE RECENCY SELECT: one closed pill that names the window, and the five windows under
              it when it is open. Absolute, so opening it moves nothing on the page. */}
          <View style={styles.recencyWrap}>
            <Pressable
              onPress={() => setRecencyOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={`Show updates from the last ${recencyLabel.toLowerCase()}. Change the window`}
              accessibilityState={{ expanded: recencyOpen }}
              testID="whatsnew-recency"
              style={({ pressed }) => [styles.kindFilter, styles.recencyButton, pressed && styles.pressed]}>
              <ThemedText style={styles.kindFilterText} themeColor="textSecondary">
                {recencyLabel}
              </ThemedText>
              <ThemedText style={styles.recencyChevron} themeColor="textSecondary">
                {recencyOpen ? '▴' : '▾'}
              </ThemedText>
            </Pressable>
            {recencyOpen ? (
              <ThemedView type="backgroundElement" style={styles.recencyMenu} testID="whatsnew-recency-menu">
                {RECENCY_OPTIONS.map((option) => {
                  const on = option.id === recency;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => {
                        setRecency(option.id);
                        setRecencyOpen(false);
                      }}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected: on }}
                      testID={`whatsnew-recency-${option.id}`}
                      style={({ pressed }) => [styles.recencyOption, on && styles.recencyOptionOn, pressed && styles.pressed]}>
                      <ThemedText type={on ? 'smallBold' : 'small'} themeColor={on ? undefined : 'textSecondary'}>
                        {option.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ThemedView>
            ) : null}
          </View>
        </View>
        {/* Set aside, not hidden: the reader can see their filters are still there, waiting. */}
        <View style={[styles.filterGroup, pinnedOnly && styles.setAside]} pointerEvents={pinnedOnly ? 'none' : 'auto'}>
        <View style={[styles.filterRow, !SHOW_CROSS_APP && styles.gone]}>
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
        {/* The areas, in their own colours: the same chips the items wear, so a reader who has
            learnt that violet means binders can switch everything else off with one tap each. */}
        <View style={styles.filterRow}>
          {AREA_IDS.map((id) => {
            const on = areas.includes(id);
            const color = AREA_COLOR[id];
            return (
              <Pressable
                key={id}
                onPress={() => toggleArea(id)}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Show ${CHANGE_AREAS[id]}`}
                style={({ pressed }) => [
                  styles.kindFilter,
                  { borderColor: on ? color : Palette.hairlineStrong },
                  on && { backgroundColor: tint(color, 0.14) },
                  pressed && styles.pressed,
                ]}>
                <ThemedText style={[styles.kindFilterText, { color: on ? color : Palette.muted }]}>
                  {CHANGE_AREAS[id]}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        </View>
      </View>

      {entries.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          {recency !== 'all'
            ? `Nothing ${pinnedOnly ? 'pinned ' : ''}in the last ${recencyLabel.toLowerCase()}. Widen the window above.`
            : pinnedOnly
              ? 'Nothing is pinned yet.'
              : 'Nothing matches. Turn something back on above.'}
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
                const fresh = entry.fresh && Boolean(item.pinned);
                return (
                  <View
                    key={`${item.products.join()}:${item.head}`}
                    testID={fresh ? 'whatsnew-fresh' : undefined}
                    style={[
                      styles.item,
                      item.big && styles.bigItem,
                      item.big && { borderLeftColor: color },
                      // Fresh AND pinned: the accent's ground, so it is found before it is read.
                      fresh && styles.freshItem,
                    ]}>
                    <View style={styles.tags}>
                      {fresh ? (
                        <View style={styles.freshTag}>
                          <ThemedText style={styles.freshTagText}>THIS WEEK</ThemedText>
                        </View>
                      ) : null}
                      <View style={[styles.kindTag, { backgroundColor: tint(color, 0.16) }]}>
                        <ThemedText style={[styles.kindTagText, { color }]}>
                          {kindLabel(item.kind).toUpperCase()}
                        </ThemedText>
                      </View>
                      <View style={[styles.areaTag, { backgroundColor: tint(AREA_COLOR[item.area], 0.14) }]}>
                        <ThemedText style={[styles.areaTagText, { color: AREA_COLOR[item.area] }]}>{CHANGE_AREAS[item.area]}</ThemedText>
                      </View>
                      {/* Which products this one is. Shown even when only one filter is on, so an
                          item copied out of here, or landed on from a link, still says. */}
                      {SHOW_CROSS_APP ? (
                        <ThemedText style={styles.productText}>
                          {item.products.map(productLabel).join(' · ')}
                        </ThemedText>
                      ) : null}
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
  // Above the list, so the open recency menu draws over the first card rather than under it.
  filters: { gap: Spacing.two, marginBottom: Spacing.four, zIndex: 2 },
  filterGroup: { gap: Spacing.two },
  setAside: { opacity: 0.35 },
  // Above the set-aside group, so the open menu draws over it rather than under it.
  topRow: { zIndex: 2, alignItems: 'center' },
  recencyWrap: { position: 'relative', zIndex: 2 },
  recencyButton: { borderColor: Palette.hairlineStrong, gap: 4 },
  recencyChevron: { fontSize: FontSize.label, lineHeight: 14 },
  recencyMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    minWidth: 150,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    paddingVertical: 4,
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.18)',
  },
  recencyOption: { paddingVertical: 7, paddingHorizontal: Spacing.three },
  recencyOptionOn: { backgroundColor: Palette.panel },
  // A pinned item from the last week: the accent's ground, edge to edge of the item.
  freshItem: {
    backgroundColor: tint(Palette.accent, 0.1),
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    marginHorizontal: -Spacing.two,
  },
  freshTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.tag, backgroundColor: Palette.accent },
  freshTagText: { fontSize: FontSize.label, fontWeight: Weight.bold, letterSpacing: 0.5, color: Palette.accentText },
  pinnedFilter: { borderColor: Palette.accent },
  pinnedFilterOn: { backgroundColor: Palette.accent },
  filterRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  gone: { display: 'none' },
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
  kindTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.tag },
  kindTagText: { fontSize: FontSize.label, fontWeight: Weight.bold, letterSpacing: 0.5 },
  areaTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.tag,
  },
  areaTagText: { fontSize: FontSize.label, fontWeight: Weight.semibold },
  productText: { fontSize: FontSize.label, color: Palette.muted2 },
  itemHead: { lineHeight: 20 },
  bigHead: { fontSize: FontSize.control, lineHeight: 22 },
  itemBody: { lineHeight: 20 },
});
