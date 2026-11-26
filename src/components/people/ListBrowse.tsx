/**
 * MIC-041 (owner, 2026-11-26): the public profile's Want and Trade lists as cards, in two layouts
 * the owner is choosing between (`?lists=a` / `?lists=b` on /u/<name>, branch profile-lists-ab):
 *
 *   A  ListsRail: a compact box, top right of the profile on a desktop; the cards scroll left and
 *      right like a carousel (arrows for a mouse, a swipe on a phone).
 *   B  ListsGrid: as wide as the page; a grid of large card art that loads more as you scroll.
 *
 * Both share one toolbar under the MIC-017 rules: a search box, All / Want / Trade (segmented),
 * a Sort dropdown and a Filters sheet (set, type, rarity). Every control is 44 px tall, text 13 px
 * or more, and on a phone the bar wraps to a second line instead of scrolling sideways.
 */
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Button, Input, Seg, Sheet } from 'tcgscan-ui';

import { DropdownSelect, type DropdownOption } from '@/components/ui/DropdownSelect';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  activeFilterCount,
  applyListQuery,
  filterChoices,
  NO_FILTERS,
  type BrowseRow,
  type ListFilters,
  type ListQuery,
  type ListShow,
  type ListSort,
} from '@/data/listBrowse';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';

const SHOW = [
  { value: 'all', label: 'All' },
  { value: 'want', label: 'Want' },
  { value: 'trade', label: 'Trade' },
] as const;

const SORT: readonly DropdownOption<ListSort>[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'name', label: 'Name' },
  { id: 'set', label: 'Set' },
];

const WANT = '#2f7fc1';
const TRADE = '#b07400';

export function useListQuery() {
  const [query, setQuery] = useState<ListQuery>({ q: '', show: 'all', sort: 'newest', filters: NO_FILTERS });
  return { query, set: (patch: Partial<ListQuery>) => setQuery((q) => ({ ...q, ...patch })) };
}

/** The one toolbar. `compact` (layout A's narrow box) puts the search on its own line. */
export function ListBrowseBar({
  rows,
  query,
  set,
  compact,
}: {
  rows: readonly BrowseRow[];
  query: ListQuery;
  set: (patch: Partial<ListQuery>) => void;
  compact?: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [w, setW] = useState(0);
  const n = activeFilterCount(query.filters);
  // One row when there is room for it. Otherwise two: search and Filters, then the
  // All / Want / Trade switch and the sort.
  const oneRow = !compact && w >= 720;
  const filters = (
    <Button label={n ? `Filters (${n})` : 'Filters'} look={n ? 'primary' : 'secondary'} onPress={() => setFiltersOpen(true)} accessibilityLabel={n ? `Filters, ${n} on` : 'Filters'} />
  );
  return (
    <View style={[styles.bar, oneRow && styles.barRow]} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} testID="lists-bar">
      <View style={[styles.line, oneRow && styles.searchRow]}>
        <View style={styles.searchBox}>
          <Input
            shape="search"
            value={query.q}
            onChangeText={(q) => set({ q })}
            placeholder="Search cards or sets"
            accessibilityLabel="Search their lists"
            autoCorrect={false}
            testID="lists-search"
          />
        </View>
        {oneRow ? null : filters}
      </View>
      <View style={styles.controls}>
        <Seg options={SHOW} value={query.show} onChange={(show: ListShow) => set({ show })} accessibilityLabel="Show" />
        <DropdownSelect label="Sort" value={query.sort} options={SORT} onChange={(sort) => set({ sort })} caption={false} minWidth={112} display={`Sort: ${SORT.find((s) => s.id === query.sort)?.label}`} testID="lists-sort" />
        {oneRow ? filters : null}
      </View>
      <FiltersSheet visible={filtersOpen} rows={rows} value={query.filters} onChange={(filters) => set({ filters })} onClose={() => setFiltersOpen(false)} />
    </View>
  );
}

const ANY = '__any';

function FiltersSheet({
  visible,
  rows,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  rows: readonly BrowseRow[];
  value: ListFilters;
  onChange: (f: ListFilters) => void;
  onClose: () => void;
}) {
  const choices = useMemo(() => filterChoices(rows), [rows]);
  const opts = (all: string[], anyLabel: string): DropdownOption<string>[] => [{ id: ANY, label: anyLabel }, ...all.map((v) => ({ id: v, label: v }))];
  const pick = (k: keyof ListFilters) => (v: string) => onChange({ ...value, [k]: v === ANY ? '' : v });
  return (
    <Sheet
      visible={visible}
      title="Filters"
      onClose={onClose}
      actions={[
        { label: 'Clear', onPress: () => onChange(NO_FILTERS), disabled: activeFilterCount(value) === 0 },
        { label: 'Done', onPress: onClose, look: 'primary' },
      ]}>
      <View style={styles.sheetBody} testID="lists-filters">
        <DropdownSelect label="Set" value={value.set || ANY} options={opts(choices.set, 'Any set')} onChange={pick('set')} testID="lists-filter-set" />
        <DropdownSelect label="Type" value={value.type || ANY} options={opts(choices.type, 'Any type')} onChange={pick('type')} testID="lists-filter-type" />
        <DropdownSelect label="Rarity" value={value.rarity || ANY} options={opts(choices.rarity, 'Any rarity')} onChange={pick('rarity')} testID="lists-filter-rarity" />
      </View>
    </Sheet>
  );
}

/** One card: its art large, the ♥ want and ⇄ trade counts on it, its name under it. */
function ListTile({ row, width, manifestReady }: { row: BrowseRow; width: number; manifestReady: boolean }) {
  const uri = (manifestReady ? cardThumbUrl(row.cardId, width > 150 ? 640 : 245) : '') || undefined;
  const name = row.info.name || row.cardId;
  return (
    <View style={{ width }} testID={`lists-tile-${row.cardId}`} accessible accessibilityLabel={`${name}${row.info.setName ? `, ${row.info.setName}` : ''}: ${row.want ? `wants ${row.want}` : ''}${row.want && row.trade ? ', ' : ''}${row.trade ? `${row.trade} for trade` : ''}`}>
      <View style={[styles.art, { width, height: Math.round((width * 88) / 63) }]}>
        <Image source={uri ? { uri } : undefined} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
        <View style={styles.badges}>
          {row.want ? (
            <View style={[styles.badge, { backgroundColor: WANT }]}>
              <Text style={styles.badgeText}>{`♥ ${row.want}`}</Text>
            </View>
          ) : null}
          {row.trade ? (
            <View style={[styles.badge, { backgroundColor: TRADE }]}>
              <Text style={styles.badgeText}>{`⇄ ${row.trade}`}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.tileName} numberOfLines={1}>{name}</Text>
      <Text style={styles.tileSet} numberOfLines={1}>{row.info.setName}</Text>
    </View>
  );
}

function Totals({ rows }: { rows: readonly BrowseRow[] }) {
  const t = rows.reduce((a, r) => ({ want: a.want + r.want, trade: a.trade + r.trade }), { want: 0, trade: 0 });
  return (
    <View style={styles.totals}>
      <Text style={[styles.total, { color: WANT }]}>{`♥ ${t.want} want`}</Text>
      <Text style={[styles.total, { color: TRADE }]}>{`⇄ ${t.trade} trade`}</Text>
    </View>
  );
}

function Empty() {
  return <Text style={styles.empty}>No cards match.</Text>;
}

/** Layout A: a compact box with the cards in one sideways-scrolling line. */
export function ListsRail({ rows, compact }: { rows: readonly BrowseRow[]; compact?: boolean }) {
  const manifestReady = useImageManifest();
  const { query, set } = useListQuery();
  const shown = useMemo(() => applyListQuery(rows, query), [rows, query]);
  const scroller = useRef<ScrollView>(null);
  const [x, setX] = useState(0);
  const [viewW, setViewW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const TILE = compact ? 112 : 128;
  const step = Math.max(TILE + Spacing.two, Math.floor(viewW / (TILE + Spacing.two)) * (TILE + Spacing.two));
  const go = (dir: 1 | -1) => scroller.current?.scrollTo({ x: Math.max(0, x + dir * step), animated: true });
  const canBack = x > 4;
  const canFwd = x + viewW < contentW - 4;
  return (
    <View style={styles.box} testID="profile-lists-rail">
      <View style={styles.head}>
        <Text style={styles.title}>Want and Trade</Text>
        <Totals rows={rows} />
      </View>
      <ListBrowseBar rows={rows} query={query} set={set} compact={compact} />
      {shown.length === 0 ? (
        <Empty />
      ) : (
        <View>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={Platform.OS === 'web'}
            onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={32}
            onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
            onContentSizeChange={(w) => setContentW(w)}
            contentContainerStyle={styles.railRow}>
            {shown.map((r) => (
              <ListTile key={r.cardId} row={r} width={TILE} manifestReady={manifestReady} />
            ))}
          </ScrollView>
          {Platform.OS === 'web' && contentW > viewW + 4 ? (
            <View style={styles.arrows}>
              <Text style={styles.count}>{`${shown.length} card${shown.length === 1 ? '' : 's'}`}</Text>
              <Pressable onPress={() => go(-1)} disabled={!canBack} accessibilityRole="button" accessibilityLabel="Previous cards" style={[styles.arrow, !canBack && styles.arrowOff]}>
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>
              <Pressable onPress={() => go(1)} disabled={!canFwd} accessibilityRole="button" accessibilityLabel="More cards" style={[styles.arrow, !canFwd && styles.arrowOff]}>
                <Text style={styles.arrowText}>›</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const PAGE = 24;

/** Layout B: page-wide grid of large card art; the next 24 load as the end comes into view. */
export function ListsGrid({ rows }: { rows: readonly BrowseRow[] }) {
  const manifestReady = useImageManifest();
  const { query, set } = useListQuery();
  const shown = useMemo(() => applyListQuery(rows, query), [rows, query]);
  const [limit, setLimit] = useState(PAGE);
  const [w, setW] = useState(0);
  // A new search or filter starts from the top page again.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging when the query changes
  useEffect(() => setLimit(PAGE), [query]);
  const GAP = Spacing.three;
  const cols = w <= 0 ? 3 : w < 560 ? 3 : Math.max(4, Math.floor((w + GAP) / (164 + GAP)));
  const tileW = w > 0 ? Math.floor((w - GAP * (cols - 1)) / cols) : 110;
  const more = shown.length > limit;
  const sentinel = useRef<View>(null);
  useEffect(() => {
    if (!more || Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined') return;
    const el = sentinel.current as unknown as Element | null;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, limit]);
  return (
    <View style={styles.section} testID="profile-lists-grid">
      <View style={styles.head}>
        <Text style={styles.titleLg}>Want and Trade</Text>
        <Totals rows={rows} />
      </View>
      <ListBrowseBar rows={rows} query={query} set={set} />
      {shown.length === 0 ? (
        <Empty />
      ) : (
        <View style={[styles.grid, { gap: GAP }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {shown.slice(0, limit).map((r) => (
            <ListTile key={r.cardId} row={r} width={tileW} manifestReady={manifestReady} />
          ))}
        </View>
      )}
      {more ? (
        Platform.OS === 'web' ? (
          <View ref={sentinel} collapsable={false} style={styles.sentinel}>
            <Text style={styles.count}>Loading more...</Text>
          </View>
        ) : (
          <Button label="Show more" onPress={() => setLimit((l) => l + PAGE)} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: Spacing.two },
  barRow: { flexDirection: 'row', alignItems: 'center' },
  line: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  searchBox: { flex: 1, minWidth: 0 },
  searchRow: { flex: 1, width: undefined, minWidth: 0 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  sheetBody: { gap: Spacing.three, paddingVertical: Spacing.two },
  box: { gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.panel, borderWidth: 1, borderColor: Palette.hairline, backgroundColor: Palette.surface },
  section: { width: '100%', marginTop: Spacing.five, gap: Spacing.three },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  title: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  titleLg: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  totals: { flexDirection: 'row', gap: Spacing.three },
  total: { fontSize: FontSize.label, fontWeight: Weight.bold },
  railRow: { gap: Spacing.two, paddingBottom: Spacing.two },
  arrows: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: Spacing.two },
  arrow: { width: 44, height: 44, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.surface },
  arrowOff: { opacity: 0.35 },
  arrowText: { fontSize: 24, lineHeight: 26, fontWeight: Weight.bold, color: Palette.ink },
  count: { flex: 1, fontSize: 13, color: Palette.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  art: { borderRadius: 6, overflow: 'hidden', backgroundColor: Palette.hairline },
  badges: { position: 'absolute', left: 4, right: 4, bottom: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.pill, borderWidth: 1.5, borderColor: '#ffffff' },
  badgeText: { color: '#ffffff', fontSize: 13, fontWeight: Weight.bold },
  tileName: { marginTop: 6, fontSize: 13, fontWeight: Weight.semibold, color: Palette.ink },
  tileSet: { fontSize: 13, color: Palette.muted },
  empty: { paddingVertical: Spacing.three, fontSize: FontSize.label, color: Palette.muted },
  sentinel: { paddingVertical: Spacing.three, alignItems: 'center' },
});
