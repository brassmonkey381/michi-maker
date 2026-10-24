/**
 * ARRANGE SHEET: several finished layouts for the cards a page already has (docs/ARRANGE.md).
 *
 * One button (or G) opens this. SINGLE PAGES ONLY. A page is read as full art or windowed by its
 * majority (the owner's pages are one or the other; the catalogue's kinds miss some full arts, and
 * refusing a mixed page blocked the owner on an all-full-art page on 2026-10-22, so it is read, not
 * refused). THE ARRANGER'S answer (data/arranger: one score the lab tunes to the owner's eye, over
 * every template the shape allows) and its other takes are shown ON THE PAGE ITSELF, full size,
 * one at a time (owner, 2026-10-22: "see them instantly in the binder page and iterate through
 * them, because full size is better to see"): this component is a bar under the page with the
 * take's name and reason, arrows to step (the keyboard's too), Keep and Cancel. The screen renders
 * whatever `onPreview` hands it in place of the page, read-only, and puts the page back on close.
 * The first take is the page as it is now, so a step back always shows the before. Keep reseats
 * the page in ONE store commit (one Undo) and one server transaction (reseat_slots). Hand
 * placements made afterwards are never overridden: Arrange runs again by choice.
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
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getColorIndex, loadColorIndex } from 'tcgscan-browse';

import { SignInPerk } from '@/components/auth/SignInPerk';
import { LogoLoader } from '@/components/brand/LogoLoader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
  onPreview,
  onClose,
  onApply,
}: {
  visible: boolean;
  page: DemoPage;
  /** The take being looked at, as the page would be; null for the page as it is (or on close). */
  onPreview: (preview: DemoPage | null) => void;
  onClose: () => void;
  /** The store write: the moves and any template art gaps, applied as one commit by the screen. */
  onApply: (what: string, moves: ArrangeMove[], art: { pageId: string; slot: DemoSlot }[]) => void;
}) {
  const { catalog, guestGated } = useCatalog(visible);
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

  const pageOf = (leaf: Leaf): DemoPage => (leaf === 'right' ? pages[1] : pages[0]);

  // WHICH TAKE IS ON THE PAGE. Keyed by the candidate run, so a fresh run opens on the arranger's
  // answer (index 1; 0 is the page as it is) without a synchronous reset in an effect.
  const candKey = candidates ? candidates.map((c) => c.id).join('|') : '';
  const [sel, setSel] = useState<{ key: string; i: number } | null>(null);
  const index = candidates ? (sel && sel.key === candKey ? sel.i : Math.min(1, candidates.length - 1)) : 0;
  const cand = candidates ? candidates[index] : null;
  const step = (d: number) => {
    if (!candidates) return;
    setSel({ key: candKey, i: (index + d + candidates.length) % candidates.length });
  };

  // The take as a page: the untouched slots, the pockets re-seated, the template's art panels,
  // the held cards gone (to the tray on Keep). Ids are the real pockets' ids, so the grid draws it
  // exactly as it will be. Minted once per take so the preview is stable while it is looked at.
  const preview = useMemo<DemoPage | null>(() => {
    if (!visible || !cand || cand.mode === 'current') return null;
    const pocketIds = new Set(pockets.map((p) => p.slot.id));
    const byId = new Map(pockets.map((p) => [p.slot.id, p.slot]));
    const kept = page.slots.filter((s) => !pocketIds.has(s.id));
    const seated: DemoSlot[] = cand.placements.map((pl) => ({ ...byId.get(pl.cardId)!, row: pl.cell.row, col: pl.cell.col }));
    const art = cand.template ? templateArtSlots(cand.template, uuidv4) : [];
    return { ...page, slots: [...kept, ...seated, ...art] };
  }, [visible, cand, pockets, page]);
  useEffect(() => {
    onPreview(preview);
  }, [preview, onPreview]);

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

  // ← → step the takes and Enter keeps while the bar is open; the screen stops turning pages.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const el = (e.target as HTMLElement | null)?.tagName;
      if (el === 'INPUT' || el === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'Enter' && cand && cand.mode !== 'current') {
        e.preventDefault();
        apply(cand, index);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!visible) return null;

  const mixNote = mix?.mixed
    ? `Read as a ${mix.dominant === 'full' ? 'full-art' : 'windowed'} page: ${mix.dominant === 'full' ? mix.windowed : mix.full} card${(mix.dominant === 'full' ? mix.windowed : mix.full) === 1 ? ' looks' : 's look'} ${mix.dominant === 'full' ? 'windowed' : 'full art'} to the catalogue.`
    : '';
  const isNow = !cand || cand.mode === 'current';
  return (
    <ThemedView type="backgroundElement" style={styles.bar} accessibilityRole="toolbar" accessibilityLabel="Arrange this page">
      {pockets.length < 2 ? (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Arrange needs at least two cards on the page.
          </ThemedText>
          <Btn text="Close" onPress={onClose} />
        </>
      ) : guestGated ? (
        // Arrange reads the cards from the full catalog, a signed-in perk; without this a guest
        // waits on "Reading the cards…" forever.
        <>
          <SignInPerk message="Arrange reads the cards from the full card catalog. Sign in (free) to use it." />
          <Btn text="Close" onPress={onClose} />
        </>
      ) : !candidates || !cand ? (
        <>
          <LogoLoader />
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Reading the cards…
          </ThemedText>
          <Btn text="Cancel" onPress={onClose} />
        </>
      ) : (
        <>
          <Btn text="‹" label="Previous take" onPress={() => step(-1)} />
          <View style={styles.middle}>
            <View style={styles.titleRow}>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
                {isNow ? 'As it is now' : cand.name}
              </ThemedText>
              <Text style={styles.count}>{`${index + 1} of ${candidates.length}`}</Text>
            </View>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.reason}>
              {isNow ? `Step through the takes with the arrows; the page shows each one full size.${mixNote ? ` ${mixNote}` : ''}` : cand.reason}
            </ThemedText>
            {!isNow && (cand.artCells > reserved.size || cand.held.length || cand.open.length || cand.ask) ? (
              <View style={styles.chips}>
                {cand.artCells > reserved.size ? <Chip text={`${cand.artCells - reserved.size} more for art`} /> : null}
                {cand.held.length ? <Chip text={`${cand.held.length} to the tray`} /> : null}
                {cand.open.length ? <Chip text={`${cand.open.length} open`} /> : null}
                {cand.ask ? <Chip accent text={askText(cand)} /> : null}
              </View>
            ) : null}
          </View>
          <Btn text="›" label="Next take" onPress={() => step(1)} />
          <Btn text="Keep" primary disabled={isNow} label="Keep this arrangement (Enter)" onPress={() => apply(cand, index)} />
          <Btn text="Cancel" label="Cancel, put the page back (Esc)" onPress={onClose} />
        </>
      )}
    </ThemedView>
  );
}

function Btn({ text, label, onPress, primary, disabled }: { text: string; label?: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label ?? text}
      accessibilityState={{ disabled }}
      hitSlop={6}
      style={({ pressed }) => [styles.btn, primary && styles.btnPrimary, disabled && styles.btnOff, pressed && styles.pressed]}>
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{text}</Text>
    </Pressable>
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    maxWidth: 720,
    width: '96%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  middle: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  // READABLE AT A GLANCE (owner, 2026-10-22: "some of the text is too small"): the bar sits over
  // the page and is read while comparing takes, so nothing on it goes below the label size.
  title: { flexShrink: 1, fontSize: FontSize.md },
  count: { fontSize: FontSize.label, color: Palette.muted3, fontVariant: ['tabular-nums'] },
  reason: { fontSize: FontSize.label, lineHeight: 18 },
  note: { flex: 1 },
  btn: { paddingVertical: 6, paddingHorizontal: Spacing.three, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.hairlineStrong },
  btnPrimary: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  btnOff: { opacity: 0.45 },
  btnText: { color: Palette.ink2, fontWeight: Weight.semibold, fontSize: FontSize.label },
  btnTextPrimary: { color: Palette.accentText },
  pressed: { opacity: 0.75 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.tag, backgroundColor: Palette.hairline },
  chipAccent: { backgroundColor: Palette.accent },
  chipText: { fontSize: FontSize.base, fontWeight: Weight.medium },
  chipTextAccent: { color: Palette.accentText },
});
