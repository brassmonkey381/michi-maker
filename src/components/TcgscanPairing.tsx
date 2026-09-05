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
 *   Share or Print — a printer with both pages of that spread coming out of its side as fill
 *                   sheets, and the liked heart from the binder's own like button.
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
import { FontSize, Palette, Radii, Radius, Shadows, Spacing, Weight } from '@/constants/theme';
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
      'Publish your binder at @username and share with the community, or print the fill sheets ' +
      'at true size and swap the placeholders as the cards come in.',
  },
];

/** Every illustration is exactly this tall, so the three headings sit on one line beneath them. */
const ART_H = 200;
/** A step column narrower than this is a phone; the drawings drop their side elements. */
const NARROW = 250;
/** The phone (Scan): bezel outer size and inner padding. */
const PHONE_W = 84;
const PHONE_PAD = 5;
/** Share or Print: the printer's footprint, how far a sheet is tucked into its side slot, and how
 *  far the front sheet overlaps the one behind it. */
const PRINTER_W = 136;
const PRINTER_H = 84;
/** How far the rear tray rises above the body, and how far the sheets extend past it. */
const TRAY_RISE = 40;
const SHELF_OUT = 48;
const SLOT_TUCK = SHELF_OUT + 18;
const SHEET_FAN = 26;
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
    <View style={[styles.row, { gap }]}>
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
 * Share or Print: a printer with both pages of the Compose spread coming out of its side, one
 * behind the other, and the binder's like button in its liked state (the filled heart and a
 * count), the pill LikeButton draws on a public binder. The printer is drawn as one: a body with
 * a paper-feed sheet standing up behind it, a control panel with a lit button, and an output slot
 * on the side the sheets emerge from; the sheets pass behind the body so they read as still
 * coming out.
 */
function ShareArt({ w, page, facing }: { w: number; page: DemoPage; facing: DemoPage }) {
  const two = w >= NARROW;
  // Two sheets fanned, overlapping each other by SHEET_FAN and tucked SLOT_TUCK into the printer.
  const avail = w - (PRINTER_W + SHELF_OUT) + SLOT_TUCK;
  const outer = two ? Math.floor((avail + SHEET_FAN) / 2) : avail;
  const byHeight = Math.floor(((ART_H - 22) * page.cols * 63) / (page.rows * 88));
  const pageW = Math.max(60, Math.min(120, outer - SHEET_PAD * 2 - 2, byHeight));
  return (
    <View style={[styles.shareArt, { width: w }]}>
      <View style={styles.printerWrap}>
        {/* Rear paper tray with a sheet standing in it, behind the body. */}
        <View style={styles.feedTray} />
        <View style={styles.feedSheet} />
        <View style={styles.printerBody}>
          <View style={styles.printerLid}>
            <View style={styles.lidSeam} />
          </View>
          <View style={styles.printerPanel}>
            <View style={styles.printerScreen} />
            <View style={styles.printerButton} />
          </View>
          <View style={styles.frontSlot} />
          <View style={styles.printerFoot} />
        </View>
      </View>
      <View style={styles.sheets}>
        <View style={[styles.paper, styles.sheetBack]}>
          <BinderGrid page={page} width={pageW} instantImages />
        </View>
        {two ? (
          <View style={[styles.paper, styles.sheetFront]}>
            <BinderGrid page={facing} width={pageW} instantImages />
          </View>
        ) : null}
      </View>
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
            <ShareArt w={w} page={pages.page} facing={pages.facing} />
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
  // The illustration box: the column's full width and a fixed height, so the three drawings are
  // the same size and the headings sit on one line. Scan and Share or Print compose to the width;
  // Compose (two pages, capped by height) is centred in it.
  art: { height: ART_H, alignSelf: 'stretch', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6 },
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
  // Share or Print: the printer at the left, drawn over the sheets so they emerge from its side.
  shareArt: { flexDirection: 'row', alignItems: 'flex-end' },
  printerWrap: { zIndex: 2, paddingTop: TRAY_RISE, width: PRINTER_W + SHELF_OUT },
  // The rear tray: a slab rising behind the lid, the sheet waiting in it.
  feedTray: {
    position: 'absolute',
    top: 6,
    left: 22,
    width: PRINTER_W - 44,
    height: TRAY_RISE + 20,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: Palette.muted2,
  },
  feedSheet: {
    position: 'absolute',
    top: 0,
    left: 34,
    width: PRINTER_W - 68,
    height: TRAY_RISE + 10,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: Palette.white,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
  },
  // The body: a light lid over a dark base, the classic inkjet silhouette.
  printerBody: {
    width: PRINTER_W,
    height: PRINTER_H,
    borderRadius: 14,
    backgroundColor: Palette.ink3,
    overflow: 'hidden',
    ...Shadows.page,
  },
  printerLid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 34,
    backgroundColor: Palette.muted3,
    borderBottomWidth: 2,
    borderBottomColor: Palette.ink3,
  },
  // The scanner lid's seam, a thin highlight near the top.
  lidSeam: { position: 'absolute', top: 8, left: 12, right: 12, height: 2, borderRadius: 1, backgroundColor: Palette.muted4 },
  printerPanel: { position: 'absolute', top: 44, left: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  printerScreen: { width: 30, height: 14, borderRadius: 3, backgroundColor: Palette.chromeDeep, borderWidth: 1, borderColor: Palette.muted },
  printerButton: { width: 10, height: 10, borderRadius: 5, backgroundColor: Palette.accent },
  // The front paper slot, a lighter band across the base.
  frontSlot: { position: 'absolute', left: 60, right: 14, top: 48, height: 6, borderRadius: 3, backgroundColor: Palette.muted },
  printerFoot: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, backgroundColor: Palette.chromeDeep },
  sheets: { flexDirection: 'row', alignItems: 'flex-end', marginLeft: -SLOT_TUCK, zIndex: 1 },
  paper: {
    padding: SHEET_PAD,
    backgroundColor: Palette.white,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Palette.hairline,
    ...Shadows.page,
  },
  sheetBack: { marginBottom: 12 },
  // The front sheet has landed on the one behind it, a little askew.
  sheetFront: { marginLeft: -SHEET_FAN, marginBottom: 2, transform: [{ rotate: '-3deg' }] },
  chip: {
    position: 'absolute',
    top: 0,
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
  // The like button, liked: LikeButton.tsx's pill with the accent border, filled heart and count.
  likePill: { right: 0, zIndex: 3, borderColor: Palette.accent },
  likeHeart: { fontSize: FontSize.md, lineHeight: 20, color: Palette.accent },
  likeCount: { fontSize: FontSize.label, lineHeight: 20, fontWeight: Weight.bold, color: Palette.accent },
  stepBody: { lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two, maxWidth: '100%' },
  actionsNote: { flexShrink: 1 },
  primary: { backgroundColor: Palette.accent, borderRadius: Radius.pill, paddingHorizontal: Spacing.four, paddingVertical: 8 },
  primaryText: { color: Palette.accentText, fontSize: FontSize.body, fontWeight: Weight.semibold },
  pressed: { opacity: 0.75 },
});
