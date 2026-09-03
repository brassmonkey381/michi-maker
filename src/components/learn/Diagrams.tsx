/**
 * PICTURES FOR THE THINGS WORDS DO BADLY.
 *
 * The guides' drawn scenes: a picture cut into nine, a folded pair, a card at its true size, the
 * editor with the button you press ringed, a search box taken apart. Plain views, no assets, so
 * they render anywhere and never go stale the way a screen recording does. Each is a scene, not a
 * screenshot: it shows the idea and where to press, at the size of a paragraph.
 */
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';

// ---------------------------------------------------------------------------------------------
// The palette of the scenes: a mat, pockets, and a handful of card "inks" that read as card art
// without being any card. Fixed colours on purpose — a page is a page in either theme.
const MAT = '#EDE6D6';
const POCKET = '#DDD4C0';
const PAPER = '#FBFAF6';
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
const CHROME = '#2B2A27';
const CHROME_TEXT = '#D8D2C4';
const RING = Palette.accent;

// ---------------------------------------------------------------------------------------------
/** A pocket's look in a scene. */
export type Cell =
  | { fill?: string; label?: string; ring?: boolean; dashed?: boolean; span?: [number, number]; fold?: boolean }
  | null;

/**
 * A page drawn small: `rows`×`cols` pockets on a mat, each optionally coloured, ringed (the one
 * you tap), dashed (a cut line), folded (a sideways pair with its fold marked) or labelled.
 * `cells` is row-major; missing entries are empty.
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
            {cell?.fold ? <View style={styles.fold} /> : null}
          </View>
        );
      })}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
/** A picture cut into pockets: each pocket shows its own window of the same image. */
export function CutPicture({ src, rows = 3, cols = 3, width = 180, gap = 5, pad = 8 }: { src: string; rows?: number; cols?: number; width?: number; gap?: number; pad?: number }) {
  const cw = (width - pad * 2 - gap * (cols - 1)) / cols;
  const ch = cw * (88 / 63);
  const imgW = cw * cols + gap * (cols - 1);
  const imgH = ch * rows + gap * (rows - 1);
  return (
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
  );
}

/** One picture, then the same picture cut into pockets. */
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
      <CutPicture src={src} rows={rows} cols={cols} width={width} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// HOOKS FOR THE HUB: each guide's subject at the size of a card, so the list of guides reads as
// four pictures of four different things rather than four cards that happen to be nearby.

/** A picture cut into six pockets, card-sized. */
export function SliceHook({ src }: { src: string }) {
  return <CutPicture src={src} rows={3} cols={2} width={HOOK_W} gap={3} pad={5} />;
}

/** A printed sheet, card-sized: placeholders with their cut lines, one folded art piece. */
export function SheetHook() {
  const ph: Cell = { dashed: true, fill: PAPER };
  return <PocketGrid rows={3} cols={2} width={HOOK_W} cells={[ph, ph, { fill: INK.art, span: [1, 2], fold: true }, null, ph, ph]} />;
}

/** A search box with a query in it, card-sized. */
export function QueryHook() {
  return (
    <View style={[styles.hookBox, { width: HOOK_W }]}>
      <View style={styles.hookSearch}>
        <Text style={styles.searchGlyph}>⌕</Text>
      </View>
      <Text style={[styles.hookTerm, termStyle.word]}>arita</Text>
      <Text style={[styles.hookTerm, termStyle.field]}>type:fire</Text>
      <Text style={[styles.hookTerm, termStyle.cmp]}>{'hp>=120'}</Text>
      <Text style={[styles.hookTerm, termStyle.sort]}>sort:value</Text>
    </View>
  );
}

const HOOK_W = 72;

/** Two sideways pockets that open on the same inside edge take one folded piece. */
export function FoldDiagram() {
  return (
    <View style={styles.row}>
      <PocketGrid rows={3} cols={3} cells={[null, null, null, { fill: INK.art, span: [1, 2], label: 'one piece', fold: true }, null, null, null, null, null]} />
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
/**
 * THE EDITOR, AS A MAP. The header with its icon row, the Artwork dock on the left with its slice
 * tray, the page in the middle, the cards dock on the right — and one thing ringed: whatever the
 * step is about. Drawn, not captured, so it is always the current layout.
 */
export function EditorMapDiagram({ highlight }: { highlight: 'pocket' | 'slice-new' | 'art-tab' | 'tray' | 'print' }) {
  const H = (k: typeof highlight) => (highlight === k ? styles.ringStrong : null);
  return (
    <View style={styles.editor}>
      <View style={styles.editorHeader}>
        <Text style={styles.chromeText}>Close</Text>
        <Text style={[styles.chromeText, styles.chromeTitle]}>My binder</Text>
        <View style={styles.chromeIcons}>
          {['↶', '↷', '+', '⧉', '⚙'].map((g) => (
            <Text key={g} style={styles.chromeIcon}>
              {g}
            </Text>
          ))}
          <View style={[styles.chromePill, H('print')]}>
            <Text style={styles.chromePillText}>Print</Text>
          </View>
          <View style={[styles.chromePill, styles.chromePillAccent]}>
            <Text style={styles.chromePillTextAccent}>Done</Text>
          </View>
        </View>
      </View>
      <View style={styles.editorBody}>
        <View style={styles.dock}>
          <View style={styles.dockTabs}>
            <Text style={[styles.dockTab, styles.dockTabOn, H('art-tab')]}>Artwork</Text>
            <Text style={styles.dockTab}>Stickers</Text>
          </View>
          <View style={[styles.slicePiece, { backgroundColor: INK.art }]} />
          <View style={[styles.slicePiece, { backgroundColor: INK.violet, width: 54 }, H('tray')]} />
          <View style={[styles.sliceNew, H('slice-new')]}>
            <Text style={styles.sliceNewText}>+ Slice new art</Text>
          </View>
        </View>
        <View style={styles.editorPage}>
          <PocketGrid
            rows={3}
            cols={3}
            width={126}
            cells={[{ fill: INK.sea }, { fill: INK.gold }, null, null, { ring: highlight === 'pocket', label: highlight === 'pocket' ? 'tap' : undefined }, { fill: INK.leaf }, { fill: INK.rose }, null, null]}
          />
        </View>
        <View style={styles.dock}>
          <Text style={styles.dockTitle}>Cards</Text>
          {[INK.sea, INK.gold, INK.leaf, INK.rose].map((f, i) => (
            <View key={i} style={[styles.dockCard, { backgroundColor: f }]} />
          ))}
        </View>
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
        <View style={[styles.paperSwatch, { backgroundColor: PAPER }]} />
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

/**
 * THE PRINTED SHEET, as one 3×3 page comes off the printer: placeholders carrying their address,
 * and two sideways art pieces, each one printed piece that folds into two pockets. The art is
 * bare — the address is printed on the placeholders, never on the picture.
 */
function printedSheet(swapIn?: { index: number; fill: string }): Cell[] {
  const ph = (label: string): Cell => ({ label, dashed: true, fill: PAPER });
  const cells: Cell[] = [
    ph('p3 · r1 c1'),
    { fill: INK.art, span: [1, 2], fold: true },
    null,
    ph('p3 · r2 c1'),
    ph('p3 · r2 c2'),
    ph('p3 · r2 c3'),
    { fill: INK.violet, span: [1, 2], fold: true },
    null,
    ph('p3 · r3 c3'),
  ];
  if (swapIn) cells[swapIn.index] = { fill: swapIn.fill, ring: true };
  return cells;
}

/** Cut along the dashed lines; each placeholder says where it goes. */
export function CutDiagram() {
  return (
    <View style={styles.row}>
      <PocketGrid rows={3} cols={3} width={210} cells={printedSheet()} />
      <View style={styles.legend}>
        <ThemedText type="small" themeColor="textSecondary">
          - - - cut line
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          p · r · c: page, row, column
        </ThemedText>
      </View>
    </View>
  );
}

/** The same sheet, and the first card arriving: the placeholder at p3 · r1 c1 gives way to it. */
export function SwapDiagram() {
  return (
    <View style={styles.row}>
      <PocketGrid rows={3} cols={3} width={180} cells={printedSheet()} />
      <Text style={styles.arrow}>→</Text>
      <PocketGrid rows={3} cols={3} width={180} cells={printedSheet({ index: 0, fill: INK.hero })} />
    </View>
  );
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

// ---------------------------------------------------------------------------------------------
/** A search box, taken apart: each kind of term in its own colour, with what it does. */
export function QueryAnatomyDiagram() {
  const parts: { text: string; kind: 'word' | 'field' | 'cmp' | 'sort'; note: string }[] = [
    { text: 'arita', kind: 'word', note: 'a word: must match somewhere' },
    { text: 'type:fire', kind: 'field', note: 'a field, aimed with a colon' },
    { text: 'hp>=120', kind: 'cmp', note: 'a comparison' },
    { text: 'sort:value', kind: 'sort', note: 'a sort' },
  ];
  return (
    <View style={styles.legend}>
      <View style={styles.searchBox}>
        <Text style={styles.searchGlyph}>⌕</Text>
        {parts.map((p) => (
          <Text key={p.text} style={[styles.term, termStyle[p.kind]]}>
            {p.text}
          </Text>
        ))}
      </View>
      {parts.map((p) => (
        <View key={p.text} style={styles.keyRow}>
          <View style={[styles.keySwatch, termStyle[p.kind]]} />
          <ThemedText type="small" themeColor="textSecondary">
            {p.note}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** Field, operator, value: the shapes a targeted term can take. */
export function OperatorsDiagram() {
  const rows: [string, string][] = [
    ['set:base', 'exactly this set'],
    ['rarity:"holo rare"', 'quotes keep the words together'],
    ['>$100', 'worth more than'],
    ['date>2022', 'printed after'],
    ['sort:newest', 'newest first · add :asc to flip'],
  ];
  return (
    <View style={styles.table}>
      {rows.map(([q, note]) => (
        <View key={q} style={styles.tableRow}>
          <Text style={styles.code}>{q}</Text>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tableNote}>
            {note}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** have:no with a set is a want-list: the cards you are missing, and only those. */
export function WantListDiagram() {
  const owned = [true, false, true, true, false, false, true, false, true];
  return (
    <View style={styles.row}>
      <View style={styles.labelled}>
        <PocketGrid rows={3} cols={3} width={120} cells={owned.map((o) => ({ fill: o ? INK.leaf : POCKET, label: o ? '✓' : undefined }))} />
        <ThemedText type="small" themeColor="textSecondary">
          a set, as you own it
        </ThemedText>
      </View>
      <View style={styles.legend}>
        <View style={styles.searchBox}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <Text style={[styles.term, termStyle.field]}>{'set:"evolving skies"'}</Text>
          <Text style={[styles.term, termStyle.cmp]}>have:no</Text>
        </View>
        <Text style={styles.arrow}>↓</Text>
        <PocketGrid rows={1} cols={4} width={150} cells={[{ fill: INK.rose }, { fill: INK.ember }, { fill: INK.violet }, { fill: INK.slate }]} />
        <ThemedText type="small" themeColor="textSecondary">
          the four you are missing
        </ThemedText>
      </View>
    </View>
  );
}

const termStyle = StyleSheet.create({
  word: { backgroundColor: '#DCE9F7', color: '#1E4E7A' },
  field: { backgroundColor: '#E3F0DC', color: '#2F5D26' },
  cmp: { backgroundColor: '#FBE6D2', color: '#8A4713' },
  sort: { backgroundColor: '#EBE2F5', color: '#4E2F7A' },
});

// ---------------------------------------------------------------------------------------------
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three },
  labelled: { alignItems: 'center', gap: 4 },
  mat: { backgroundColor: MAT, borderRadius: 8, position: 'relative' },
  pocket: { backgroundColor: POCKET, borderRadius: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  window: { backgroundColor: '#000' },
  ring: { borderWidth: 2.5, borderColor: RING },
  ringStrong: { borderWidth: 2, borderColor: RING },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#9A8E78' },
  fold: { position: 'absolute', top: 4, bottom: 4, left: '50%', width: 0, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: '#3E3A33' },
  cellLabel: { fontSize: 9, fontWeight: Weight.semibold, color: '#3E3A33', textAlign: 'center', paddingHorizontal: 2 },
  arrow: { fontSize: 22, color: Palette.ink2 },
  whole: { borderRadius: 6, overflow: 'hidden' },
  legend: { gap: 6, maxWidth: 260 },
  dim: { alignItems: 'center', gap: 4 },
  dimTop: { alignItems: 'center' },
  dimRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  card: { width: 63, height: 88, borderRadius: 4, backgroundColor: PAPER, borderWidth: 1, borderColor: '#B8AE9A' },
  dimText: { fontSize: FontSize.label, color: Palette.ink2 },
  dimSide: { width: 70 },
  pillGood: { fontSize: FontSize.label, color: '#2F7A3E', fontWeight: Weight.semibold },
  pillBad: { fontSize: FontSize.label, color: '#A4432D' },
  paperCard: { width: 168, padding: Spacing.three, borderRadius: Radius.control, backgroundColor: MAT, gap: 2 },
  paperSwatch: { height: 44, borderRadius: 6, marginBottom: 6, borderWidth: 1, borderColor: '#D5CDBD' },
  paperTitle: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: '#3E3A33' },
  paperSub: { fontSize: FontSize.label, color: '#6B6459' },
  // The editor map.
  editor: { width: '100%', maxWidth: 420, borderRadius: 10, overflow: 'hidden', backgroundColor: '#F4F0E6', borderWidth: 1, borderColor: '#D5CDBD' },
  editorHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: CHROME },
  chromeText: { color: CHROME_TEXT, fontSize: 10 },
  chromeTitle: { flex: 1, textAlign: 'center', fontWeight: Weight.semibold },
  chromeIcons: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chromeIcon: { color: CHROME_TEXT, fontSize: 10 },
  chromePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: '#4A4741' },
  chromePillAccent: { backgroundColor: Palette.accent },
  chromePillText: { color: CHROME_TEXT, fontSize: 9 },
  chromePillTextAccent: { color: Palette.accentText, fontSize: 9, fontWeight: Weight.semibold },
  editorBody: { flexDirection: 'row', alignItems: 'stretch', gap: 8, padding: 8 },
  dock: { width: 78, padding: 6, gap: 5, borderRadius: 8, backgroundColor: '#E6E0D2' },
  dockTitle: { fontSize: 9, fontWeight: Weight.semibold, color: '#3E3A33' },
  dockCard: { height: 22, borderRadius: 3 },
  dockTabs: { flexDirection: 'row', gap: 3, marginBottom: 2 },
  dockTab: { fontSize: 8, color: '#6B6459', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6 },
  dockTabOn: { backgroundColor: '#D5CDBD', color: '#3E3A33', fontWeight: Weight.semibold },
  slicePiece: { height: 18, borderRadius: 3 },
  sliceNew: { marginTop: 'auto', paddingVertical: 4, borderRadius: 6, backgroundColor: CHROME, alignItems: 'center' },
  sliceNewText: { color: CHROME_TEXT, fontSize: 8, fontWeight: Weight.semibold },
  editorPage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Search scenes.
  searchBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, padding: 8, borderRadius: Radius.control, backgroundColor: PAPER, borderWidth: 1, borderColor: '#D5CDBD' },
  searchGlyph: { color: '#6B6459', fontSize: 14 },
  term: { fontFamily: 'ui-monospace, monospace', fontSize: 12, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keySwatch: { width: 12, height: 12, borderRadius: 3 },
  table: { gap: 4, maxWidth: 420 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#3E3A33', backgroundColor: MAT, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, minWidth: 150 },
  tableNote: { flex: 1, minWidth: 140 },
  // Hub hooks.
  hookBox: { height: 100, borderRadius: 6, backgroundColor: PAPER, borderWidth: 1, borderColor: '#D5CDBD', padding: 5, gap: 4, overflow: 'hidden' },
  hookSearch: { height: 14, borderRadius: 4, backgroundColor: MAT, justifyContent: 'center', paddingHorizontal: 3, marginBottom: 1 },
  hookTerm: { fontFamily: 'ui-monospace, monospace', fontSize: 9, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden', alignSelf: 'flex-start' },
});
