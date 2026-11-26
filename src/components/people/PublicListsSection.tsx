/**
 * MIC-041: a collector's Want list and Trade list on their profile page, read-only. Owned counts
 * are not shown to visitors; only what the owner chose to share is. Renders nothing
 * unless they turned on "Show my lists on my profile" (public_collection_lists returns null).
 *
 * Shown as a grid of card art (owner pick B, 2026-11-26; ListBrowse.tsx).
 */
import { useEffect, useMemo, useState } from 'react';

import { ListsGrid, useBrowseRows } from '@/components/people/ListBrowse';
import { publicRows } from '@/data/collectionLists';
import { fetchPublicLists, type PublicLists } from '@/data/listsRepo';
import { useCatalog } from '@/hooks/use-catalog';
import type { Catalog } from '@/lib/catalog';

/** `initial` and `catalogOverride` hand in data instead of reading it (the review preview). */
export function PublicListsSection({
  userId,
  initial,
  catalogOverride,
}: {
  userId: string;
  initial?: PublicLists;
  catalogOverride?: Catalog | null;
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
  const browse = useBrowseRows(rows, catalog);

  if (!rows.length) return null;
  return <ListsGrid rows={browse} />;
}
