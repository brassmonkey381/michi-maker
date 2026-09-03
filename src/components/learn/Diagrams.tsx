/**
 * PICTURES FOR THE THINGS WORDS DO BADLY.
 *
 * Every guide used to be a column of paragraphs: "open the studio, load a picture, frame it, fold
 * a pair, save slices". These are the same steps drawn — a page with the pocket you tap ringed, a
 * picture cut into nine, a card with its true size marked — built from plain views so they render
 * anywhere, take no assets, and follow the theme. Each one is a small scene, not a screenshot: it
 * shows the idea, and the demo clip beside it shows the real screen.
 *
 * `LayoutDiagram` is the same idea for The michi method: each of Michi's page styles as a colour
 * study on a 3×3, so the list of layouts reads as eight pages rather than eight sentences.
 */
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import type { MichiLayoutStyle } from '@/types/domain';

// ---------------------------------------------------------------------------------------------
// The palette of the scenes: a mat, pockets, and a handful of card "inks" that read as card art
// without being any card. Fixed colours on purpose — a page is a page in either theme.
const MAT = '#EDE6D6';
const POCKET = '#DDD4C0';
const INK = {
  hero: '#C8541E',
  ember: '#E08A3C',
  gold: '#D9B24A',
  leaf: '#6E9F58',
  sea: '#4C8FBF',
  violet: '#8C6CB8',
  rose: '#D06A8E',
  slate: '#7A8590',
  night: '#3E4A5A',
  art: '#B9A2D8',
};
const RING = Palette.accent;

// ---------------------------------------------------------------------------------------------
/** A pocket's look in a scene. */
export type Cell =
  | { fill?: string; label?: string; ring?: boolean; dashed?: boolean; span?: [number, number] }
  | null;

/**
 * A page drawn small: `rows`×`cols` pockets on a mat, each optionally coloured, ringed (the one
 * you tap), dashed (a cut line) or labelled. `cells` is row-major; missing entries are empty.
 */
export function PocketGrid({
  rows,
  cols,
  cells = [],
  width = 150,
  children,
}: {
  rows: number;
  cols: number;
  cells?: Cell[];
  width?: number;
  children?: ReactNode;
}) {
  const pad = 8;
  const gap = 4;
  const cw = (width - pad * 2 - gap * (cols - 1)) / cols;
  const ch = cw * (88 / 63);
  const height = pad * 2 + ch * rows + gap * (rows - 1);
  const spanned = new Set<number>();
  cells.forEach((c, i) => {
    if (c?.span) {
      const r0 = Math.floor(i / cols);
      const c0 = i % cols;
      for (let r = r0; r < r0 + c.span[0]; r++) for (let cc = c0; cc < c0 + c.span[1]; cc++) if (r !== r0 || cc !== c0) spanned.add(r * cols + cc);
    }
  });
  return (
    <View style={[styles.mat, { width, height, padding: pad }]}>
      {Array.from({ length: rows * cols }).map((_, i) => {
        if (spanned.has(i)) return null;
        const r = Math.floor(i / cols);
        const c = i % cols;
        const cell = cells[i] ?? null;
        const rs = cell?.span?.[0] ?? 1;
        const cs = cell?.span?.[1] ?? 1;
        const box: ViewStyle = {
          position: 'absolute',
          left: pad + c * (cw + gap),
          top: pad + r * (ch + gap),
          width: cs * cw + (cs - 1) * gap,
          height: rs * ch + (rs - 1) * gap,
        };
        return (
          <View
            key={i}
            style={[
              styles.pocket,
              box,
              cell?.fill ? { backgroundColor: cell.fill } : null,
              cell?.ring ? styles.ring : null,
              cell?.dashed ? styles.dashed : null,
            ]}>
            {cell?.label ? <Text style={styles.cellLabel}>{cell.label}</Text> : null}
          </View>
        );
      })}
      {children}
    </View>
  );
}

const fillAll = (n: number, fill: string): Cell[] => Array.from({ length: n }, () => ({ fill }));

// ---------------------------------------------------------------------------------------------
/** The four real page sizes, side by side, so "3×4 is a 3×3 with one more column" is visible. */
export function ShapesDiagram() {
  const shapes: [number, number][] = [
    [2, 2],
    [3, 3],
    [3, 4],
    [4, 4],
  ];
  return (
    <View style={styles.row}>
      {shapes.map(([r, c]) => (
        <View key={`${r}x${c}`} style={styles.labelled}>
          <PocketGrid rows={r} cols={c} width={c === 4 ? 104 : 84} cells={fillAll(r * c, POCKET)} />
          <ThemedText type="small" themeColor="textSecondary">
            {r}×{c}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** Tap a pocket: the ringed one is the one you press; the picker fills it. */
export function FillPocketDiagram() {
  const cells: Cell[] = [
    { fill: INK.leaf },
    { fill: INK.sea },
    { fill: INK.ember },
    { fill: INK.gold },
    { ring: true, label: 'tap' },
    null,
    null,
    null,
    null,
  ];
  return (
    <View style={styles.row}>
      <PocketGrid rows={3} cols={3} cells={cells} />
      <Text style={styles.arrow}>→</Text>
      <PocketGrid
        rows={3}
        cols={3}
        cells={[{ fill: INK.leaf }, { fill: INK.sea }, { fill: INK.ember }, { fill: INK.gold }, { fill: INK.hero, ring: true }, null, null, null, null]}
      />
    </View>
  );
}

/** Drag a card to another pocket, or across the gutter to the facing page. */
export function ArrangeDiagram() {
  return (
    <View style={styles.row}>
      <PocketGrid rows={3} cols={3} cells={[{ fill: INK.sea }, { fill: INK.hero, ring: true }, { fill: INK.gold }, null, null, null, null, null, null]} />
      <Text style={styles.arrow}>⇢</Text>
      <PocketGrid rows={3} cols={3} cells={[{ fill: INK.sea }, null, { fill: INK.gold }, null, { fill: INK.hero, ring: true }, null, null, null, null]} />
    </View>
  );
}

/** Page 1 alone, then 2 and 3 facing: a binder is read in spreads. */
export function SpreadDiagram() {
  return (
    <View style={styles.row}>
      <View style={styles.labelled}>
        <View style={styles.spread}>
          <View style={[styles.blankHalf, { width: 84 }]} />
          <PocketGrid rows={3} cols={3} width={84} cells={fillAll(9, INK.slate)} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          page 1
        </ThemedText>
      </View>
      <View style={styles.labelled}>
        <View style={styles.spread}>
          <PocketGrid rows={3} cols={3} width={84} cells={fillAll(9, INK.sea)} />
          <PocketGrid rows={3} cols={3} width={84} cells={fillAll(9, INK.sea)} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          pages 2 · 3
        </ThemedText>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
/** One picture, cut into pockets: each pocket shows its window of the same image. */
export function SliceDiagram({ src, rows = 3, cols = 3, width = 180 }: { src: string; rows?: number; cols?: number; width?: number }) {
  const pad = 8;
  const gap = 5;
  const cw = (width - pad * 2 - gap * (cols - 1)) / cols;
  const ch = cw * (88 / 63);
  const imgW = cw * cols + gap * (cols - 1);
  const imgH = ch * rows + gap * (rows - 1);
  return (
    <View style={styles.row}>
      <View style={[styles.whole, { width: imgW * 0.6, height: imgH * 0.6 }]}>
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="one picture" />
      </View>
      <Text style={styles.arrow}>→</Text>
      <View style={[styles.mat, { width, height: imgH + pad * 2, padding: pad }]}>
        {Array.from({ length: rows * cols }).map((_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          return (
            <View
              key={i}
              style={[styles.pocket, styles.window, { position: 'absolute', left: pad + c * (cw + gap), top: pad + r * (ch + gap), width: cw, height: ch }]}>
              <Image
                source={{ uri: src }}
                contentFit="cover"
                style={{ position: 'absolute', width: imgW, height: imgH, left: -c * (cw + gap), top: -r * (ch + gap) }}
                accessibilityLabel=""
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Two sideways pockets that open on the same inside edge take one folded piece. */
export function FoldDiagram() {
  return (
    <View style={styles.row}>
      <PocketGrid rows={3} cols={3} cells={[null, null, null, { fill: INK.art, span: [1, 2], label: 'one piece' }, null, null, null, null, null]}>
        <View style={styles.foldLine} />
      </PocketGrid>
      <View style={styles.legend}>
        <ThemedText type="small" themeColor="textSecondary">
          — — fold
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          sideways pairs only, never up and down
        </ThemedText>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
/** A card at its real size, with the two settings that keep it real. */
export function TrueSizeDiagram() {
  return (
    <View style={styles.row}>
      <View style={styles.dim}>
        <View style={styles.dimTop}>
          <Text style={styles.dimText}>2.5″ · 63 mm</Text>
        </View>
        <View style={styles.dimRow}>
          <View style={styles.card} />
          <Text style={[styles.dimText, styles.dimSide]}>3.5″ · 88 mm</Text>
        </View>
      </View>
      <View style={styles.legend}>
        <Text style={styles.pillGood}>✓ Actual size · 100%</Text>
        <Text style={styles.pillBad}>✗ Fit to page</Text>
        <Text style={styles.pillBad}>✗ Borderless</Text>
      </View>
    </View>
  );
}

/** Two files, two papers. */
export function PaperDiagram() {
  return (
    <View style={styles.row}>
      <View style={styles.paperCard}>
        <View style={[styles.paperSwatch, { backgroundColor: '#FBFAF6' }]} />
        <Text style={styles.paperTitle}>Placeholders</Text>
        <Text style={styles.paperSub}>plain copy paper</Text>
        <Text style={styles.paperSub}>swapped out as cards arrive</Text>
      </View>
      <View style={styles.paperCard}>
        <View style={[styles.paperSwatch, { backgroundColor: '#E9E4DA', borderWidth: 2, borderColor: '#D5CDBD' }]} />
        <Text style={styles.paperTitle}>Art</Text>
        <Text style={styles.paperSub}>matte cardstock · 250–300 gsm</Text>
        <Text style={styles.paperSub}>stays in the binder for good</Text>
      </View>
    </View>
  );
}

/** Each printed piece carries its address: page, row, column. */
export function CutDiagram() {
  const cells: Cell[] = ['p3 · r1 c1', 'p3 · r1 c2', 'p3 · r1 c3', 'p3 · r2 c1', 'p3 · r2 c2', 'p3 · r2 c3'].map((label) => ({ label, dashed: true, fill: '#FBFAF6' }));
  return <PocketGrid rows={2} cols={3} width={210} cells={cells} />;
}

// ---------------------------------------------------------------------------------------------
/** One seed card, and the page that grows around it. */
export function SeedDiagram() {
  return (
    <View style={styles.row}>
      <PocketGrid rows={3} cols={3} cells={[null, null, null, null, { fill: INK.hero, ring: true, label: 'seed' }, null, null, null, null]} />
      <Text style={styles.arrow}>✨</Text>
      <PocketGrid
        rows={3}
        cols={3}
        cells={[{ fill: INK.ember }, { fill: INK.gold }, { fill: INK.ember }, { fill: INK.rose }, { fill: INK.hero, ring: true }, { fill: INK.rose }, { fill: INK.ember }, { fill: INK.gold }, { fill: INK.ember }]}
      />
    </View>
  );
}

/** Eight evolutions, eight pockets: one of each, never eight of one. */
export function OneOfEachDiagram() {
  const eevee = [INK.slate, INK.sea, INK.ember, INK.gold, INK.violet, INK.night, INK.leaf, INK.rose];
  const cells: Cell[] = eevee.slice(0, 4).map((fill) => ({ fill }));
  cells.push({ fill: '#B98B5B', ring: true });
  cells.push(...eevee.slice(4).map((fill) => ({ fill })));
  return <PocketGrid rows={3} cols={3} cells={cells} />;
}

/** Rows of a list become a page. */
export function CsvToBinderDiagram() {
  return (
    <View style={styles.row}>
      <View style={styles.csv}>
        {['Umbreon ex', 'Sylveon ex', 'Leafeon ex', 'Espeon ex', 'Glaceon ex', '…'].map((n) => (
          <Text key={n} style={styles.csvRow}>
            {n}
          </Text>
        ))}
      </View>
      <Text style={styles.arrow}>→</Text>
      <PocketGrid rows={3} cols={3} cells={[INK.night, INK.rose, INK.leaf, INK.violet, INK.sea, INK.ember, INK.gold, INK.slate, INK.hero].map((fill) => ({ fill }))} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
/** Michi's page styles, each as a colour study on a 3×3. */
export function LayoutDiagram({ style, width = 120 }: { style: MichiLayoutStyle; width?: number }) {
  const cells = LAYOUT_CELLS[style] ?? [];
  return <PocketGrid rows={3} cols={3} width={width} cells={cells} />;
}

const LAYOUT_CELLS: Record<MichiLayoutStyle, Cell[]> = {
  anchor: [
    { fill: INK.ember },
    { fill: INK.gold },
    { fill: INK.ember },
    { fill: INK.gold },
    { fill: INK.hero, ring: true },
    { fill: INK.gold },
    { fill: INK.ember },
    { fill: INK.gold },
    { fill: INK.ember },
  ],
  single_pokemon: ['#F2C14E', '#E9B23A', '#F5CF6B', '#D9A02E', '#F0BE45', '#E5AD30', '#F7D67A', '#DFA838', '#EEBB4A'].map((fill) => ({ fill })),
  themed_story: ['#8A7A6A', '#9B7A5A', '#B07A48', '#C4813A', '#D08A2E', '#DC9A2A', '#E6AD2E', '#EFC13A', '#F6D44A'].map((fill) => ({ fill })),
  artist: [INK.sea, INK.rose, INK.leaf, INK.violet, { fill: INK.gold, label: '✎' }, INK.ember, INK.slate, INK.hero, INK.night].map((c) => (typeof c === 'string' ? { fill: c } : c)),
  trainer: [
    { fill: INK.sea },
    { fill: INK.night, ring: true, span: [2, 1] },
    { fill: INK.sea },
    { fill: INK.leaf },
    { fill: INK.leaf },
    { fill: INK.gold },
    { fill: INK.sea },
    { fill: INK.gold },
  ],
  full_page_spread: [{ fill: INK.art, span: [3, 3], label: 'art' }, null, null, null, null, null, null, null, null],
  color_theme: ['#5B8DD6', '#4C7FC7', '#6C9BE0', '#3F70B8', '#7FA8E6', '#5586CE', '#4A7BC2', '#6E9DDD', '#4575BD'].map((fill) => ({ fill })),
  freeform: [{ fill: INK.hero }, null, { fill: INK.art, span: [2, 1] }, { fill: INK.leaf }, { fill: INK.gold }, null, { fill: INK.sea }, null],
};

// Freeform above: the [2,1] span at index 2 covers index 5, so only eight entries are listed and
// the ninth pocket is simply empty. `full_page_spread` covers everything with one piece.

// ---------------------------------------------------------------------------------------------
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three },
  labelled: { alignItems: 'center', gap: 4 },
  mat: { backgroundColor: MAT, borderRadius: 8, position: 'relative' },
  pocket: { backgroundColor: POCKET, borderRadius: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  window: { backgroundColor: '#000' },
  ring: { borderWidth: 2.5, borderColor: RING },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#9A8E78' },
  cellLabel: { fontSize: 9, fontWeight: Weight.semibold, color: '#3E3A33', textAlign: 'center', paddingHorizontal: 2 },
  arrow: { fontSize: 22, color: Palette.ink2 },
  spread: { flexDirection: 'row', gap: 3 },
  blankHalf: { backgroundColor: 'transparent', borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: Palette.hairlineStrong },
  whole: { borderRadius: 6, overflow: 'hidden' },
  foldLine: { position: 'absolute', left: 8 + 42 + 2, top: 8 + 60 + 4 - 2, width: 0, height: 60, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: '#3E3A33' },
  legend: { gap: 6, maxWidth: 200 },
  dim: { alignItems: 'center', gap: 4 },
  dimTop: { alignItems: 'center' },
  dimRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  card: { width: 63, height: 88, borderRadius: 4, backgroundColor: '#FBFAF6', borderWidth: 1, borderColor: '#B8AE9A' },
  dimText: { fontSize: FontSize.label, color: Palette.ink2 },
  dimSide: { width: 70 },
  pillGood: { fontSize: FontSize.label, color: '#2F7A3E', fontWeight: Weight.semibold },
  pillBad: { fontSize: FontSize.label, color: '#A4432D' },
  paperCard: { width: 168, padding: Spacing.three, borderRadius: Radius.control, backgroundColor: MAT, gap: 2 },
  paperSwatch: { height: 44, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#D5CDBD' },
  paperTitle: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: '#3E3A33' },
  paperSub: { fontSize: FontSize.label, color: '#6B6459' },
  csv: { width: 130, padding: Spacing.three, borderRadius: Radius.control, backgroundColor: Palette.panel, gap: 3 },
  csvRow: { fontSize: 11, color: Palette.ink2 },
});
