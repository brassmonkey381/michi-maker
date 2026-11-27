/**
 * MIC-041: the My lists page, drawn from data handed in (the route loads it). See src/app/lists.tsx.
 *
 * Owner, 2026-11-26: "apply the new list layout to this page". The same card grid as a public
 * profile (layout B, components/people/ListBrowse): totals and the "Show my lists on my profile"
 * switch above one toolbar (search, All / Owned / Want / Trade, Sort, Filters), then the cards, 24
 * at a time. Every tile shows its ✓ owned, ♥ want and ⇄ trade counts. Tapping one opens its sheet
 * with everything the old table row held: the want count (- and +) and each owned copy's
 * "For trade" switch.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Sheet } from 'tcgscan-ui';

import { ListsGrid, useBrowseRows } from '@/components/people/ListBrowse';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { TableRow } from '@/data/collectionLists';
import type { Catalog } from '@/lib/catalog';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';

export interface ListsActions {
  setWantQuantity: (cardId: string, quantity: number) => Promise<void>;
  markTrade: (entryId: string, quantity?: number) => Promise<void>;
  unmarkTrade: (entryIds: string[]) => Promise<void>;
}

export function ListsView({
  rows,
  ready,
  catalog,
  share,
  actions,
  initialOpen = null,
}: {
  rows: TableRow[];
  ready: boolean;
  catalog: Catalog | null;
  share?: { on: boolean; busy: boolean; set: (on: boolean) => void };
  actions?: ListsActions;
  /** A card's sheet open on arrival (review shots). */
  initialOpen?: string | null;
}) {
  const browse = useBrowseRows(rows, catalog);
  const [open, setOpen] = useState<string | null>(initialOpen);
  // The sheet reads the row fresh on every render, so a change made in it shows at once.
  const openRow = open ? browse.find((r) => r.cardId === open) ?? null : null;

  const shareRow = share ? (
    <View style={styles.shareRow} testID="lists-share">
      <View style={styles.shareText}>
        <ThemedText type="smallBold">Show my lists on my profile</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Other collectors see your Want and Trade lists. Off by default.
        </ThemedText>
      </View>
      <Switch value={share.on} onValueChange={share.set} disabled={share.busy} accessibilityLabel="Show my lists on my profile" />
    </View>
  ) : null;

  if (!ready) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Loading your lists...
      </ThemedText>
    );
  }
  if (rows.length === 0) {
    return (
      <View>
        {shareRow}
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          No cards yet. Mark cards as owned or wanted in a binder.
        </ThemedText>
      </View>
    );
  }
  return (
    <View>
      <ListsGrid rows={browse} owner title={null} above={shareRow} onOpen={actions ? (r) => setOpen(r.cardId) : undefined} />
      {actions ? (
        <Sheet visible={!!openRow} title={openRow ? openRow.info.name || openRow.cardId : ''} onClose={() => setOpen(null)}>
          {openRow ? <CardSheet row={openRow} setName={openRow.info.setName} actions={actions} /> : null}
        </Sheet>
      ) : null}
    </View>
  );
}

/** One card, opened: its art, its want quantity, and every copy with its own "For trade" switch. */
function CardSheet({ row, setName, actions: lists }: { row: TableRow; setName: string; actions: ListsActions }) {
  const manifestReady = useImageManifest();
  const [err, setErr] = useState<string | null>(null);
  const run = (p: Promise<void>) => p.then(() => setErr(null)).catch((e) => setErr(e instanceof Error ? e.message : 'That did not save'));
  return (
    <View style={styles.detail} testID={`lists-sheet-${row.cardId}`}>
      <View style={styles.sheetTop}>
        <Image source={{ uri: (manifestReady ? cardThumbUrl(row.cardId, 245) : '') || undefined }} style={styles.sheetArt} contentFit="cover" />
        <View style={styles.sheetFacts}>
          {setName ? <ThemedText type="small" themeColor="textSecondary">{setName}</ThemedText> : null}
          <Text style={[styles.fact, styles.ownedText]}>{`✓ ${row.owned} owned`}</Text>
          <View style={styles.wantLine}>
            <Text style={[styles.fact, styles.wantText]}>♥ Want</Text>
            <Pressable onPress={() => run(lists.setWantQuantity(row.cardId, row.want - 1))} disabled={row.want === 0} accessibilityRole="button" accessibilityLabel="Want one fewer" style={[styles.step, row.want === 0 && styles.stepOff]}>
              <Text style={styles.stepText}>-</Text>
            </Pressable>
            <Text style={[styles.qty, styles.wantText]} testID="lists-want-qty">{row.want}</Text>
            <Pressable onPress={() => run(lists.setWantQuantity(row.cardId, Math.min(99, row.want + 1)))} accessibilityRole="button" accessibilityLabel="Want one more" style={styles.step}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
          <Text style={[styles.fact, styles.tradeText]}>{`⇄ ${row.trade} for trade`}</Text>
        </View>
      </View>
      {row.copies.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">You don&apos;t own a copy yet.</ThemedText>
      ) : (
        <View>
          <ThemedText type="smallBold">Your copies</ThemedText>
          {row.copies.map((c) => (
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
          ))}
        </View>
      )}
      {err ? <ThemedText type="small" style={styles.err}>{err}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one, minHeight: 44 },
  shareText: { flex: 1, minWidth: 0, gap: 2 },
  empty: { paddingVertical: Spacing.three },
  detail: { gap: Spacing.three, paddingVertical: Spacing.two },
  sheetTop: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  sheetArt: { width: 110, height: 154, borderRadius: 6, backgroundColor: Palette.hairline },
  sheetFacts: { flex: 1, minWidth: 0, gap: Spacing.two },
  fact: { fontSize: FontSize.label, fontWeight: Weight.bold },
  ownedText: { color: '#2e7d4f' },
  wantText: { color: '#2f7fc1' },
  tradeText: { color: '#b07400' },
  wantLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.control, borderWidth: 1, borderColor: Palette.hairline },
  stepOff: { opacity: 0.4 },
  stepText: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  qty: { minWidth: 24, textAlign: 'center', fontSize: FontSize.label, fontWeight: Weight.bold },
  copy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
  copyText: { flex: 1, minWidth: 0 },
  err: { color: '#c0392b' },
});
