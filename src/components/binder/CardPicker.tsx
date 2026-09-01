import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { CardAction } from 'tcgscan-browse';

import { CardBrowse } from '@/components/binder/CardBrowse';
import { SliceStudio, type SliceStudioHandle } from '@/components/binder/SliceStudio';
import { ThemedText } from '@/components/themed-text';
import { THEME_FAMILIES, themeBackgroundDataUri } from '@/data/themeBackgrounds';
import type { DemoPage, DemoSlot } from '@/data/binderTypes';
import type { SavedSlice } from '@/data/savedSlices';
import { useCatalog } from '@/hooks/use-catalog';
import { useOwnedCards } from '@/hooks/use-owned-cards';
import type { CatalogCard } from '@/lib/catalog';
import { Palette, Radius, Weight, FontSize } from '@/constants/theme';
import { flatChip, sheet } from '@/constants/ui';

/** Tasteful tonal inserts for filling a pocket with negative space. */
const INSERT_TONES: { label: string; color: string }[] = [
  { label: 'Cream', color: '#F3ECDD' },
  { label: 'Sand', color: '#E4D5BB' },
  { label: 'Slate', color: '#5C6B7A' },
  { label: 'Dusk', color: '#3B3A52' },
  { label: 'Blush', color: '#E9CBD1' },
  { label: 'Sky', color: '#C7DBE8' },
  { label: 'Charcoal', color: '#2A2A30' },
];

/** How many palettes the themed-background cycle steps through (the richest family's count). */
const MAX_PALETTES = Math.max(1, ...THEME_FAMILIES.map((f) => f.themes.length));

/**
 * Placement footprints, with their real Michi-method print sizes. The michi insert grid is a
 * consistent 7cm × 9.5cm per cell (so 1×2 = the "2-horizontal" 14×9.5cm insert, 2×2 = the
 * 4-card 14×19cm insert, 3×3 = the full-page 21×28.5cm). A real card is portrait (63×88), an
 * aspect only square blocks (1×1, 2×2, 3×3) preserve — so only those carry cards; artwork
 * panels + tonal inserts take any shape (cropped/chosen to fit). See woahpoke.com/michi-method.
 */
const CELL_W_CM = 7;
const CELL_H_CM = 9.5;
const cm = (rows: number, cols: number) => `${cols * CELL_W_CM}×${rows * CELL_H_CM}cm`;

const SHAPES: { label: string; name: string; rows: number; cols: number; size: string }[] = [
  { label: '1×1', name: 'Single', rows: 1, cols: 1, size: cm(1, 1) },
  { label: '1×2', name: '1×2', rows: 1, cols: 2, size: cm(1, 2) },
  { label: '2×1', name: '2×1', rows: 2, cols: 1, size: cm(2, 1) },
  { label: '2×2', name: '2×2', rows: 2, cols: 2, size: cm(2, 2) },
  { label: '1×3', name: '1×3', rows: 1, cols: 3, size: cm(1, 3) },
  { label: '3×1', name: '3×1', rows: 3, cols: 1, size: cm(3, 1) },
  { label: '2×3', name: '2×3', rows: 2, cols: 3, size: cm(2, 3) },
  { label: '3×2', name: '3×2', rows: 3, cols: 2, size: cm(3, 2) },
  { label: '3×3', name: 'Full page', rows: 3, cols: 3, size: cm(3, 3) },
];

type PickerTab = 'cards' | 'artwork' | 'insert';
const TABS: { id: PickerTab; label: string }[] = [
  { id: 'cards', label: 'Cards' },
  { id: 'artwork', label: 'Artwork' },
  { id: 'insert', label: 'Insert' },
];

interface CardPickerProps {
  visible: boolean;
  page: DemoPage | null;
  cell: { row: number; col: number } | null;
  slot?: DemoSlot | null;
  onClose: () => void;
  onPickCard: (cardId: string, card?: CatalogCard) => void;
  onPickVUnion: (pieces: readonly string[]) => void;
  /** Batch-add the multi-selected cards to the binder ("Add all to a binder"). */
  onPickCards?: (cardIds: string[], cards?: CatalogCard[]) => void;
  /** Place a custom artwork image (a themed background) at the chosen shape. */
  onPickArtwork: (imageUrl: string, rowSpan: number, colSpan: number) => void;
  /** Save the embedded Slice Studio's pieces to the slice tray (Artwork tab). */
  onSaveSlices: (slices: SavedSlice[]) => void;
  /** Live tray size + the account's artwork cap (Infinity = uncapped) — gates the studio's Save. */
  trayCount?: number;
  trayLimit?: number;
  /** Guests can't keep artworks (cap 0): the studio shows a sign-in note, not an upgrade pitch. */
  guest?: boolean;
  onPickInsert: (color: string, rowSpan: number, colSpan: number) => void;
  onClear: () => void;
  /** "Keep adding" mode: after placing a card the sheet stays open and jumps to the next pocket. */
  keepAdding: boolean;
  onToggleKeepAdding: () => void;
  /** One-shot "find similar to all" seed (binder multi-select → this picker). Applied on the
   *  card browser's mount; bypasses the broadcast command bus so it can't be intercepted. */
  initialSimilar?: string[];
  /** Docked only: the column is tucked away to a rail, so the binder gets the width back. Owned by
   *  BinderScreen because the page's layout budget has to change with it, not merely the picker. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/**
 * Below this the screen cannot hold a binder page AND a picker side by side, so the picker goes
 * back to being a sheet over the page. Above it, hiding the binder to choose a card for the binder
 * is simply a worse product.
 */
export const CARD_PICKER_DOCK_MIN_WIDTH = 1100;
/** Wide enough for the browse grid's 140px tiles three across, plus its chrome. */
export const CARD_PICKER_DOCK_WIDTH = 460;
/** Collapsed, the dock leaves behind a rail just wide enough to grab and pull back out. */
export const CARD_PICKER_RAIL_WIDTH = 34;

export function CardPicker({
  visible,
  page,
  cell,
  slot,
  onClose,
  onPickCard,
  onPickVUnion,
  onPickCards,
  onPickArtwork,
  onSaveSlices,
  trayCount,
  trayLimit,
  guest,
  onPickInsert,
  onClear,
  keepAdding,
  onToggleKeepAdding,
  initialSimilar,
  collapsed = false,
  onToggleCollapsed,
}: CardPickerProps) {
  // Subscribe only while the sheet is open: the persistently-mounted picker must not
  // force the 9.87MB catalog fetch on binder-open. The background prefetch (BinderScreen)
  // warms the shared load-once promise; opening the sheet just subscribes to it.
  const { catalog } = useCatalog(visible);
  // Owned-card ids → the browse's collection overlays (tile checks, set completion %, and the
  // have: / Collection filter) inside the picker, matching the /browse page. Undefined for guests.
  const ownedIds = useOwnedCards();
  const [shape, setShape] = useState({ rows: 1, cols: 1 });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShape(slot ? { rows: slot.rowSpan, cols: slot.colSpan } : { rows: 1, cols: 1 });
  }, [cell?.row, cell?.col, slot?.id, slot?.rowSpan, slot?.colSpan]);

  // Themed-background picker shows one swatch per energy family; this cycles the palette (base +
  // variants) across every swatch at once.
  const [themePaletteIdx, setThemePaletteIdx] = useState(0);
  const [tab, setTab] = useState<PickerTab>('cards');
  // On the Artwork (Slice Studio) tab, "Done" commits any unsaved framing to the tray before
  // closing (the studio saves only genuinely-unsaved work); on other tabs it's a plain close.
  const studioRef = useRef<SliceStudioHandle>(null);
  const onDone = () => {
    if (tab === 'artwork') studioRef.current?.commit();
    onClose();
  };

  const fits = (rows: number, cols: number) =>
    !!cell && !!page && cell.row + rows <= page.rows && cell.col + cols <= page.cols;

  const is = (rows: number, cols: number) => shape.rows === rows && shape.cols === cols;

  // Default the tab to the pocket's existing content type when editing an occupied slot, so
  // "Replace" lands on the right panel (artwork slots → the Artwork tab, which is the Slice Studio).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(slot?.type === 'insert' ? 'insert' : slot?.type === 'artwork' ? 'artwork' : 'cards');
  }, [cell?.row, cell?.col, slot?.id, slot?.type]);

  // Cards only exist at 1×1 (standard) or 2×2 (jumbo / V-UNION); coerce to a card-capable
  // shape when switching to the Cards tab from a non-square insert shape. The Artwork tab embeds
  // the Slice Studio (bring art in via URL / drag / upload, then slice to your tray).
  const selectTab = (next: PickerTab) => {
    if (next === 'cards' && !(is(1, 1) || is(2, 2))) setShape({ rows: 1, cols: 1 });
    setTab(next);
  };

  // Cards come from the unified Series → Set → Card browse (<CatalogBrowser>). Size (standard /
  // jumbo / V-UNION) is a FILTER inside that browse now — no separate 1×1/2×2 mode. Placement
  // footprints derive from the card's kind at drop time (BinderScreen.footprintForKind), so the
  // browse stays one list. The sheet gets a definite height so its FlatList has a bounded viewport.
  const sizeLabel = `${shape.rows}×${shape.cols}`;
  const title = slot ? 'Edit pocket' : 'Add to pocket';

  // Place a themed background (our owned procedural art) as a spanning artwork. Seeded from the
  // pocket so a page of themes doesn't render identically. Fills the whole footprint as one
  // continuous background (the color-themed-spread idea) — no external art, no licensing.
  const placeTheme = (id: string) =>
    onPickArtwork(
      themeBackgroundDataUri(id, { seed: cell ? cell.row * 31 + cell.col + 1 : undefined }),
      shape.rows,
      shape.cols,
    );

  // The Insert tab: a tonal negative-space tile, a themed background, or leave the pocket empty.
  const renderInsert = () => (
    <>
      <Text style={styles.sectionLabel}>Tonal insert · {sizeLabel}</Text>
      <View style={styles.insertRow}>
        {INSERT_TONES.map((tone) => {
          const active = slot?.type === 'insert' && slot.insertColor === tone.color;
          return (
            <Pressable
              key={tone.color}
              accessibilityLabel={`${tone.label} insert`}
              onPress={() => onPickInsert(tone.color, shape.rows, shape.cols)}
              style={[styles.insertSwatch, { backgroundColor: tone.color }, active && styles.insertSwatchActive]}
            />
          );
        })}
      </View>

      {/* Themed backgrounds, procedural, fully owned elemental art (themeBackgrounds.ts). One
          swatch per energy family; the Variant chip flips every swatch to its alternate palette. */}
      <View style={styles.themeHeaderRow}>
        <Text style={styles.sectionLabel}>Themed background · {sizeLabel}</Text>
        <Pressable
          onPress={() => setThemePaletteIdx((i) => (i + 1) % MAX_PALETTES)}
          accessibilityLabel={`Palette ${themePaletteIdx + 1} of ${MAX_PALETTES}; tap to cycle`}
          style={[flatChip.base, themePaletteIdx > 0 && flatChip.active]}>
          <Text style={[flatChip.text, themePaletteIdx > 0 && flatChip.textActive]}>
            Palette {themePaletteIdx + 1}/{MAX_PALETTES}
          </Text>
        </Pressable>
      </View>
      <View style={styles.insertRow}>
        {THEME_FAMILIES.map((fam) => {
          const t = fam.themes[Math.min(themePaletteIdx, fam.themes.length - 1)];
          return (
            <Pressable
              key={fam.family}
              accessibilityLabel={`${t.name} themed background, ${t.vibe}`}
              onPress={() => placeTheme(t.id)}
              style={styles.themeSwatch}>
              <Image
                source={{ uri: themeBackgroundDataUri(t.id, { w: 80, h: 112, count: 5 }) }}
                style={styles.themeSwatchImg}
                contentFit="cover"
              />
              <Text style={styles.themeSwatchLabel} numberOfLines={1}>
                {t.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={onClear} style={styles.emptyBtn}>
        <Text style={styles.emptyText}>Leave empty</Text>
      </Pressable>
    </>
  );

  /**
   * DOCKED BESIDE THE BINDER, not on top of it, wherever there is room.
   *
   * The picker was a phone sheet everywhere: 94% of the window's height and, having no max width,
   * the full 1920px of a desktop monitor. Choosing a card therefore hid the binder the card was
   * for — you could not see the pocket you had tapped, the page it sat on, or where "Keep adding"
   * had moved to next. Every deck builder worth copying does the opposite: the collection stays on
   * screen and the search sits beside it.
   *
   * Docked, it is a column: no scrim, no Modal, so the binder behind stays visible AND clickable —
   * you can tap another pocket to retarget without closing anything. The bottom sheet stays on
   * narrow screens, where covering the page is the only honest option.
   */
  const { width } = useWindowDimensions();
  // ...but NOT for the Artwork tab. The Slice Studio is a workspace, not a side panel: a canvas
  // shaped like the page, a control column beside it, and a two-column layout that wants 800px
  // before it will even unstack. Docked into a 460px column it hangs off the edge of the screen.
  // On that tab the picker goes back to being a full-width sheet, which is the room it was built
  // for — and the sheet's 720px cap lifts there for the same reason.
  const docked = width >= CARD_PICKER_DOCK_MIN_WIDTH && tab !== 'artwork';

  /**
   * ONE TAP TO PLACE.
   *
   * A tile tap opens the card's action sheet, which is the right home for "find similar",
   * "view set" and "view illustrator" — and the wrong price for the common case. When you already
   * know which card you want, placing cost two taps and a sheet that opened and closed again:
   * eighteen taps and eighteen sheets to fill a nine-pocket page.
   *
   * The browse kit's inline quick-action pill fires WITHOUT opening the sheet, so placing is one
   * tap and the sheet keeps everything it was actually good for. The pill runs the same
   * `onPickCard` the sheet's button ran, so "Keep adding" and the jump to the next pocket behave
   * identically — this changes the toll, not the outcome. Picker-only: the home browse has no
   * pocket to place into, which is why the prop is opt-in rather than a default of the kit.
   */
  const quickPlace = (): CardAction => ({
    key: 'quick-place',
    // Occupied pockets say so: a one-tap replace should not look like a one-tap add. The sheet
    // spells out whose card is being replaced; the pill has room for one glyph.
    label: slot ? '⇄' : '＋',
    onPress: (c) => onPickCard(c.id, c),
  });

  const body = (
    <>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.headerTitle}>
          {title}
        </ThemedText>
        {/* "Keep adding" only does something on the Cards tab (place → jump to next pocket);
            it's a no-op in the Slice Studio, so hide it there. */}
        {tab !== 'artwork' ? (
          <Pressable
            onPress={onToggleKeepAdding}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityState={{ checked: keepAdding }}
            style={[styles.keepAdding, keepAdding && styles.keepAddingOn]}>
            <Text style={[styles.keepAddingText, keepAdding && styles.keepAddingTextOn]}>
              {keepAdding ? '✓ Keep adding' : 'Keep adding'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onDone} hitSlop={12}>
          <Text style={styles.close}>Done</Text>
        </Pressable>
        {/* Collapse, borrowing the slice tray's idiom: one chevron, pointing the way the panel
            travels. Docked only — a bottom sheet already collapses by being dismissed. */}
        {docked && onToggleCollapsed ? (
          <Pressable
            onPress={onToggleCollapsed}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ expanded: true }}
            accessibilityLabel="Collapse the card search">
            <Text style={styles.chevron}>▸</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Content type — decide *what* goes in the pocket first. */}
      <View style={styles.segmentRow}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => selectTab(t.id)}
              style={[styles.segment, active && styles.segmentActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Shape selector, inserts take any shape. Cards derive their footprint from the card's
          kind at drop time; the Artwork tab's Slice Studio slices the whole page, so neither
          needs a shape here. */}
      {tab === 'insert' ? (
        <View style={styles.shapeRow}>
          <Text style={styles.controlsLabel}>Shape</Text>
          {SHAPES.map((s) => {
            const enabled = fits(s.rows, s.cols);
            const active = is(s.rows, s.cols);
            return (
              <Pressable
                key={s.label}
                disabled={!enabled}
                onPress={() => setShape({ rows: s.rows, cols: s.cols })}
                style={[styles.shapeChip, active && styles.shapeChipActive, !enabled && styles.disabled]}>
                <Text style={[flatChip.text, active && styles.shapeTextActive]}>{s.name}</Text>
                <Text style={[styles.shapeSize, active && styles.shapeSizeActive]}>{s.size}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {tab === 'cards' ? (
        // The unified Series → Set → Card browse (its FlatList is the primary scroller).
        // Rendered even while the catalog loads: CatalogBrowser runs COLD (server search) so
        // you can search instantly, then swaps to on-device once the catalog is in memory.
        // Size (Standard / Jumbo / V-UNION) is a filter inside it; V-UNION shows assembled
        // group tiles. Remount per pocket so browse position / search / filters don't leak
        // between pockets — but in "keep adding" mode hold one browse so you can rattle
        // through a set filling pockets without it resetting.
        <CardBrowse
          key={keepAdding ? 'fill-session' : `${cell?.row ?? 'x'}-${cell?.col ?? 'x'}-${slot?.id ?? 'new'}`}
          catalog={catalog}
          selectedCardId={slot?.type === 'card' ? slot.cardId : undefined}
          onPickCard={onPickCard}
          onPickVUnion={onPickVUnion}
          onPickCards={onPickCards}
          quickAction={quickPlace}
          initialSimilar={initialSimilar}
          ownedIds={ownedIds}
        />
      ) : tab === 'artwork' ? (
        // Inserting artwork IS the Slice Studio now — bring art in by URL, drag, image drag, or
        // upload, frame it, and slice to your tray. Embedded so the tab bar stays above it. It
        // slices the whole page (its own grid = the binder's page size), so remount per page
        // shape/source to reset the framing when the pocket context changes.
        <SliceStudio
          key={`${page?.rows ?? 1}x${page?.cols ?? 1}-${slot?.id ?? 'new'}`}
          ref={studioRef}
          embedded
          rows={page?.rows ?? 1}
          cols={page?.cols ?? 1}
          imageUrl={slot?.imageUrl}
          onSaveSlices={onSaveSlices}
          onClose={onClose}
          trayCount={trayCount}
          trayLimit={trayLimit}
          guest={guest}
        />
      ) : (
        <ScrollView
          style={styles.scrollFill}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          {renderInsert()}
        </ScrollView>
      )}
    </>
  );

  if (docked) {
    // The Modal branch honours `visible` itself; a plain View has to be told. Rendering nothing —
    // rather than an empty column — is also what keeps the binder at full width when closed.
    if (!visible) return null;
    if (collapsed) {
      // The whole column, reduced to something to grab. It still holds its own width in the
      // layout, so the binder grows into the space rather than sliding under a floating panel.
      return (
        <Pressable
          style={styles.rail}
          onPress={onToggleCollapsed}
          testID="card-picker-rail"
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          accessibilityLabel="Expand the card search">
          <Text style={styles.chevron}>◂</Text>
        </Pressable>
      );
    }
    return (
      <View style={styles.dock} testID="card-picker-dock">
        {/* No grab handle and no scrim: this is a column of the page, not a sheet over it. Close
            is explicit, because the binder staying live means a stray tap outside is far more
            likely to be someone aiming at a pocket than someone dismissing the picker. */}
        {body}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheet.bottomBackdrop}>
        {/* The backdrop dismisses through onDone, not onClose. It used to call onClose, which
            discards — so a tap just outside the sheet threw away a whole framing session, the exact
            thing the studio's commit handle exists to protect, and it did it on the gesture people
            use to mean "I'm finished". Dismissing is a way of finishing, so it saves like Done. */}
        <Pressable style={styles.backdropFill} onPress={onDone} />
        {/* Always tall, whatever the tab, Cards, Artwork, and Insert all rise to the same height
            so switching between them doesn't resize the sheet. */}
        <View style={[sheet.bottomSheet, styles.sheetTall, tab !== 'artwork' && styles.sheetCapped]}>
          <View style={sheet.handle} />
          {body}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  /** The docked column. Full height, fixed width, and NOT a modal — the binder beside it stays
   *  visible and interactive, which is the entire point. */
  dock: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: CARD_PICKER_DOCK_WIDTH,
    backgroundColor: Palette.surface,
    borderLeftWidth: 1,
    borderLeftColor: Palette.hairlineStrong,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    zIndex: 70,
  },
  /** Collapsed: a full-height strip on the same edge, wide enough to hit and nothing more. */
  rail: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: CARD_PICKER_RAIL_WIDTH,
    backgroundColor: Palette.surface,
    borderLeftWidth: 1,
    borderLeftColor: Palette.hairlineStrong,
    alignItems: 'center',
    paddingTop: 14,
    zIndex: 70,
  },
  chevron: { fontSize: FontSize.md, color: Palette.muted },
  /** Even as a sheet it should not stretch to a 1920px monitor: a phone-shaped control the width
   *  of a desktop is nobody's idea of a good picker. The Slice Studio is the exception — it is a
   *  workspace and takes every pixel it is given. */
  sheetCapped: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  // A definite height (not just maxHeight) so the browse FlatList gets a bounded viewport. Overrides
  // the shared bottomSheet's 85% maxHeight to give the Slice Studio canvas more vertical room.
  sheetTall: { height: '94%', maxHeight: '94%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headerTitle: { flex: 1 },
  keepAdding: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    backgroundColor: Palette.panel,
  },
  keepAddingOn: { backgroundColor: Palette.accent },
  keepAddingText: { fontSize: FontSize.base, fontWeight: Weight.bold, color: Palette.muted },
  keepAddingTextOn: { color: Palette.accentText },
  close: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.accent },
  controlsLabel: {
    fontSize: FontSize.sm,
    color: Palette.muted,
    fontWeight: Weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: 2,
  },
  // Segmented control, matching the studio's fit/view toggles: panel track, surface thumb.
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: Palette.panel,
    borderRadius: Radius.pill,
    padding: 2,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  segmentActive: {
    backgroundColor: Palette.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: FontSize.body, fontWeight: Weight.medium, color: Palette.muted },
  segmentTextActive: { color: Palette.ink, fontWeight: Weight.semibold },
  shapeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  shapeChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    minWidth: 58,
  },
  // Selection language shared with the studio's legal-pair bar: accent border + soft tint.
  shapeChipActive: { borderColor: Palette.accent, backgroundColor: Palette.selectionSoft },
  shapeTextActive: { color: Palette.ink, fontWeight: Weight.semibold },
  shapeSize: { fontSize: FontSize.micro, color: Palette.muted3, marginTop: 1 },
  shapeSizeActive: { color: Palette.accent },
  disabled: { opacity: 0.3 },
  insertRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  insertSwatch: { width: 28, height: 28, borderRadius: 7, borderWidth: 1, borderColor: Palette.swatchBorder },
  insertSwatchActive: { borderWidth: 3, borderColor: Palette.accent },
  themeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  themeSwatch: { width: 48, alignItems: 'center', gap: 3 },
  themeSwatchImg: {
    width: 48,
    height: 60,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Palette.swatchBorder,
    backgroundColor: Palette.panel,
  },
  themeSwatchLabel: { fontSize: FontSize.xs, color: Palette.muted2 },
  emptyBtn: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.control, backgroundColor: Palette.dangerBg },
  emptyText: { fontSize: FontSize.label, color: Palette.dangerAlt, fontWeight: Weight.semibold },
  scrollFill: { flex: 1 },
  scroll: { paddingBottom: 16 },
  sectionLabel: {
    fontSize: FontSize.base,
    fontWeight: Weight.bold,
    color: Palette.muted2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
});
