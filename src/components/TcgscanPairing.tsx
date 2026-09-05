/**
 * THE SISTER APP, SAID PLAINLY. TCGScan is the phone app that scans cards into a collection, and
 * that collection is what the curator builds binders from — the two products are one loop:
 * scan it there, compose it here, print it, fill the real binder. Until now TCGScan surfaced only
 * in fine print and a synergy note on the import sheet; a visitor could use michi-maker for a
 * month without learning it existed.
 *
 * One block, the same on every surface it appears on (Home, Welcome, My binders), with the loop
 * drawn as three steps and one button. The button goes through openTcgscan, which mints the SSO
 * handoff so a signed-in member lands on tcgscan.ai already signed in.
 *
 * THE THREE STEPS ARE DRAWN WITH THE APP'S OWN PAGES, NOT EMOJI. A camera, a book and a printer
 * glyph read as machine-made, and visitors hold that against a site. Each step shows real example
 * pages rendered by the same BinderGrid that draws every binder here, and EACH DRAWING FILLS ITS
 * COLUMN: a step measures its own width and the illustration is composed to that width, so a wide
 * card is three full pictures rather than three thumbnails and a field of empty grey.
 *   Scan          — a phone with one card under the scan reticle, and beside it the collection
 *                   the scans landed in (the page's cards as a small grid, every one marked owned).
 *   Compose       — the finished page as a two-page spread, the example binder's first two pages.
 *   Share or Print — a printer the width of the column putting out that page as a fill sheet, the
 *                   public link chip, and the liked heart from the binder's own like button.
 * The page itself is the example page's cards with a two-pocket-wide artwork panel across the
 * middle row (the full-bleed illustration of the card it displaces), the way real michi pages
 * carry an art piece.
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { BinderGrid } from '@/components/binder/BinderGrid';
import { openTcgscan } from '@/components/monetization/BundleOffer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Fonts, Palette, Radii, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
import type { DemoPage, DemoSlot } from '@/data/binderTypes';
import { track } from '@/lib/analytics';
import { cardThumbUrl, useImageManifest } from '@/lib/catalogConfig';
import { useBinders } from '@/store/binders';

type StepKind = 'scan' | 'compose' | 'share';

const STEPS: { kind: StepKind; head: string; body: string }[] = [
  { kind: 'scan', head: 'Scan', body: 'Point TCGScan at a card, a page, a whole binder. It reads them into your collection.' },
  {
    kind: 'compose',
    head: 'Compose',
    body:
      'Your collection syncs here. Binder pages keep their structure and layout. Fill and curate ' +
      'binder pages using cards you actually own.',
  },
  {
    kind: 'share',
    head: 'Share or Print',
    body:
      'Publish the binder at your @username and collect likes, or print the fill sheets at true ' +
      'size and swap the placeholders as the cards come in.',
  },
];

/** Every illustration is exactly this tall, so the three headings sit on one line beneath them. */
const ART_H = 200;
/** A step column narrower than this is a phone; the drawings drop their side elements. */
const NARROW = 250;
/** The phone (Scan): bezel outer size and inner padding. */
const PHONE_W = 84;
const PHONE_PAD = 5;
/** Share or Print: the printer body, and how far the sheet is drawn behind its top edge. */
const PRINTER_H = 56;
const PRINTER_OVERLAP = 26;
const SHEET_PAD = 6;

/** The width of a View, measured once laid out (0 until then). */
function useMeasuredWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width)), []);
  return [w, onLayout];
}

/**
 * The page every illustration is built from: the first example binder page that has a card in it
 * (the same page the curate callout shows as its "after"), with two pockets of the middle row
 * replaced by one artwork panel, a single pocket tall and two wide. The art is the full-bleed
 * illustration of the card the panel displaces — one of the binder's own cards, so it belongs
 * with its neighbours and nothing appears twice. The panel shows the card's PICTURE, not the card:
 * once the image manifest is in, the slot is an imageUrl artwork cropped to the illustration
 * band (the top half below the name bar), so the two pockets hold art rather than attack text.
 * Until then the whole card cover-fits the same footprint. Also returns the binder's next page (Compose
 * shows a spread) and the plain cards, for the collection grid.
 */
function useExamplePages(): { page: DemoPage; facing: DemoPage; cards: DemoSlot[] } | null {
  const store = useBinders();
  const manifestReady = useImageManifest();
  const binder = store.exampleBinders.find((b) => b.pages[0]?.slots?.some((s) => s.cardId)) ?? store.exampleBinders[0];
  return useMemo(() => {
    const base = binder?.pages[0];
    if (!base) return null;
    const cards = base.slots.filter((sl) => sl.type === 'card' && sl.cardId && sl.rowSpan === 1 && sl.colSpan === 1);
    let page = base;
    if (base.cols >= 3 && base.rows >= 3) {
      const artRow = Math.floor(base.rows / 2);
      const artCol = base.cols - 2;
      const displaced = (c: number) => cards.find((sl) => sl.row === artRow && sl.col === c);
      // Prefer the right-hand card of the pair: the example page keeps its gold card on the left, and a
      // gold illustration reads as a flat yellow block at this size.
      const art = displaced(artCol + 1) ?? displaced(artCol);
      if (art?.cardId) {
        const keep = base.slots.filter(
          (sl) => sl.rowSpan === 1 && sl.colSpan === 1 && !(sl.row === artRow && (sl.col === artCol || sl.col === artCol + 1)),
        );
        const url = manifestReady ? cardThumbUrl(art.cardId, 640) : '';
        const panel: DemoSlot = url
          ? {
              id: `${base.id}-steps-art`,
              row: artRow,
              col: artCol,
              rowSpan: 1,
              colSpan: 2,
              type: 'artwork',
              imageUrl: url,
              imageFit: 'cover',
              imageCrop: { x: 0.04, y: 0.1, w: 0.92, h: 0.48 },
            }
          : // A spanning artwork slot with a cardId is drawn cover-fit: the whole card, edge to edge.
            { id: `${base.id}-steps-art`, row: artRow, col: artCol, rowSpan: 1, colSpan: 2, type: 'artwork', cardId: art.cardId };
        page = { ...base, id: `${base.id}-steps`, slots: [...keep, panel] };
      }
    }
    const facing = binder.pages[1] ?? page;
    return { page, facing, cards };
  }, [binder, manifestReady]);
}

/** The height BinderGrid gives a page of this shape at this width (pockets, gaps and margin). */
function pageHeight(width: number, cols: number, rows: number) {
  return Math.round((width * (rows * 88)) / (cols * 63) + 8);
}

/**
 * Scan: the phone with one card under the reticle, and, filling the rest of the column, the
 * collection those scans became — the page's cards as a small grid with every one marked owned,
 * which is exactly what My Collection shows after a scanning session.
 */
function ScanArt({ w, cards }: { w: number; cards: DemoSlot[] }) {
  const one = useMemo<DemoPage | null>(() => {
    const slot = cards[0];
    if (!slot) return null;
    return { id: 'steps-scan', rows: 1, cols: 1, slots: [{ ...slot, row: 0, col: 0, rowSpan: 1, colSpan: 1 }] };
  }, [cards]);
  const panelW = w - PHONE_W - Spacing.three;
  const showPanel = panelW >= 120;
  // As many 4-wide rows as fit the height; the panel's grid is drawn at the panel's inner width.
  const gridW = panelW - Spacing.two * 2;
  const cols = 4;
  const rows = Math.max(1, Math.min(2, Math.floor((ART_H - 44) / (pageHeight(gridW, cols, 1) - 8))));
  const grid = useMemo<DemoPage>(
    () => ({
      id: 'steps-collection',
      rows,
      cols,
      backgroundColor: 'transparent',
      slots: cards.slice(0, rows * cols).map((sl, i) => ({ ...sl, id: `coll-${i}`, row: Math.floor(i / cols), col: i % cols, rowSpan: 1, colSpan: 1 })),
    }),
    [cards, rows],
  );
  const owned = useMemo(() => new Set(cards.map((c) => c.cardId!).filter(Boolean)), [cards]);
  return (
    <View style={[styles.row, { width: w }]}>
      <View style={styles.phone}>
        <View style={styles.screen}>
          {one ? <BinderGrid page={one} width={PHONE_W - PHONE_PAD * 2} instantImages /> : null}
          <View pointerEvents="none" style={styles.reticle}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>
      </View>
      {showPanel ? (
        <View style={[styles.panel, { width: panelW }]}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>My collection</Text>
            <Text style={styles.panelCount}>{cards.length} cards</Text>
          </View>
          <BinderGrid page={grid} width={gridW} instantImages ownedIds={owned} />
        </View>
      ) : null}
    </View>
  );
}

/** Compose: the page as a spread, two facing pages side by side, as the binder shows it open. */
function ComposeArt({ w, page, facing }: { w: number; page: DemoPage; facing: DemoPage }) {
  const gap = 6;
  // Two pages if they fit at a readable size, else the one page at the largest size the box allows.
  const byHeight = Math.floor(((ART_H - 8) * page.cols * 63) / (page.rows * 88));
  const two = w >= NARROW;
  const pageW = Math.min(byHeight, two ? Math.floor((w - gap) / 2) : w);
  return (
    <View style={[styles.row, { width: w, gap }]}>
      <View style={styles.pageShadow}>
        <BinderGrid page={page} width={pageW} instantImages />
      </View>
      {two ? (
        <View style={styles.pageShadow}>
          <BinderGrid page={facing} width={pageW} instantImages />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Share or Print: a printer the width of the column with the fill sheet coming out of it — the
 * very page Compose shows, printed — the public link chip on its left shoulder and, on its right,
 * the binder's like button in its liked state (the filled heart and a count), the pill
 * LikeButton draws on a public binder.
 */
function ShareArt({ w, page }: { w: number; page: DemoPage }) {
  const sheetPageW = Math.min(120, Math.floor(w * 0.36));
  const printerW = w;
  const wide = w >= NARROW;
  return (
    <View style={[styles.shareArt, { width: w }]}>
      <View style={[styles.paper, { marginLeft: Math.round((printerW - sheetPageW - SHEET_PAD * 2 - 2) / 2) }]}>
        <BinderGrid page={page} width={sheetPageW} instantImages />
      </View>
      <View style={[styles.printer, { width: printerW }]}>
        <View style={styles.printerSlot} />
      </View>
      {wide ? (
        <View style={[styles.chip, styles.linkChip]}>
          <Text style={styles.linkText}>michi-maker.com/u/you</Text>
        </View>
      ) : null}
      <View style={[styles.chip, styles.likePill]}>
        <Text style={styles.likeHeart}>♥</Text>
        <Text style={styles.likeCount}>12</Text>
      </View>
    </View>
  );
}

function Step({ kind, head, body, index, pages }: { kind: StepKind; head: string; body: string; index: number; pages: ReturnType<typeof useExamplePages> }) {
  const [w, onLayout] = useMeasuredWidth();
  return (
    <View style={styles.step} onLayout={onLayout}>
      <View style={styles.art} pointerEvents="none">
        {w > 0 && pages ? (
          kind === 'scan' ? (
            <ScanArt w={w} cards={pages.cards} />
          ) : kind === 'compose' ? (
            <ComposeArt w={w} page={pages.page} facing={pages.facing} />
          ) : (
            <ShareArt w={w} page={pages.page} />
          )
        ) : null}
      </View>
      <ThemedText type="smallBold">
        {index + 1}. {head}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.stepBody}>
        {body}
      </ThemedText>
    </View>
  );
}

export function TcgscanPairing({ surface, compact = false }: { surface: string; compact?: boolean }) {
  const pages = useExamplePages();
  // Wide enough for the button to sit beside the lede; below this it wraps under, left-aligned.
  const [cardW, onCardLayout] = useMeasuredWidth();
  const sideBySide = cardW >= 860;
  const go = () => {
    track('tcgscan.pairing_click', { surface });
    openTcgscan();
  };
  const actions = (
    <View style={styles.actions}>
      <Pressable onPress={go} accessibilityRole="link" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>Get TCGScan</Text>
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary" style={styles.actionsNote}>
        Free Forever. Unlimited on device scanning.
      </ThemedText>
    </View>
  );
  return (
    <ThemedView type="backgroundElement" style={[styles.card, compact && styles.cardCompact]} onLayout={onCardLayout}>
      {/* The button sits beside the introduction on a wide card (the space to the right of the
          lede was empty) and wraps under it on a narrow one. */}
      <View style={styles.intro}>
        <View style={styles.introText}>
          <View style={styles.head}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>TCGScan</Text>
            </View>
            <ThemedText type="smallBold" style={styles.kicker}>
              Pairs with michi-maker
            </ThemedText>
          </View>
          <ThemedText type="subtitle" style={styles.title}>
            Scan your cards on your phone. Build the binder here.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
            TCGScan is our sister app for iPhone and Android: it scans cards into a collection, tracks what you own
            and what it is worth, and shares one account with michi-maker, so what you scan is what you can build with.
          </ThemedText>
        </View>
        {!compact ? <View style={[styles.introActions, sideBySide && styles.introActionsSide]}>{actions}</View> : null}
      </View>
      {!compact ? (
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <Step key={s.head} kind={s.kind} head={s.head} body={s.body} index={i} pages={pages} />
          ))}
        </View>
      ) : (
        actions
      )}
    </ThemedView>
  );
}

const CORNER = 14;
const CORNER_STROKE = 2;

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    gap: Spacing.two,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    ...Shadows.page,
  },
  cardCompact: { padding: Spacing.three },
  intro: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three, rowGap: Spacing.two },
  introText: { flexGrow: 1, flexShrink: 1, flexBasis: 420, minWidth: 0, gap: Spacing.two },
  introActions: { flexGrow: 1, flexShrink: 1, minWidth: 0, justifyContent: 'center' },
  introActionsSide: { alignItems: 'flex-end' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: { backgroundColor: Palette.chrome, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#F5EFE4', fontSize: FontSize.label, fontWeight: Weight.bold, letterSpacing: 0.3 },
  kicker: { color: Palette.accent, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: FontSize.label },
  title: { marginTop: 2 },
  lede: { maxWidth: 620 },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.two },
  step: { flex: 1, minWidth: 220, gap: 2 },
  // The illustration box: a fixed height so the three headings sit on one line, the drawing
  // hanging from its bottom edge.
  art: { height: ART_H, justifyContent: 'flex-end', alignItems: 'flex-start', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  pageShadow: { borderRadius: Radii.pageSmall, ...Shadows.page },
  // Scan: a dark phone bezel around a screen, the card centred on it, a reticle over the card.
  phone: {
    width: PHONE_W,
    height: ART_H - 20,
    padding: PHONE_PAD,
    borderRadius: 12,
    backgroundColor: Palette.chromeDeep,
    ...Shadows.page,
  },
  screen: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: Palette.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reticle: { position: 'absolute', top: 10, right: 6, bottom: 10, left: 6 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: Palette.accent },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_STROKE, borderLeftWidth: CORNER_STROKE, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_STROKE, borderRightWidth: CORNER_STROKE, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_STROKE, borderLeftWidth: CORNER_STROKE, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_STROKE, borderRightWidth: CORNER_STROKE, borderBottomRightRadius: 4 },
  // The collection panel beside the phone: the My Collection card, small.
  panel: {
    padding: Spacing.two,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Palette.hairline,
    gap: 4,
  },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 2 },
  panelTitle: { fontSize: FontSize.sm, fontWeight: Weight.semibold, color: Palette.ink },
  panelCount: { fontSize: FontSize.xs, color: Palette.ink2 },
  // Share or Print: the sheet rises out of the printer (the printer is drawn over its lower edge);
  // the link chip and the liked pill sit on the printer's front face, either side.

  shareArt: { alignItems: 'flex-start' },
  paper: {
    padding: SHEET_PAD,
    backgroundColor: Palette.white,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Palette.hairline,
    ...Shadows.page,
  },
  printer: {
    height: PRINTER_H,
    marginTop: -PRINTER_OVERLAP,
    borderRadius: 10,
    backgroundColor: Palette.chromeDeep,
    ...Shadows.page,
  },
  printerSlot: { position: 'absolute', top: 8, left: 14, right: 14, height: 4, borderRadius: 2, backgroundColor: Palette.muted },
  chip: {
    position: 'absolute',
    bottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: Palette.white,
    ...Shadows.page,
  },
  linkChip: { left: 10, borderColor: Palette.hairlineStrong },
  linkText: { fontFamily: Fonts.mono, fontSize: FontSize.xs, lineHeight: 20, color: Palette.ink2 },
  // The like button, liked: LikeButton.tsx's pill with the accent border, filled heart and count.
  likePill: { right: 10, borderColor: Palette.accent },
  likeHeart: { fontSize: FontSize.md, lineHeight: 20, color: Palette.accent },
  likeCount: { fontSize: FontSize.label, lineHeight: 20, fontWeight: Weight.bold, color: Palette.accent },
  stepBody: { lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two, maxWidth: '100%' },
  actionsNote: { flexShrink: 1 },
  primary: { backgroundColor: Palette.accent, borderRadius: Radius.pill, paddingHorizontal: Spacing.four, paddingVertical: 8 },
  primaryText: { color: Palette.accentText, fontSize: FontSize.body, fontWeight: Weight.semibold },
  pressed: { opacity: 0.75 },
});
