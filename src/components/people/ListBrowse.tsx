/**
 * MIC-041 (owner, 2026-11-26, picked B over a compact carousel): Want and Trade lists as a
 * page-wide grid of large card art that loads more as you scroll. The public profile shows it
 * read-only; the owner's /lists (`owner`) adds Owned to the switch and the tiles, and a tap opens
 * the card's sheet (want count, each copy's For trade).
 *
 * It shares one toolbar under the MIC-017 rules: a search box, All / Want / Trade (segmented),
 * a Sort dropdown and a Filters sheet (set, type, rarity). Every control is 44 px tall, text 13 px
 * or more, and on a phone the bar wraps to a second line instead of scrolling sideways.
 */
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { fetchCardsByIds, type CatalogCard } from 'tcgscan-browse';
import { Button, Input, Seg, Sheet } from 'tcgscan-ui';

import { DropdownSelect, type DropdownOption } from '@/components/ui/DropdownSelect';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { resolveCatalogCardWith } from '@/data/cardResolver';
import type { TableRow } from '@/data/collectionLists';
import {
  activeFilterCount,
  applyListQuery,
  browseRows,
  cardInfo,
  filterChoices,
  NO_FILTERS,
  type BrowseRow,
  type ListFilters,
  type ListQuery,
  type ListShow,
  type ListSort,
} from '@/data/listBrowse';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import type { Catalog } from '@/lib/catalog';

const SHOW = [
  { value: 'all', label: 'All' },
  { value: 'want', label: 'Want' },
  { value: 'trade', label: 'Trade' },
] as const;

const SHOW_OWNER = [
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'Owned' },
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
const OWNED = '#2e7d4f';

/**
 * Table rows with each card's name, set, type and rarity for search and filters. A visitor who is
 * signed out has no catalog, so the cards it cannot answer are read by id, once.
 */
export function useBrowseRows(rows: readonly TableRow[], catalog: Catalog | null): BrowseRow[] {
  const [byId, setById] = useState<Record<string, CatalogCard>>({});
  const missing = useMemo(() => rows.map((r) => r.cardId).filter((id) => !resolveCatalogCardWith(catalog, id)), [rows, catalog]);
  const missingKey = missing.join(',');
  useEffect(() => {
    if (!missingKey) return;
    let live = true;
    fetchCardsByIds(missingKey.split(','))
      .then((cards) => {
        if (live) setById((m) => ({ ...m, ...Object.fromEntries(cards.map((c) => [c.id, c])) }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [missingKey]);
  return useMemo(() => browseRows(rows, (id) => cardInfo(resolveCatalogCardWith(catalog, id) ?? byId[id])), [rows, catalog, byId]);
}

export function useListQuery() {
  const [query, setQuery] = useState<ListQuery>({ q: '', show: 'all', sort: 'newest', filters: NO_FILTERS });
  return { query, set: (patch: Partial<ListQuery>) => setQuery((q) => ({ ...q, ...patch })) };
}

/** The one toolbar: one row when it fits, else search + Filters, then the switch and sort. */
export function ListBrowseBar({
  rows,
  query,
  set,
  owner,
}: {
  rows: readonly BrowseRow[];
  query: ListQuery;
  set: (patch: Partial<ListQuery>) => void;
  owner?: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [w, setW] = useState(0);
  const n = activeFilterCount(query.filters);
  // One row when there is room for it. Otherwise two: search and Filters, then the
  // All / Want / Trade switch and the sort.
  const oneRow = w >= 720;
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
        <Seg options={owner ? SHOW_OWNER : SHOW} value={query.show} onChange={(show: ListShow) => set({ show })} accessibilityLabel="Show" />
        <DropdownSelect label="Sort" value={query.sort} options={SORT} onChange={(sort) => set({ sort })} caption={false} plain minWidth={112} display={`Sort: ${SORT.find((s) => s.id === query.sort)?.label}`} testID="lists-sort" />
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
function ListTile({ row, width, manifestReady, owner, onOpen }: { row: BrowseRow; width: number; manifestReady: boolean; owner?: boolean; onOpen?: (row: BrowseRow) => void }) {
  const uri = (manifestReady ? cardThumbUrl(row.cardId, width > 150 ? 640 : 245) : '') || undefined;
  const name = row.info.name || row.cardId;
  const label = `${name}${row.info.setName ? `, ${row.info.setName}` : ''}: ${[owner && row.owned ? `${row.owned} owned` : '', row.want ? `wants ${row.want}` : '', row.trade ? `${row.trade} for trade` : ''].filter(Boolean).join(', ')}`;
  return (
    <Pressable
      style={({ hovered }: { hovered?: boolean }) => [{ width }, onOpen && hovered ? styles.tileHover : null]}
      onPress={onOpen ? () => onOpen(row) : undefined}
      disabled={!onOpen}
      accessibilityRole={onOpen ? 'button' : undefined}
      testID={`lists-tile-${row.cardId}`}
      accessible
      accessibilityLabel={label}>
      <View style={[styles.art, { width, height: Math.round((width * 88) / 63) }]}>
        <Image source={uri ? { uri } : undefined} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
        <View style={styles.badges}>
          {owner && row.owned ? (
            <View style={[styles.badge, { backgroundColor: OWNED }]}>
              <Text style={styles.badgeText}>{`✓ ${row.owned}`}</Text>
            </View>
          ) : null}
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
      <Text style={styles.tileSet} numberOfLines={2}>{row.info.setName}</Text>
    </Pressable>
  );
}

function Totals({ rows, owner }: { rows: readonly BrowseRow[]; owner?: boolean }) {
  const t = rows.reduce((a, r) => ({ owned: a.owned + r.owned, want: a.want + r.want, trade: a.trade + r.trade }), { owned: 0, want: 0, trade: 0 });
  return (
    <View style={styles.totals} testID="lists-totals">
      {owner ? <Text style={[styles.total, { color: OWNED }]}>{`✓ ${t.owned} owned`}</Text> : null}
      <Text style={[styles.total, { color: WANT }]}>{`♥ ${t.want} want`}</Text>
      <Text style={[styles.total, { color: TRADE }]}>{`⇄ ${t.trade} trade`}</Text>
    </View>
  );
}

function Empty() {
  return <Text style={styles.empty}>No cards match.</Text>;
}

const PAGE = 24;

/** Layout B: page-wide grid of large card art; the next 24 load as the end comes into view. */
export function ListsGrid({
  rows,
  owner,
  onOpen,
  title = 'Want and Trade',
  above,
}: {
  rows: readonly BrowseRow[];
  /** The owner's /lists: Owned in the switch and on the tiles. */
  owner?: boolean;
  /** A tile was tapped (the owner's card sheet). */
  onOpen?: (row: BrowseRow) => void;
  title?: string | null;
  /** Drawn between the totals line and the toolbar (the owner's share switch). */
  above?: ReactNode;
}) {
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
    <View style={[styles.section, owner && styles.sectionOwner]} testID={owner ? 'lists-grid' : 'profile-lists-grid'}>
      <View style={styles.head}>
        {title ? <Text style={styles.titleLg}>{title}</Text> : null}
        <Totals rows={rows} owner={owner} />
      </View>
      {above}
      <ListBrowseBar rows={rows} query={query} set={set} owner={owner} />
      {shown.length === 0 ? (
        <Empty />
      ) : (
        <View style={[styles.grid, { gap: GAP }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {shown.slice(0, limit).map((r) => (
            <ListTile key={r.cardId} row={r} width={tileW} manifestReady={manifestReady} owner={owner} onOpen={onOpen} />
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
  section: { width: '100%', marginTop: Spacing.five, gap: Spacing.three },
  sectionOwner: { marginTop: 0 },
  tileHover: { opacity: 0.85 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  titleLg: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  totals: { flexDirection: 'row', gap: Spacing.three },
  total: { fontSize: FontSize.label, fontWeight: Weight.bold },
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
