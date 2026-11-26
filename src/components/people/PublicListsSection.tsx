/**
 * MIC-041: a collector's Want list and Trade list on their profile page, in the same table as
 * "My lists" (owner review 2026-11-26), read-only: thumbnail, card and set, Want and Trade columns.
 * Owned counts are not shown to visitors; only what the owner chose to share is. Renders nothing
 * unless they turned on "Show my lists on my profile" (public_collection_lists returns null).
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ListsView } from '@/components/lists/ListsView';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { publicRows } from '@/data/collectionLists';
import { fetchPublicLists, type PublicLists } from '@/data/listsRepo';
import { useCatalog } from '@/hooks/use-catalog';
import type { Catalog } from '@/lib/catalog';

/** `initial` and `catalogOverride` hand in data instead of reading it (the review preview). */
export function PublicListsSection({ userId, initial, catalogOverride }: { userId: string; initial?: PublicLists; catalogOverride?: Catalog | null }) {
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
  if (!rows.length) return null;
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
