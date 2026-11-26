/**
 * MIC-041: MY LISTS, under My Binders. One table of the collection, owned | want | trade per card
 * (owner, 2026-11-26: "an easy list / table ... where people can have multiples of a specific card,
 * but want more or mark only a subset of them for willing to trade"). Each card opens to its copies,
 * and each copy has its own "For trade" switch, so a graded copy can stay off the Trade list.
 * A "Show" menu picks All, Owned, Want or Trade. The profile switch for sharing both lists is here
 * too. Free for everyone with an account.
 */
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AccountButton } from '@/components/auth/AccountButton';
import { PageShell } from '@/components/layout/PageShell';
import { ThemedText } from '@/components/themed-text';
import { DropdownSelect, type DropdownOption } from '@/components/ui/DropdownSelect';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { collectionTable, filterTable, type TableFilter, type TableRow } from '@/data/collectionLists';
import { resolveCardWith } from '@/data/cardResolver';
import { useShowLists } from '@/hooks/use-show-lists';
import { useCatalog } from '@/hooks/use-catalog';
import { useCollectionLists } from '@/hooks/use-collection-lists';
import { useOwnedCopies } from '@/hooks/use-owned-copies';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import { useAuth } from '@/store/auth';

const SHOW: readonly DropdownOption<TableFilter>[] = [
  { id: 'all', label: 'All' },
  { id: 'owned', label: 'Owned' },
  { id: 'want', label: 'Want' },
  { id: 'trade', label: 'Trade' },
];

export default function ListsScreen() {
  const { user } = useAuth();
  const { catalog } = useCatalog(true);
  useImageManifest();
  const copies = useOwnedCopies();
  const lists = useCollectionLists();
  const share = useShowLists();
  const [show, setShow] = useState<TableFilter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      collectionTable(
        (copies ?? []).map((c) => ({ entryId: c.entryId, cardId: c.cardId, quantity: c.quantity, variant: c.variant, hasScan: c.hasScan })),
        lists.wants,
        lists.trades,
      ),
    [copies, lists.wants, lists.trades],
  );
  const shown = useMemo(() => {
    const name = (r: TableRow) => resolveCardWith(catalog, r.cardId)?.name ?? r.cardId;
    return filterTable(rows, show).sort((a, b) => name(a).localeCompare(name(b)));
  }, [rows, show, catalog]);
  const totals = useMemo(
    () => rows.reduce((t, r) => ({ owned: t.owned + r.owned, want: t.want + r.want, trade: t.trade + r.trade }), { owned: 0, want: 0, trade: 0 }),
    [rows],
  );

  if (!user || user.is_anonymous) {
    return (
      <PageShell title="My lists">
        <ThemedText>Create an account to keep a Want list and a Trade list.</ThemedText>
        <AccountButton />
      </PageShell>
    );
  }

  return (
    <PageShell title="My lists">
      <View style={styles.bar}>
        <View style={styles.totals} testID="lists-totals">
          <Text style={styles.total}>{`${totals.owned} owned`}</Text>
          <Text style={[styles.total, styles.wantText]}>{`♥ ${totals.want} want`}</Text>
          <Text style={[styles.total, styles.tradeText]}>{`⇄ ${totals.trade} trade`}</Text>
        </View>
        <DropdownSelect label="Show" value={show} options={SHOW} onChange={setShow} testID="lists-show" />
      </View>

      <View style={styles.shareRow} testID="lists-share">
        <View style={styles.shareText}>
          <ThemedText type="smallBold">Show my lists on my profile</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Other collectors see your Want and Trade lists. Off by default.
          </ThemedText>
        </View>
        <Switch value={share.on} onValueChange={share.set} disabled={share.busy} accessibilityLabel="Show my lists on my profile" />
      </View>

      <View style={styles.head}>
        <Text style={[styles.th, styles.cardCol]}>Card</Text>
        <Text style={styles.th}>Owned</Text>
        <Text style={styles.th}>Want</Text>
        <Text style={styles.th}>Trade</Text>
      </View>
      {!lists.ready || copies === undefined ? (
        <ThemedText type="small" themeColor="textSecondary">Loading your lists...</ThemedText>
      ) : shown.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          {show === 'want'
            ? 'Nothing on your Want list yet. In a binder, tap a card’s corner circle once, or use "Mark every card I don’t own as WANT" in the binder’s settings.'
            : show === 'trade'
              ? 'Nothing marked for trade yet. Tap an owned card’s green check in a binder, or open a card below and switch on "For trade".'
              : 'No cards yet. Mark cards as owned or wanted in a binder.'}
        </ThemedText>
      ) : (
        shown.map((r) => {
          const card = resolveCardWith(catalog, r.cardId);
          const isOpen = open === r.cardId;
          return (
            <View key={r.cardId} style={styles.rowWrap} testID={`lists-row-${r.cardId}`}>
              <Pressable
                onPress={() => setOpen(isOpen ? null : r.cardId)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${card?.name ?? r.cardId}: ${r.owned} owned, ${r.want} wanted, ${r.trade} for trade`}
                style={styles.row}>
                <View style={[styles.cardCol, styles.cardCell]}>
                  <Image source={{ uri: cardThumbUrl(r.cardId, 245) || undefined }} style={styles.thumb} contentFit="contain" />
                  <View style={styles.cardText}>
                    <Text style={styles.name} numberOfLines={1}>{card?.name ?? r.cardId}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{card?.setName ?? ''}</Text>
                  </View>
                </View>
                <Text style={styles.td}>{r.owned || ''}</Text>
                <Text style={[styles.td, styles.wantText]}>{r.want ? `♥ ${r.want}` : ''}</Text>
                <Text style={[styles.td, styles.tradeText]}>{r.trade ? `⇄ ${r.trade}` : ''}</Text>
              </Pressable>
              {isOpen ? <RowDetail row={r} /> : null}
            </View>
          );
        })
      )}
    </PageShell>
  );
}

/** One card, opened: its want quantity, and every copy with its own "For trade" switch. */
function RowDetail({ row }: { row: TableRow }) {
  const lists = useCollectionLists();
  const [err, setErr] = useState<string | null>(null);
  const run = (p: Promise<void>) => p.then(() => setErr(null)).catch((e) => setErr(e instanceof Error ? e.message : 'That did not save'));
  return (
    <View style={styles.detail}>
      <View style={styles.wantLine}>
        <ThemedText type="smallBold">Want</ThemedText>
        <Pressable onPress={() => run(lists.setWantQuantity(row.cardId, row.want - 1))} disabled={row.want === 0} accessibilityRole="button" accessibilityLabel="Want one fewer" style={styles.step}>
          <Text style={styles.stepText}>-</Text>
        </Pressable>
        <Text style={[styles.qty, styles.wantText]}>{row.want}</Text>
        <Pressable onPress={() => run(lists.setWantQuantity(row.cardId, Math.min(99, row.want + 1)))} accessibilityRole="button" accessibilityLabel="Want one more" style={styles.step}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
      {row.copies.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">You don&apos;t own a copy yet.</ThemedText>
      ) : (
        row.copies.map((c) => (
          <View key={c.entryId} style={styles.copy} testID={`lists-copy-${c.entryId}`}>
            <View style={styles.copyText}>
              <ThemedText type="small">{`${c.quantity > 1 ? `${c.quantity} x ` : ''}${c.variant}${c.hasScan ? ', scanned' : ''}`}</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">For trade</ThemedText>
            <Switch
              value={c.trade > 0}
              onValueChange={(on) => run(on ? lists.markTrade(c.entryId, c.quantity) : lists.unmarkTrade([c.entryId]))}
              accessibilityLabel={`For trade: ${c.variant}`}
            />
          </View>
        ))
      )}
      {err ? <ThemedText type="small" style={styles.err}>{err}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, marginBottom: Spacing.two },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  total: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink },
  wantText: { color: '#2f7fc1' },
  tradeText: { color: '#b07400' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, marginBottom: Spacing.two, minHeight: 44 },
  shareText: { flex: 1, minWidth: 0, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderColor: Palette.hairline },
  th: { width: 64, textAlign: 'center', fontSize: 13, fontWeight: Weight.bold, color: Palette.muted },
  cardCol: { flex: 1, minWidth: 0, textAlign: 'left' },
  rowWrap: { borderBottomWidth: 1, borderColor: Palette.hairline },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 4 },
  cardCell: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  thumb: { width: 34, height: 47, borderRadius: 3 },
  cardText: { flex: 1, minWidth: 0 },
  name: { fontSize: FontSize.label, fontWeight: Weight.semibold, color: Palette.ink },
  sub: { fontSize: 13, color: Palette.muted },
  td: { width: 64, textAlign: 'center', fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink },
  detail: { paddingLeft: 42, paddingBottom: Spacing.two, gap: 4 },
  wantLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.hairline },
  stepText: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  qty: { minWidth: 24, textAlign: 'center', fontSize: FontSize.label, fontWeight: Weight.bold },
  copy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  copyText: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: Spacing.three },
  err: { color: '#c0392b' },
});
