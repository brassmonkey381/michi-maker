/**
 * MIC-041: MY LISTS, under My Binders. One table of the collection, owned | want | trade per card
 * (owner, 2026-11-26: "an easy list / table ... where people can have multiples of a specific card,
 * but want more or mark only a subset of them for willing to trade"). Each card opens to its copies,
 * and each copy has its own "For trade" switch, so a graded copy can stay off the Trade list.
 * Free for everyone with an account. The table itself is components/lists/ListsView.
 */
import { useMemo } from 'react';

import { AccountButton } from '@/components/auth/AccountButton';
import { PageShell } from '@/components/layout/PageShell';
import { ListsView } from '@/components/lists/ListsView';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidthWide } from '@/constants/theme';
import { collectionTable } from '@/data/collectionLists';
import { useCatalog } from '@/hooks/use-catalog';
import { useCollectionLists } from '@/hooks/use-collection-lists';
import { useOwnedCopies } from '@/hooks/use-owned-copies';
import { useShowLists } from '@/hooks/use-show-lists';
import { useImageManifest } from '@/lib/catalogConfig';
import { useAuth } from '@/store/auth';

export default function ListsScreen() {
  const { user } = useAuth();
  const { catalog } = useCatalog(true);
  useImageManifest();
  const copies = useOwnedCopies();
  const lists = useCollectionLists();
  const share = useShowLists();
  const rows = useMemo(
    () =>
      collectionTable(
        (copies ?? []).map((c) => ({ entryId: c.entryId, cardId: c.cardId, quantity: c.quantity, variant: c.variant, hasScan: c.hasScan })),
        lists.wants,
        lists.trades,
      ),
    [copies, lists.wants, lists.trades],
  );

  if (!user || user.is_anonymous) {
    return (
      <PageShell title="My lists" heading="My lists" lede="Owned, Want and Trade, card by card." maxWidth={MaxContentWidthWide}>
        <ThemedText>Create an account to keep a Want list and a Trade list.</ThemedText>
        <AccountButton />
      </PageShell>
    );
  }
  return (
    <PageShell title="My lists" heading="My lists" lede="Owned, Want and Trade, card by card." maxWidth={MaxContentWidthWide}>
      <ListsView rows={rows} ready={lists.ready && copies !== undefined} catalog={catalog} share={share} actions={lists} />
    </PageShell>
  );
}
