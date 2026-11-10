/**
 * THE SET AS A CHECKLIST BINDER (MIC-017 piece 12, the sweep's "checklist" option). A complete or
 * master set laid out in number order, nine to a page; the cards you own show their picture, the
 * ones you are missing show their number, name and price, the way the gaps in a real master-set
 * binder are labelled. Above it: how much of the set you have, and what the rest would cost.
 *
 * Behind the 'setbinders-build' dev flag. Read-only: it builds nothing, the page's Make binder
 * still does that.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CatalogCard } from 'tcgscan-browse';

import { FontSize, Palette, Radius, Weight } from '@/constants/theme';
import type { CollectorPocket } from '@/data/collectorBinders';
import { cardThumbUrl } from '@/lib/catalogConfig';
import { formatUsd } from '@/lib/prices';

const PAGES_SHOWN = 4;

export function SetBuildView({
  pockets,
  cardOf,
  owned,
  priceOf,
  width,
}: {
  pockets: readonly CollectorPocket[];
  cardOf: (id: string) => CatalogCard | undefined;
  /** The signed-in collector's cards; null when nobody is signed in (everything reads missing). */
  owned: ReadonlySet<string> | null;
  /** Market price in dollars, or undefined when unknown. */
  priceOf: (id: string) => number | undefined;
  width: number;
}) {
  const [allPages, setAllPages] = useState(false);
  const have = owned ? pockets.filter((p) => owned.has(p.cardId)).length : 0;
  const missing = pockets.filter((p) => !owned?.has(p.cardId));
  const priced = missing.map((p) => priceOf(p.cardId)).filter((v): v is number => typeof v === 'number' && v > 0);
  const toFinish = priced.reduce((a, b) => a + b, 0);
  const pct = pockets.length ? Math.round((have / pockets.length) * 100) : 0;

  const pageW = Math.min(width, 380);
  const cell = Math.floor((pageW - 2 * 8 - 2 * 5) / 3);
  const pages: CollectorPocket[][] = [];
  for (let i = 0; i < pockets.length; i += 9) pages.push(pockets.slice(i, i + 9));
  const shown = allPages ? pages : pages.slice(0, PAGES_SHOWN);

  return (
    <View style={styles.wrap} testID="set-build">
      <View style={styles.meter}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.meterText} testID="set-build-summary">
          {owned ? `You have ${have} of ${pockets.length} (${pct}%)` : `${pockets.length} cards in the set`}
          {missing.length ? ` · ${formatUsd(toFinish)} to finish` : ' · complete'}
          {missing.length && priced.length < missing.length ? ` (${missing.length - priced.length} unpriced)` : ''}
        </Text>
      </View>
      <View style={styles.pages}>
        {shown.map((pg, n) => (
          <View key={n} style={[styles.page, { width: pageW }]}>
            {[0, 1, 2].map((r) =>
              pg.slice(r * 3, r * 3 + 3).length ? (
                <View key={r} style={styles.row}>
                  {pg.slice(r * 3, r * 3 + 3).map((p, k) => {
                    const c = cardOf(p.cardId);
                    const own = !!owned?.has(p.cardId);
                    const price = priceOf(p.cardId);
                    return (
                      <View key={`${p.cardId}-${k}`} style={[styles.pocket, { width: cell, height: Math.round(cell * 1.396) }, !own && styles.pocketMissing]}>
                        {own ? (
                          <Image source={{ uri: cardThumbUrl(p.cardId, 245) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        ) : (
                          <View style={styles.label}>
                            <Text style={styles.num}>#{c?.number?.split('/')[0] || '?'}</Text>
                            <Text style={styles.name} numberOfLines={2}>
                              {c?.name ?? 'Card'}
                              {p.finish ? ' (reverse)' : ''}
                            </Text>
                            {typeof price === 'number' && price > 0 ? <Text style={styles.price}>{formatUsd(price)}</Text> : null}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : null,
            )}
            <Text style={styles.pageLabel}>
              Page {n + 1} · {pg.length ? `${n * 9 + 1}-${n * 9 + pg.length}` : ''}
            </Text>
          </View>
        ))}
      </View>
      {pages.length > PAGES_SHOWN ? (
        <Pressable onPress={() => setAllPages((v) => !v)} accessibilityRole="button" style={styles.more} testID="set-build-more">
          <Text style={styles.moreText}>{allPages ? 'Show fewer pages' : `Show all ${pages.length} pages`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, marginTop: 10 },
  meter: { gap: 6 },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: Palette.hairline, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Palette.accent },
  meterText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  pages: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  page: { padding: 8, gap: 5, borderRadius: 10, borderWidth: 1, borderColor: Palette.hairline, backgroundColor: Palette.panel },
  row: { flexDirection: 'row', gap: 5 },
  pocket: { borderRadius: 5, overflow: 'hidden', backgroundColor: Palette.hairline },
  pocketMissing: { borderWidth: 1, borderStyle: 'dashed', borderColor: Palette.hairlineStrong, backgroundColor: 'transparent' },
  label: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 4, gap: 2 },
  num: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: Palette.ink },
  name: { fontSize: 11, color: Palette.muted, textAlign: 'center' },
  price: { fontSize: 11, fontWeight: Weight.semibold, color: Palette.accent },
  pageLabel: { fontSize: 11, color: Palette.muted, textAlign: 'center' },
  more: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong },
  moreText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
});
