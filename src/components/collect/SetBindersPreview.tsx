/**
 * SET BINDERS, STEPS + LIVE PREVIEW (MIC-045 M4, the 'setbinders-preview' dev flag). The pieces
 * the /collect page lays out when the flag is on: numbered step headings, the game chips, the
 * binder kinds as small pocket-grid pictures, and the preview panel on the right, which draws the
 * pockets the page has already worked out as a two-page checklist spread (number, name, market
 * price), the completion bar and the price to finish. It builds on the 'setbinders-build'
 * checklist view (SetBuildView): same reading of owned and missing, same price to finish.
 *
 * Presentational only. The page owns every choice, the result and the build.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CatalogCard } from 'tcgscan-browse';

import { FontSize, Fonts, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { CollectorKind, CollectorPocket } from '@/data/collectorBinders';
import { cardThumbUrl } from '@/lib/catalogConfig';
import { formatUsd } from '@/lib/prices';

/** A numbered step heading: "1 GAME". */
export function StepHead({ n, children }: { n: number; children: string }) {
  return (
    <View style={styles.stepHead} accessibilityRole="header">
      <Text style={styles.stepNum}>{n}</Text>
      <Text style={styles.stepText}>{children.toUpperCase()}</Text>
    </View>
  );
}

/** The game row as chips, the chosen one dark. */
export function GameChips<T extends string>({ options, value, onChange }: { options: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <View style={styles.chips} testID="collect-games">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]} testID={`collect-game-${o.id}`}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pocket colours for the kind pictures: f a card, g a second print, r a family, e an empty pocket. */
const TILE_COLORS = { f: '#7aa6f7', g: '#f2c94c', r: '#e58aa0' } as const;
const TILE_PATTERNS: Record<CollectorKind, string> = {
  complete: 'fffffffff',
  master: 'fgfgfgfgf',
  species: 'gggggg...',
  line: 'rrr......',
  dex: 'frgfrgfrg',
  character: 'gggggg...',
  everything: 'frgfrgfrg',
};

/** A 3×3 pocket grid drawn in colour: the kind's picture. */
function PocketGlyph({ kind }: { kind: CollectorKind }) {
  const cells = TILE_PATTERNS[kind].split('');
  return (
    <View style={styles.glyph}>
      {cells.map((c, i) => (
        <View key={i} style={[styles.glyphCell, { backgroundColor: c in TILE_COLORS ? TILE_COLORS[c as keyof typeof TILE_COLORS] : Palette.hairline }]} />
      ))}
    </View>
  );
}

/** The binder kinds as picture tiles. */
export function KindTiles({ options, value, onChange, tileWidth }: {
  options: readonly { id: CollectorKind; label: string; blurb: string }[];
  value: CollectorKind;
  onChange: (id: CollectorKind) => void;
  tileWidth: number;
}) {
  return (
    <View style={styles.tiles} testID="collect-kinds">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${o.label}: ${o.blurb}`}
            style={[styles.tile, { width: tileWidth }, on && styles.tileOn]}
            testID={`collect-kind-${o.id}`}>
            <PocketGlyph kind={o.id} />
            <Text style={styles.tileText} numberOfLines={2}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "001" for a plain short number, the number as printed otherwise ("TG01", "SV-P 12"). */
function pocketNumber(card: CatalogCard | undefined): string {
  const n = card?.number?.split('/')[0]?.trim() ?? '';
  if (!n) return '?';
  // "OP01-001", "ST10-005": the set code is already in the panel's title, so the pocket shows 001.
  const coded = /^[A-Z]{1,5}\d{1,3}-(\d{1,4}[A-Za-z]?)$/.exec(n);
  if (coded) return coded[1];
  return /^\d{1,2}$/.test(n) ? n.padStart(3, '0') : n;
}

export function SetPreviewPanel({
  title,
  meta,
  pockets,
  shape,
  cardOf,
  owned,
  priceOf,
  width,
  empty,
  busy,
}: {
  title: string;
  meta: string;
  /** The pockets in build order, or null when nothing is picked yet. */
  pockets: readonly CollectorPocket[] | null;
  shape: { rows: number; cols: number };
  cardOf: (id: string) => CatalogCard | undefined;
  /** The signed-in collector's cards; null when nobody is signed in (everything reads missing). */
  owned: ReadonlySet<string> | null;
  /** Market price in dollars, or undefined when unknown. */
  priceOf: (id: string) => number | undefined;
  /** The panel's own width, measured by the page. */
  width: number;
  /** What the panel says while there is nothing to draw. */
  empty: string;
  busy: boolean;
}) {
  const perPage = shape.rows * shape.cols;
  const list = pockets ?? [];
  const pageCount = Math.ceil(list.length / perPage);
  const inner = Math.max(200, width - 2 * PANEL_PAD);
  const spreadOf = inner >= 520 ? 2 : 1;
  // A new result starts the spread at page one: the page held is tied to the result it was turned on.
  const [held, setHeld] = useState<{ of: readonly CollectorPocket[] | null; first: number }>({ of: pockets, first: 0 });
  const first = held.of === pockets && held.first < pageCount ? held.first : 0;
  const setFirst = (f: (cur: number) => number) => setHeld({ of: pockets, first: f(first) });
  const shown = Array.from({ length: Math.min(spreadOf, Math.max(0, pageCount - first)) }, (_, k) => list.slice((first + k) * perPage, (first + k + 1) * perPage));

  const have = owned ? list.filter((p) => owned.has(p.cardId)).length : 0;
  const missing = list.filter((p) => !owned?.has(p.cardId));
  const toFinish = missing.reduce((sum, p) => {
    const v = priceOf(p.cardId);
    return typeof v === 'number' && v > 0 ? sum + v : sum;
  }, 0);
  const pct = list.length ? Math.round((have / list.length) * 100) : 0;

  const gap = 14;
  const pageW = Math.min(300, Math.floor((inner - gap * (spreadOf - 1)) / spreadOf));
  const cellGap = 6;
  const cell = Math.floor((pageW - 2 * 8 - cellGap * (shape.cols - 1)) / shape.cols);
  const cellH = Math.round(cell * 1.396);
  const last = Math.min(pageCount, first + spreadOf);

  return (
    <View style={styles.panel} testID="collect-preview">
      <View style={styles.headRow}>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
        <View style={styles.live}><Text style={styles.liveText}>● LIVE PREVIEW</Text></View>
      </View>

      {pockets && list.length ? (
        <>
          <View style={styles.bar} testID="collect-preview-bar">
            <Text style={styles.barText}>{`${have} of ${list.length}`}</Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
            {missing.length && toFinish > 0 ? (
              <Text style={styles.barText}><Text style={styles.barStrong}>{formatUsd(toFinish)}</Text> to finish (market)</Text>
            ) : !missing.length ? <Text style={styles.barStrong}>Complete</Text> : null}
          </View>
          <View style={styles.spread}>
            {shown.map((pg, k) => (
              <View key={first + k} style={[styles.page, { width: pageW }]}>
                {pg.map((p, i) => {
                  const c = cardOf(p.cardId);
                  const own = !!owned?.has(p.cardId);
                  const price = priceOf(p.cardId);
                  return (
                    <View key={`${p.cardId}-${i}`} style={[styles.pocket, { width: cell, height: cellH }, own && styles.pocketOwned]}>
                      {own ? (
                        <Image source={{ uri: cardThumbUrl(p.cardId, 245) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      ) : (
                        <>
                          <Text style={[styles.num, cell < 70 && styles.numSmall]} numberOfLines={1}>{pocketNumber(c)}</Text>
                          <Text style={styles.name} numberOfLines={cell < 70 ? 2 : 3}>{`${c?.name ?? 'Card'}${p.finish ? ' (reverse)' : ''}`}</Text>
                          <Text style={styles.price} numberOfLines={1}>{typeof price === 'number' && price > 0 ? formatUsd(price) : ' '}</Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          <View style={styles.foot}>
            <View style={styles.pager}>
              <Text style={styles.footText}>{last - first > 1 ? `Pages ${first + 1}-${last} of ${pageCount}` : `Page ${first + 1} of ${pageCount}`}</Text>
              <Pressable onPress={() => setFirst((f) => Math.max(0, f - spreadOf))} disabled={first === 0} accessibilityRole="button" accessibilityLabel="Previous pages" hitSlop={8} style={[styles.arrow, first === 0 && styles.arrowOff]} testID="collect-preview-prev">
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>
              <Pressable onPress={() => setFirst((f) => (f + spreadOf < pageCount ? f + spreadOf : f))} disabled={last >= pageCount} accessibilityRole="button" accessibilityLabel="Next pages" hitSlop={8} style={[styles.arrow, last >= pageCount && styles.arrowOff]} testID="collect-preview-next">
                <Text style={styles.arrowText}>›</Text>
              </Pressable>
            </View>
            <Text style={[styles.footText, styles.footNote]}>
              After you build: tick what you own, the bar fills, <Text style={styles.footStrong}>the gaps print as fill sheets.</Text>
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{busy ? 'Loading…' : empty}</Text>
        </View>
      )}
    </View>
  );
}

const PANEL_PAD = 22;

const styles = StyleSheet.create({
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.two },
  stepNum: { fontSize: FontSize.base, fontWeight: Weight.bold, color: Palette.accent },
  stepText: { fontSize: FontSize.base, fontWeight: Weight.bold, letterSpacing: 1.2, color: Palette.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Palette.panel },
  chipOn: { backgroundColor: Palette.ink },
  chipText: { fontSize: FontSize.label, fontWeight: Weight.medium, color: Palette.ink },
  chipTextOn: { color: Palette.surface, fontWeight: Weight.semibold },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { borderWidth: 1, borderColor: Palette.hairlineStrong, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', backgroundColor: Palette.surface },
  tileOn: { borderWidth: 2, borderColor: Palette.accent, backgroundColor: Palette.accentSoft, paddingVertical: 7, paddingHorizontal: 5 },
  tileText: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink, textAlign: 'center', lineHeight: 14 },
  glyph: { width: 42, flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginBottom: 6 },
  glyphCell: { width: 12.6, height: 14, borderRadius: 2 },
  panel: { backgroundColor: Palette.panel, borderRadius: 16, borderWidth: 1, borderColor: Palette.hairline, padding: PANEL_PAD, gap: Spacing.three },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.two },
  headText: { flex: 1, gap: 2 },
  title: { fontFamily: Fonts?.brand, fontSize: 24, fontWeight: Weight.bold, color: Palette.ink },
  meta: { fontSize: FontSize.label, color: Palette.muted },
  live: { backgroundColor: Palette.surface, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  liveText: { fontSize: FontSize.sm, fontWeight: Weight.bold, letterSpacing: 0.6, color: Palette.success },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  barText: { fontSize: FontSize.label, color: Palette.ink },
  barStrong: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink },
  track: { flex: 1, minWidth: 80, height: 8, borderRadius: 99, backgroundColor: Palette.hairline, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: Palette.accent },
  spread: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  page: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', gap: 6, padding: 8, borderRadius: 14, backgroundColor: '#fbfaf7', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  pocket: { borderRadius: 7, borderWidth: 1, borderColor: 'rgba(120,116,108,0.2)', backgroundColor: 'rgba(120,116,108,0.05)', paddingVertical: 7, paddingHorizontal: 6, justifyContent: 'space-between', overflow: 'hidden' },
  pocketOwned: { borderWidth: 0, padding: 0 },
  num: { fontSize: 18, fontWeight: Weight.bold, color: '#b9b4aa' },
  numSmall: { fontSize: 13 },
  name: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: '#555', lineHeight: 13 },
  price: { fontSize: FontSize.sm, fontWeight: Weight.bold, color: '#1f8a4c' },
  foot: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  pager: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  arrow: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, backgroundColor: Palette.surface },
  arrowOff: { opacity: 0.35 },
  arrowText: { fontSize: FontSize.md, fontWeight: Weight.bold, color: Palette.ink },
  footText: { fontSize: FontSize.base, color: Palette.muted },
  footNote: { flexShrink: 1 },
  footStrong: { fontWeight: Weight.bold, color: Palette.ink },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  emptyText: { fontSize: FontSize.body, color: Palette.muted, textAlign: 'center', maxWidth: 360 },
});
