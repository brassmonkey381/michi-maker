/**
 * MIC-041: a collector's Want list and Trade list on their profile page, read-only. Owned counts are not shown to visitors; only what the owner chose to share is. Renders nothing
 * unless they turned on "Show my lists on my profile" (public_collection_lists returns null).
 *
 * Shown as a grid of card art (owner pick B, 2026-11-26; ListBrowse.tsx). Search and filters need
 * each card's name, set, type and rarity; a signed-out visitor has no catalog, so those are read by id.
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchCardsByIds, type CatalogCard } from 'tcgscan-browse';

import { ListsGrid } from '@/components/people/ListBrowse';
import { resolveCatalogCardWith } from '@/data/cardResolver';
import { publicRows } from '@/data/collectionLists';
import { browseRows, cardInfo } from '@/data/listBrowse';
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

  // Cards the catalog cannot answer (no catalog for a signed-out visitor), read by id once.
  const [byId, setById] = useState<Record<string, CatalogCard>>({});
  const missing = useMemo(
    () => rows.map((r) => r.cardId).filter((id) => !resolveCatalogCardWith(catalog, id)),
    [rows, catalog],
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
  return <ListsGrid rows={browse} />;
}
