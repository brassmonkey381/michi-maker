import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { CardBrowse } from '@/components/binder/CardBrowse';
import { ThemedText } from '@/components/themed-text';
import { domainOf, slotAspect, type ArtworkAsset } from '@/data/artworkLibrary';
import { artSearchProvider, isArtSearchConfigured, searchArt } from '@/data/artSearch';
import { useSavedArt } from '@/data/savedArt';
import type { DemoPage, DemoSlot } from '@/data/binderTypes';
import { useCatalog } from '@/hooks/use-catalog';
import type { CatalogCard } from '@/lib/catalog';
import { Palette, Radius, Weight, FontSize } from '@/constants/theme';
import { flatChip, studioButton } from '@/constants/ui';

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
  /** A theme keyword guessed from the binder, used to seed the artwork search. */
  themeHint?: string;
  onClose: () => void;
  onPickCard: (cardId: string, card?: CatalogCard) => void;
  onPickVUnion: (pieces: readonly string[]) => void;
  /** Batch-add the multi-selected cards to the binder ("Add all to a binder"). */
  onPickCards?: (cardIds: string[], cards?: CatalogCard[]) => void;
  /** Place a custom artwork image (playground art or a pasted URL) at the chosen shape. */
  onPickArtwork: (imageUrl: string, rowSpan: number, colSpan: number) => void;
  /** Slice an image across the rows×cols block — each pocket shows its piece. */
  onPickSlicedArtwork: (imageUrl: string, rows: number, cols: number) => void;
  /** Open the slice studio for the current pocket at the given grid. */
  onOpenSliceStudio: (imageUrl: string | undefined, rows: number, cols: number) => void;
  onPickInsert: (color: string, rowSpan: number, colSpan: number) => void;
  onClear: () => void;
  /** "Keep adding" mode: after placing a card the sheet stays open and jumps to the next pocket. */
  keepAdding: boolean;
  onToggleKeepAdding: () => void;
  /** One-shot "find similar to all" seed (binder multi-select → this picker). Applied on the
   *  card browser's mount; bypasses the broadcast command bus so it can't be intercepted. */
  initialSimilar?: string[];
}

export function CardPicker({
  visible,
  page,
  cell,
  slot,
  themeHint,
  onClose,
  onPickCard,
  onPickVUnion,
  onPickCards,
  onPickArtwork,
  onPickSlicedArtwork,
  onOpenSliceStudio,
  onPickInsert,
  onClear,
  keepAdding,
  onToggleKeepAdding,
  initialSimilar,
}: CardPickerProps) {
  const savedArt = useSavedArt();
  // Subscribe only while the sheet is open: the persistently-mounted picker must not
  // force the 9.87MB catalog fetch on binder-open. The background prefetch (BinderScreen)
  // warms the shared load-once promise; opening the sheet just subscribes to it.
  const { catalog } = useCatalog(visible);
  const [shape, setShape] = useState({ rows: 1, cols: 1 });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShape(slot ? { rows: slot.rowSpan, cols: slot.colSpan } : { rows: 1, cols: 1 });
  }, [cell?.row, cell?.col, slot?.id, slot?.rowSpan, slot?.colSpan]);

  const [query, setQuery] = useState(themeHint ?? '');
  const [urlInput, setUrlInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sliced, setSliced] = useState(false);
  const [tab, setTab] = useState<PickerTab>('cards');

  const fits = (rows: number, cols: number) =>
    !!cell && !!page && cell.row + rows <= page.rows && cell.col + cols <= page.cols;

  const is = (rows: number, cols: number) => shape.rows === rows && shape.cols === cols;

  // Default the tab to the pocket's existing content type when editing an occupied slot. Artwork
  // is edited in the Slice Studio (opened on demand), so it never becomes a resident tab here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(slot?.type === 'insert' ? 'insert' : 'cards');
  }, [cell?.row, cell?.col, slot?.id, slot?.type]);

  // Cards only exist at 1×1 (standard) or 2×2 (jumbo / V-UNION); coerce to a card-capable
  // shape when switching to the Cards tab from a non-square artwork/insert shape.
  const selectTab = (next: PickerTab) => {
    if (next === 'artwork') {
      // "Artwork" goes straight to the Slice Studio (card art / drag-in / upload + crop) — no
      // intermediate search-and-load step.
      onOpenSliceStudio(slot?.imageUrl, shape.rows, shape.cols);
      return;
    }
    if (next === 'cards' && !(is(1, 1) || is(2, 2))) setShape({ rows: 1, cols: 1 });
    setTab(next);
  };

  // Cards come from the unified Series → Set → Card browse (<CatalogBrowser>). Size (standard /
  // jumbo / V-UNION) is a FILTER inside that browse now — no separate 1×1/2×2 mode. Placement
  // footprints derive from the card's kind at drop time (BinderScreen.footprintForKind), so the
  // browse stays one list. The sheet gets a definite height so its FlatList has a bounded viewport.
  const sizeLabel = `${shape.rows}×${shape.cols}`;
  const isMultiCell = shape.rows > 1 || shape.cols > 1;
  const browseMode = tab === 'cards';

  // Place a chosen artwork: as one panel, or sliced across the block when the toggle is on.
  const placeArt = (url: string) =>
    sliced && isMultiCell
      ? onPickSlicedArtwork(url, shape.rows, shape.cols)
      : onPickArtwork(url, shape.rows, shape.cols);

  // Artwork suggestions come from art saved this session (Slice Studio / pasted), theme-filtered,
  // with art that matches this slot's aspect first. Live Pexels/Pixabay results are merged below.
  const q = query.trim().toLowerCase();
  const targetAspect = slotAspect(shape.rows, shape.cols);
  const library = savedArt
    .filter((a) => !q || a.title.toLowerCase().includes(q) || a.themes.some((t) => t.includes(q)))
    .sort((a, b) => (a.aspect === targetAspect ? 0 : 1) - (b.aspect === targetAspect ? 0 : 1));

  // Live, orientation-matched results from the configured image API (debounced).
  const [live, setLive] = useState<ArtworkAsset[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!isArtSearchConfigured) return;
    let active = true;
    const term = query.trim();
    const handle = setTimeout(() => {
      if (!term) {
        if (active) {
          setLive([]);
          setSearching(false);
        }
        return;
      }
      if (active) setSearching(true);
      searchArt(term, targetAspect).then((results) => {
        if (active) {
          setLive(results);
          setSearching(false);
        }
      });
    }, 350);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, targetAspect]);

  // Live results (fresh, aspect-matched) first, then the bundled library — de-duped by URL.
  const seenArt = new Set<string>();
  const artwork = [...live, ...library].filter((a) => {
    if (seenArt.has(a.url)) return false;
    seenArt.add(a.url);
    return true;
  });

  const urlValid = /^https?:\/\/\S+$/i.test(urlInput.trim());
  const title = slot ? 'Edit pocket' : 'Add to pocket';

  // The Artwork tab: search / paste / upload / slice a picture to fill the pocket(s).
  const renderArtwork = () => (
    <>
      {isArtSearchConfigured ? (
        <Text style={[styles.artMeta, styles.artMetaRow]}>
          {searching ? 'searching…' : `via ${artSearchProvider}`}
        </Text>
      ) : null}
      {/* Whole vs sliced: a multi-cell artwork can fill one panel or cut across the pockets. */}
      {isMultiCell ? (
        <View style={styles.controlsRow}>
          <Text style={styles.controlsLabel}>Layout</Text>
          <Pressable onPress={() => setSliced(false)} style={[flatChip.base, !sliced && flatChip.active]}>
            <Text style={[flatChip.text, !sliced && flatChip.textActive]}>Whole</Text>
          </Pressable>
          <Pressable onPress={() => setSliced(true)} style={[flatChip.base, sliced && flatChip.active]}>
            <Text style={[flatChip.text, sliced && flatChip.textActive]}>Sliced</Text>
          </Pressable>
          <Text style={styles.artMeta}>{sliced ? `${shape.rows * shape.cols} pieces` : 'one panel'}</Text>
        </View>
      ) : null}
      <View style={styles.controlsRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search art (e.g. fire, ocean)"
          placeholderTextColor={Palette.muted4}
          style={[styles.input, styles.inputGrow]}
        />
        <Pressable
          onPress={() => onOpenSliceStudio(slot?.imageUrl, shape.rows, shape.cols)}
          style={studioButton.base}>
          <Text style={studioButton.text}>✂ Slice studio</Text>
        </Pressable>
      </View>
      {!isArtSearchConfigured ? (
        <Text style={styles.hint}>
          Paste an image URL below, or open the Slice Studio to add and frame your own art.
        </Text>
      ) : null}
      <View style={styles.grid}>
        {artwork.map((art) => (
          <ArtThumb
            key={art.id}
            art={art}
            selected={slot?.type === 'artwork' && slot?.imageUrl === art.url}
            onPress={() => placeArt(art.url)}
          />
        ))}
        {artwork.length === 0 && query.trim() ? (
          <Text style={styles.hint}>No art matches “{query}”. Paste a URL below.</Text>
        ) : null}
      </View>

      {/* Paste a URL or upload your own image. Uploads go to your binder-art bucket and persist. */}
      <View style={styles.controlsRow}>
        <TextInput
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="Paste image URL…"
          placeholderTextColor={Palette.muted4}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, styles.inputGrow]}
        />
        <ArtUploadButton onUploaded={(url) => placeArt(url)} onError={setUploadError} />
        <Pressable
          disabled={!urlValid}
          onPress={() => {
            placeArt(urlInput.trim());
            setUrlInput('');
          }}
          style={[styles.addBtn, !urlValid && styles.disabled]}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      {uploadError ? (
        <Text style={[styles.hint, styles.errorHint]}>{uploadError}</Text>
      ) : urlInput.trim() ? (
        <Text style={styles.hint}>
          From {domainOf(urlInput)} — saved as-is; check you have the right to use it.
        </Text>
      ) : null}
    </>
  );

  // The Insert tab: a tonal negative-space tile, or leave the pocket empty.
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
      <Pressable onPress={onClear} style={styles.emptyBtn}>
        <Text style={styles.emptyText}>Leave empty</Text>
      </Pressable>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={[styles.sheet, browseMode && styles.sheetTall]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.headerTitle}>
              {title}
            </ThemedText>
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
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Done</Text>
            </Pressable>
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

          {/* Shape selector — artwork & inserts take any shape. Cards no longer pick a shape here:
              the browse is unified and Size (Standard / Jumbo / V-UNION) is a filter within it;
              the placed footprint derives from the card's kind at drop time. */}
          {tab !== 'cards' ? (
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
                    style={[styles.shapeChip, active && flatChip.active, !enabled && styles.disabled]}>
                    <Text style={[flatChip.text, active && flatChip.textActive]}>{s.name}</Text>
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
              initialSimilar={initialSimilar}
            />
          ) : tab === 'artwork' ? (
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              {renderArtwork()}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              {renderInsert()}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** An artwork suggestion thumbnail, with a visible fallback if the image fails to load. */
function ArtThumb({
  art,
  selected,
  onPress,
}: {
  art: ArtworkAsset;
  selected: boolean;
  onPress: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Pressable style={[styles.artThumb, selected && styles.thumbSelected]} onPress={onPress}>
      <View style={styles.artImageWrap}>
        {failed ? (
          <View style={styles.artFail}>
            <Text style={styles.artFailText}>no image</Text>
          </View>
        ) : (
          <Image
            source={{ uri: art.url }}
            style={styles.thumbImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={art.id}
            transition={100}
            onError={() => setFailed(true)}
          />
        )}
        <View style={[styles.tag, !art.licenseClear && styles.tagWarn]}>
          <Text style={styles.tagText}>{art.licenseClear ? art.license : '⚠ review'}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.thumbName}>
        {art.title}
      </Text>
      <Text numberOfLines={1} style={styles.source}>
        {art.sourceDomain}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Palette.scrim40 },
  backdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: Palette.surface,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  // A definite height (not just maxHeight) so the browse FlatList gets a bounded viewport.
  sheetTall: { height: '85%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: Radius.xs, backgroundColor: Palette.handle, marginBottom: 8 },
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
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  controlsLabel: { fontSize: FontSize.label, color: Palette.muted, marginRight: 2 },
  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
  },
  segmentActive: { backgroundColor: Palette.accent },
  segmentText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink2 },
  segmentTextActive: { color: Palette.accentText },
  shapeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  shapeChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    alignItems: 'center',
    minWidth: 58,
  },
  shapeSize: { fontSize: FontSize.micro, color: Palette.onDarkMuted2, marginTop: 1 },
  shapeSizeActive: { color: Palette.selectionTint },
  disabled: { opacity: 0.3 },
  hint: { fontSize: FontSize.base, color: Palette.muted3, marginTop: 4, marginBottom: 4, lineHeight: 17, width: '100%' },
  errorHint: { color: Palette.dangerAlt },
  input: {
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: FontSize.body,
    color: Palette.ink,
    minWidth: 200,
  },
  inputGrow: { flex: 1, minWidth: 160 },
  addBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.control, backgroundColor: Palette.accent },
  addBtnText: { color: Palette.accentText, fontWeight: Weight.bold, fontSize: FontSize.body },
  insertRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  insertSwatch: { width: 28, height: 28, borderRadius: 7, borderWidth: 1, borderColor: Palette.swatchBorder },
  insertSwatchActive: { borderWidth: 3, borderColor: Palette.accent },
  emptyBtn: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.control, backgroundColor: Palette.dangerBg },
  emptyText: { fontSize: FontSize.label, color: Palette.dangerAlt, fontWeight: Weight.semibold },
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
  artMeta: { fontSize: FontSize.xs, color: Palette.accent, fontWeight: Weight.semibold },
  artMetaRow: { alignSelf: 'flex-end', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 70, borderRadius: Radius.control, padding: 3 },
  artThumb: { width: 86, borderRadius: Radius.control, padding: 3 },
  thumbSelected: { backgroundColor: Palette.selectionSoft },
  thumbImageWrap: { width: '100%', aspectRatio: 63 / 88, borderRadius: Radius.thumb, overflow: 'hidden' },
  artImageWrap: { width: '100%', aspectRatio: 1, borderRadius: Radius.thumb, overflow: 'hidden', backgroundColor: Palette.chromeDeep },
  artFail: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  artFailText: { color: Palette.onDarkMuted, fontSize: FontSize.micro },
  thumbImage: { width: '100%', height: '100%' },
  tag: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: Radius.tag,
    backgroundColor: Palette.scrim60,
  },
  tagWarn: { backgroundColor: Palette.tagWarn },
  tagText: { color: Palette.white, fontSize: FontSize.tag, fontWeight: Weight.bold, letterSpacing: 0.4 },
  thumbName: { fontSize: FontSize.sm, textAlign: 'center', marginTop: 3, color: Palette.ink3 },
  source: { fontSize: FontSize.micro, textAlign: 'center', color: Palette.muted4 },
});
