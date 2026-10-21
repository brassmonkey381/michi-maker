/**
 * ARRANGE SHEET: several finished layouts for the cards a page already has (docs/ARRANGE.md).
 *
 * One button on a page opens this. SINGLE PAGES ONLY. A page is read as full art or windowed by its
 * majority (the owner's pages are one or the other; the catalogue's kinds miss some full arts, and
 * refusing a mixed page blocked the owner on an all-full-art page on 2026-10-22, so it is read, not
 * refused). It shows the page as it is now first, so looking costs nothing, then THE ARRANGER'S
 * answer (data/arranger: one score the lab tunes to the owner's eye, over every template the
 * shape allows) and two other takes, as thumbnails of the actual cards in the actual pockets, each
 * with a one-line reason the user can check against the picture. Tapping one reseats the page in ONE store commit (one Undo) and one server
 * transaction (reseat_slots). Hand placements made afterwards are never overridden: Arrange runs
 * again by choice.
 *
 * WHAT IT READS. The seating itself is `data/arranger` (pure). This sheet only gathers the facts:
 * the catalog record for each pocket (line, stage, illustrator, set, number, rarity, full-art
 * kind), each card's depth words from the server (`lib/depth`, which sends the vocabulary and
 * gets back a subset of it, so no tag reaches the device), and the palette from the on-device
 * colour index when it is loaded. A card with none of these is still seated: it is free in Strata,
 * single in Lines, mid grey in Flow.
 *
 * TEMPLATES ARE OFFERED ONLY ON A PAGE WITH NO ART. A template reserves pockets for art panels;
 * on a page that already has art the layout is the owner's, so Arrange keeps every art pocket
 * where it is and seats the cards around it. A template with fewer card pockets than the page has
 * cards is offered too: the cards it cannot seat go to the binder's TRAY (the chip says how many),
 * from where they go back into any pocket. Lab run 1 (docs/ARRANGE.md) showed the owner picking
 * such a page over complete ones.
 *
 * EVERY PICK IS RECORDED (template, mode, rank shown, rank picked) so the weights can be tuned
 * later from what the owner actually chooses.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { cardThumbUrl, getColorIndex, loadColorIndex } from 'tcgscan-browse';

import { LogoLoader } from '@/components/brand/LogoLoader';
import { ThemedText } from '@/components/themed-text';
import { DialogCard } from '@/components/ui/DialogCard';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import {
  type ArrangeCard,
  type Candidate,
  type Cell,
  type Leaf,
  DEPTH_LABEL,
  cardCells,
  cellKey,
  movesFor,
  pageArtMix,
} from '@/data/arrange';
import { ART_TEMPLATES, templateArtSlots } from '@/data/artTemplates';
import { slotCells, uuidv4, type DemoPage, type DemoSlot } from '@/data/binderTypes';
import { useCatalog } from '@/hooks/use-catalog';
import { track } from '@/lib/analytics';
import { arrangePage } from '@/data/arranger';
import { depthOfCards } from '@/lib/depth';
import { similarityAmong, type Similarity } from '@/lib/similarity';

/** A card pocket as Arrange sees it: the pocket is the unit (two pockets may hold one card id). */
interface Pocket {
  slot: DemoSlot;
  pageId: string;
  leaf: Leaf;
}

/** A pocket's destination: a cell on a page, or the tray (`toPageId` null). */
export type ArrangeMove = { slotId: string; fromPageId: string; toPageId: string | null; row: number; col: number };

export function ArrangeSheet({
  visible,
  page,
  onClose,
  onApply,
}: {
  visible: boolean;
  page: DemoPage;
  onClose: () => void;
  /** The store write: the moves and any template art gaps, applied as one commit by the screen. */
  onApply: (what: string, moves: ArrangeMove[], art: { pageId: string; slot: DemoSlot }[]) => void;
}) {
  const { catalog } = useCatalog(visible);
  // The module can seat a facing spread as one canvas; the product does not offer it.
  const spread = false;
  const pages = useMemo(() => [page], [page]);
  const rows = page.rows;
  const cols = page.cols;

  // The pockets Arrange may seat (1x1 cards) and the cells it must leave alone (art, big pieces).
  const { pockets, reserved, hasArt } = useMemo(() => {
    const ps: Pocket[] = [];
    const rs = new Set<string>();
    let art = false;
    pages.forEach((p, i) => {
      const leaf: Leaf = spread ? (i === 0 ? 'left' : 'right') : 'single';
      for (const s of p.slots) {
        if (s.type === 'card' && s.cardId && s.rowSpan === 1 && s.colSpan === 1) ps.push({ slot: s, pageId: p.id, leaf });
        else {
          if (s.type === 'artwork') art = true;
          for (const k of slotCells(s)) {
            const [r, c] = k.split(',').map(Number);
            rs.add(cellKey({ leaf, row: r, col: c }));
          }
        }
      }
    });
    return { pockets: ps, reserved: rs, hasArt: art };
  }, [pages, spread]);

  // Depth words from the server and the palette index, gathered once per open. The answer is
  // keyed by the cards it was asked for, so a page edited while the sheet was closed is read again
  // rather than seated on a stale answer.
  const idsKey = pockets.map((p) => p.slot.cardId).join(',');
  const [depthAnswer, setDepthAnswer] = useState<{ key: string; map: Map<string, string[]>; sim: Similarity } | null>(null);
  const [paletteTick, setPaletteTick] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    const ids = [...new Set(pockets.map((p) => p.slot.cardId!))];
    // Depth words and art likeness together: both are one round trip per open, both fail soft.
    void Promise.all([depthOfCards(ids), similarityAmong(ids)]).then(([m, sim]) => {
      if (active) setDepthAnswer({ key: idsKey, map: m, sim });
    });
    if (!getColorIndex()) void loadColorIndex().then(() => active && setPaletteTick((t) => t + 1));
    track('arrange_open', { pockets: pockets.length, spread, hasArt });
    return () => {
      active = false;
    };
  }, [visible, pockets, idsKey, spread, hasArt]);
  const depth = depthAnswer && depthAnswer.key === idsKey ? depthAnswer.map : null;
  const similarity = depthAnswer && depthAnswer.key === idsKey ? depthAnswer.sim : null;

  // All full arts or all windowed cards: a mixed page is refused with the count, not seated.
  const mix = useMemo(() => (catalog ? pageArtMix(pockets.map((p) => { const c = catalog.getCard(p.slot.cardId!); return { fullArtKind: c?.fullArtKind, fullArt: c?.fullArt }; })) : null), [catalog, pockets]);

  const candidates = useMemo<Candidate[] | null>(() => {
    if (!visible || !catalog || !depth || pockets.length < 2 || !mix) return null;
    const index = getColorIndex();
    const cards: ArrangeCard[] = pockets.map((p) => {
      const id = p.slot.cardId!;
      const c = catalog.getCard(id);
      const words = depth.get(id) ?? c?.sceneTags ?? [];
      return {
        id: p.slot.id,
        name: c?.name ?? id,
        depthWords: words,
        evolutionLine: c?.evolutionLine,
        evolutionStage: c?.evolutionStage,
        illustrator: c?.illustrator || undefined,
        setId: c?.setId,
        number: c?.number,
        fullArtKind: c?.fullArtKind,
        fullArt: c?.fullArt,
        rarity: c?.rarity,
        palette: index?.has(id) ? index.colors(id, 'art') : undefined,
        types: c?.types,
      };
    });
    const current = new Map<string, Cell>();
    for (const p of pockets) current.set(p.slot.id, { leaf: p.leaf, row: p.slot.row, col: p.slot.col });
    const templates = hasArt ? [] : ART_TEMPLATES.filter((t) => t.rows === rows && t.cols === cols && t.spread === spread);
    // Likeness arrives keyed by card id; the arranger seats pockets, so it is re-keyed by pocket.
    const sim = new Map<string, Map<string, number>>();
    for (const a of pockets) {
      const row = similarity?.get(a.slot.cardId!);
      if (!row) continue;
      const m = new Map<string, number>();
      for (const b of pockets) {
        const v = row.get(b.slot.cardId!);
        if (v !== undefined && b.slot.id !== a.slot.id) m.set(b.slot.id, v);
      }
      sim.set(a.slot.id, m);
    }
    const answer = arrangePage({ rows, cols, spread, cards, reserved, current, templates, similarity: sim });
    if (!answer) return null;
    const cells = cardCells(rows, cols, spread, reserved);
    const placements = pockets.map((p) => ({ cardId: p.slot.id, cell: current.get(p.slot.id)! }));
    const used = new Set(placements.map((pl) => cellKey(pl.cell)));
    const asIs: Candidate = {
      id: 'current',
      template: null,
      mode: 'current',
      name: 'As it is now',
      reason: 'No change',
      placements,
      open: cells.filter((c) => !used.has(cellKey(c))),
      held: [],
      artCells: reserved.size,
      fit: 0,
      score: 0,
    };
    return [asIs, answer.best, ...answer.alternates];
    // paletteTick re-reads the index once it has loaded; it carries no value of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, catalog, depth, similarity, pockets, reserved, hasArt, rows, cols, spread, paletteTick, mix]);

  const cardIdOf = useMemo(() => new Map(pockets.map((p) => [p.slot.id, p.slot.cardId!])), [pockets]);
  const pageOf = (leaf: Leaf): DemoPage => (leaf === 'right' ? pages[1] : pages[0]);

  const [applying, setApplying] = useState(false);
  const apply = (cand: Candidate, rank: number) => {
    if (applying || !candidates) return;
    const current = new Map<string, Cell>();
    for (const p of pockets) current.set(p.slot.id, { leaf: p.leaf, row: p.slot.row, col: p.slot.col });
    const moves: ArrangeMove[] = movesFor(cand, current).map((m) => {
      const from = pockets.find((p) => p.slot.id === m.cardId)!;
      return { slotId: m.cardId, fromPageId: from.pageId, toPageId: pageOf(m.cell.leaf).id, row: m.cell.row, col: m.cell.col };
    });
    // The cards the template cannot seat leave the page for the tray, in the same commit.
    for (const h of cand.held) {
      const from = pockets.find((p) => p.slot.id === h.id);
      if (from) moves.push({ slotId: h.id, fromPageId: from.pageId, toPageId: null, row: 0, col: 0 });
    }
    const art = cand.template
      ? pages.flatMap((p, i) => {
          const leaf: 'left' | 'right' | undefined = spread ? (i === 0 ? 'left' : 'right') : undefined;
          return templateArtSlots(cand.template!, uuidv4, leaf).map((slot) => ({ pageId: p.id, slot }));
        })
      : [];
    track('arrange_pick', {
      template: cand.template?.id ?? 'page',
      mode: cand.mode,
      rank,
      shown: candidates.length - 1,
      moves: moves.length,
      toTray: cand.held.length,
      spread,
    });
    setApplying(true);
    onApply(cand.name, moves, art);
    onClose();
    setApplying(false);
  };

  return (
    <DialogCard visible={visible} title={spread ? 'Arrange this spread' : 'Arrange this page'} onClose={onClose} maxWidth={640} scroll={false}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        The same cards, seated so the page reads, and two other takes. Tap one to use it; Undo brings the old order back.
        {mix?.mixed ? ` Read as a ${mix.dominant === 'full' ? 'full-art' : 'windowed'} page: ${mix.dominant === 'full' ? mix.windowed : mix.full} card${(mix.dominant === 'full' ? mix.windowed : mix.full) === 1 ? ' looks' : 's look'} ${mix.dominant === 'full' ? 'windowed' : 'full art'} to the catalogue.` : ''}
      </ThemedText>
      {pockets.length < 2 ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          Arrange needs at least two cards on the page.
        </ThemedText>
      ) : !candidates ? (
        <View style={styles.loading}>
          <LogoLoader />
          <ThemedText type="small" themeColor="textSecondary">
            Reading the cards…
          </ThemedText>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
          {candidates.map((cand, i) => (
            <Pressable
              key={cand.id}
              onPress={() => (cand.mode === 'current' ? onClose() : apply(cand, i))}
              accessibilityRole="button"
              accessibilityLabel={`${cand.name}. ${cand.reason}`}
              style={({ pressed }) => [styles.card, cand.mode === 'current' && styles.cardCurrent, pressed && styles.pressed]}>
              <Preview cand={cand} rows={rows} cols={cols} spread={spread} cardIdOf={cardIdOf} reserved={reserved} />
              <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTitle}>
                {cand.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={3} style={styles.cardDesc}>
                {cand.reason}
              </ThemedText>
              <View style={styles.chips}>
                {cand.artCells > reserved.size ? <Chip text={`${cand.artCells - reserved.size} more for art`} /> : null}
                {cand.held.length ? <Chip text={`${cand.held.length} to the tray`} /> : null}
                {cand.open.length ? <Chip text={`${cand.open.length} open`} /> : null}
                {cand.ask ? <Chip accent text={askText(cand)} /> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </DialogCard>
  );
}

/** The one sparing suggestion, as a chip: what a single card would complete. Not a change. */
function askText(c: Candidate): string {
  if (!c.ask) return '';
  if (c.ask.kind === 'band') return `one more ${DEPTH_LABEL[c.ask.depth]} card fills the row`;
  const species = c.ask.species.charAt(0).toUpperCase() + c.ask.species.slice(1);
  return `a ${species} would complete the line`;
}

function Chip({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <View style={[styles.chip, accent && styles.chipAccent]}>
      <ThemedText type="small" style={[styles.chipText, accent && styles.chipTextAccent]}>
        {text}
      </ThemedText>
    </View>
  );
}

/** The candidate as a tiny page or spread: real thumbnails in the pockets, hatching where art goes. */
function Preview({
  cand,
  rows,
  cols,
  spread,
  cardIdOf,
  reserved,
}: {
  cand: Candidate;
  rows: number;
  cols: number;
  spread: boolean;
  cardIdOf: ReadonlyMap<string, string>;
  reserved: ReadonlySet<string>;
}) {
  const at = new Map(cand.placements.map((p) => [cellKey(p.cell), p.cardId]));
  const art = cand.template ? new Set<string>() : reserved;
  if (cand.template) {
    for (const p of cand.template.panels) {
      const leaf: Leaf = spread ? (p.page ?? 'left') : 'single';
      for (let r = p.row; r < p.row + p.rowSpan; r += 1) for (let c = p.col; c < p.col + p.colSpan; c += 1) (art as Set<string>).add(cellKey({ leaf, row: r, col: c }));
    }
  }
  const leaves: Leaf[] = spread ? ['left', 'right'] : ['single'];
  return (
    <View style={styles.previewRow}>
      {leaves.map((leaf) => (
        <View key={leaf} style={[styles.leaf, { aspectRatio: (cols * 2.5) / (rows * 3.5) }]}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const cell: Cell = { leaf, row: Math.floor(i / cols), col: i % cols };
            const k = cellKey(cell);
            const slotId = at.get(k);
            const cardId = slotId ? cardIdOf.get(slotId) : undefined;
            return (
              <View key={k} style={[styles.cell, { width: `${100 / cols}%` }]}>
                {cardId ? (
                  <Image source={{ uri: cardThumbUrl(cardId, 245) }} style={styles.cellImg} contentFit="cover" transition={0} />
                ) : art.has(k) ? (
                  <View style={styles.cellArt} />
                ) : (
                  <View style={styles.cellOpen} />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lede: { marginBottom: Spacing.three, lineHeight: 18 },
  empty: { paddingVertical: Spacing.four },
  loading: { paddingVertical: Spacing.five, alignItems: 'center', gap: Spacing.two },
  scroll: { maxHeight: 520 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, paddingBottom: Spacing.two },
  card: {
    flexGrow: 1,
    flexBasis: 270,
    maxWidth: 300,
    padding: Spacing.two,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    backgroundColor: Palette.panelAlt,
    gap: Spacing.one,
  },
  cardCurrent: { borderStyle: 'dashed' },
  pressed: { opacity: 0.85 },
  previewRow: { flexDirection: 'row', gap: 3 },
  leaf: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Palette.hairline },
  cell: { aspectRatio: 2.5 / 3.5, padding: 1 },
  cellImg: { width: '100%', height: '100%', borderRadius: 2 },
  cellArt: { width: '100%', height: '100%', borderRadius: 2, backgroundColor: Palette.accentSoft, opacity: 0.8 },
  cellOpen: { width: '100%', height: '100%', borderRadius: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: Palette.controlBorder },
  cardTitle: { marginTop: Spacing.one },
  cardDesc: { lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  chip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.tag, backgroundColor: Palette.hairline },
  chipAccent: { backgroundColor: Palette.accent },
  chipText: { fontSize: FontSize.tag, fontWeight: Weight.medium },
  chipTextAccent: { color: Palette.accentText },
});
