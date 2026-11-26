/**
 * MIC-041: a collector's Want list and Trade list on their profile page, in the same table as
 * "My lists" (owner review 2026-11-26), read-only: thumbnail, card and set, Want and Trade columns.
 * Owned counts are not shown to visitors; only what the owner chose to share is. Renders nothing
 * unless they turned on "Show my lists on my profile" (public_collection_lists returns null).
 *
 * `layout` (owner, 2026-11-26, choosing): 'table' is the shipped table; 'rail' is option A (a
 * compact carousel box, top right on a desktop) and 'grid' is option B (a page-wide grid that
 * loads more as you scroll). See ListBrowse.tsx. A and B need each card's name, set, type and
 * rarity to search and filter; a signed-out visitor has no catalog, so those cards are read by id.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { fetchCardsByIds, type CatalogCard } from 'tcgscan-browse';

import { ListsView } from '@/components/lists/ListsView';
import { ListsGrid, ListsRail } from '@/components/people/ListBrowse';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { resolveCatalogCardWith } from '@/data/cardResolver';
import { publicRows } from '@/data/collectionLists';
import { browseRows, cardInfo } from '@/data/listBrowse';
import { fetchPublicLists, type PublicLists } from '@/data/listsRepo';
import { useCatalog } from '@/hooks/use-catalog';
import type { Catalog } from '@/lib/catalog';

export type ListsLayout = 'table' | 'rail' | 'grid';

/** `initial` and `catalogOverride` hand in data instead of reading it (the review preview). */
export function PublicListsSection({
  userId,
  initial,
  catalogOverride,
  layout = 'table',
  compact,
}: {
  userId: string;
  initial?: PublicLists;
  catalogOverride?: Catalog | null;
  layout?: ListsLayout;
  /** Layout A in its narrow top-right box. */
  compact?: boolean;
}) {
  const [lists, setLists] = useState<{ userId: string; lists: PublicLists | null } | null>(initial ? { userId, lists: initial } : null);
  const loaded = useCatalog(true).catalog;
  const catalog = catalogOverride ?? loaded;

  useEffect(() => {
    if (initial) return;
    let live = true;
    fetchPublicLists(userId)
      .then((l) => {
        if (live) setLists({ userId, lists: l });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId, initial]);

  const l = lists?.userId === userId ? lists.lists : null;
  const rows = useMemo(() => (l ? publicRows(l) : []), [l]);

  // Cards the catalog cannot answer (no catalog for a signed-out visitor), read by id once.
  const [byId, setById] = useState<Record<string, CatalogCard>>({});
  const missing = useMemo(
    () => (layout === 'table' ? [] : rows.map((r) => r.cardId).filter((id) => !resolveCatalogCardWith(catalog, id))),
    [rows, catalog, layout],
  );
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
  const browse = useMemo(
    () => browseRows(rows, (id) => cardInfo(resolveCatalogCardWith(catalog, id) ?? byId[id])),
    [rows, catalog, byId],
  );

  if (!rows.length) return null;
  if (layout === 'rail') return <ListsRail rows={browse} compact={compact} />;
  if (layout === 'grid') return <ListsGrid rows={browse} />;
  return (
    <View style={styles.wrap} testID="profile-lists">
      <ThemedText type="smallBold">Want and Trade</ThemedText>
      <ListsView rows={rows} ready catalog={catalog} readOnly />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Spacing.three, gap: Spacing.two },
});
