import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type DimensionValue,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { CardBrowse } from '@/components/binder/CardBrowse';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Weight, FontSize } from '@/constants/theme';
import { pillChip, controlButton } from '@/constants/ui';
import { domainOf, type ArtAspect } from '@/data/artworkLibrary';
import { uid } from '@/data/binderTypes';
import { addSavedArt } from '@/data/savedArt';
import { useCatalog } from '@/hooks/use-catalog';
import { cardThumbUrl } from '@/lib/catalogConfig';
import type { ArtPanelInput } from '@/store/binders';

const CARD_ASPECT = 88 / 63;
const GAP = 6;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Rough illustration window of a standard (non-full-art) Pokémon card, as fractions of the full
 *  card image — the starting crop for "Just the art". Pan/zoom to fine-tune per card. */
const ART_WINDOW: Win = { x: 0.06, y: 0.11, w: 0.88, h: 0.42 };
/** How far the crop window may travel past the image edge, as a fraction of the window. Lets you
 *  pan art partly out of frame — and pan at all when not zoomed in — while keeping ≥15% overlapping. */
const OVER = 0.85;
const clampAxis = (v: number, size: number) => clamp(v, -OVER * size, 1 - size + OVER * size);

/** External galleries to drag art from (web) — a curated official set, Pinterest's broad feed, and
 *  the official Pokémon Center card-sleeve art. */
const ART_OF_PKM_URL = 'https://www.artofpkm.com/artwork/all';
const PINTEREST_URL = 'https://www.pinterest.com/ideas/pokemon-pictures/931192954917/';
const POKEMON_CENTER_SLEEVES_URL = 'https://www.pokemoncenter.com/category/card-sleeves';

// Whether Shift/Ctrl is held (web), for multi-select. A plain module flag (not a React ref)
// so the gesture/tap callbacks can read it without tripping the no-refs-in-render rule.
let multiKeyHeld = false;

interface Panel {
  id: string;
  r: number;
  c: number;
  rs: number;
  cs: number;
}
interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GRID_SIZES = [
  { label: '1×1', rows: 1, cols: 1 },
  { label: '2×2', rows: 2, cols: 2 },
  { label: '3×3', rows: 3, cols: 3 },
  { label: '3×4', rows: 3, cols: 4 },
  { label: '4×3', rows: 4, cols: 3 },
  { label: '4×4', rows: 4, cols: 4 },
];

const GUIDE: { keys: string; action: string }[] = [
  { keys: 'Drag canvas', action: 'Pan / reframe the image' },
  { keys: '+ / −  (or scroll)', action: 'Zoom in / out' },
  { keys: 'Click a piece', action: 'Select it' },
  { keys: 'Shift / Ctrl-click', action: 'Add to selection (web)' },
  { keys: 'M  ·  Merge', action: 'Join selected into one panel' },
  { keys: 'B  ·  Split', action: 'Break a panel into pieces' },
  { keys: 'Esc', action: 'Clear selection' },
  { keys: 'Grid', action: 'Choose 2×2 … 4×4' },
  { keys: 'Whole / Sliced', action: 'Preview mode' },
  { keys: 'Save', action: 'Add image to your library (this session)' },
  { keys: 'Place', action: 'Drop the panels into the binder' },
];

function makeGrid(rows: number, cols: number): Panel[] {
  const out: Panel[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) out.push({ id: uid('panel'), r, c, rs: 1, cs: 1 });
  }
  return out;
}

function panelCrop(p: Panel, rows: number, cols: number, win: Win): Win {
  return {
    x: win.x + (p.c / cols) * win.w,
    y: win.y + (p.r / rows) * win.h,
    w: (p.cs / cols) * win.w,
    h: (p.rs / rows) * win.h,
  };
}

function cropStyle(crop: Win) {
  return {
    position: 'absolute' as const,
    width: `${100 / crop.w}%` as DimensionValue,
    height: `${100 / crop.h}%` as DimensionValue,
    left: `${(-crop.x / crop.w) * 100}%` as DimensionValue,
    top: `${(-crop.y / crop.h) * 100}%` as DimensionValue,
  };
}

interface SliceStudioProps {
  rows: number;
  cols: number;
  imageUrl?: string;
  onPlace: (panels: ArtPanelInput[]) => void;
  onClose: () => void;
}

export function SliceStudio({ rows: initRows, cols: initCols, imageUrl: initUrl, onPlace, onClose }: SliceStudioProps) {
  const { width } = useWindowDimensions();
  const wide = width > 760;

  const [rows, setRows] = useState(initRows);
  const [cols, setCols] = useState(initCols);
  const [imageUrl, setImageUrl] = useState(initUrl ?? '');
  const [urlInput, setUrlInput] = useState('');
  const [win, setWin] = useState<Win>({ x: 0, y: 0, w: 1, h: 1 });
  // How the art fills its pocket(s): 'cover' fills edge-to-edge (crop overflow, pan/zoom to frame),
  // 'contain' shows the whole image at its original aspect (letterboxed, nothing cropped).
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const [panels, setPanels] = useState<Panel[]>(() => makeGrid(initRows, initCols));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sliced, setSliced] = useState(true);
  const [failed, setFailed] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  // Pick official card art from the catalog as the source image (then crop/zoom to the art).
  const [cardPickOpen, setCardPickOpen] = useState(false);
  const { catalog } = useCatalog(cardPickOpen);
  const [dropActive, setDropActive] = useState(false);
  const loadImage = useCallback((url: string) => {
    setImageUrl(url);
    setFailed(false);
    setUrlInput('');
  }, []);

  const openGallery = useCallback((url: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    else void Linking.openURL(url);
  }, []);

  // Web: drop an image (or its URL) dragged from anywhere — e.g. an Art of Pokémon tab — onto the
  // studio to load it. The studio is a full-screen modal, so a drop while it's open is for us.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDropActive(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropActive(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDropActive(false);
      const dt = e.dataTransfer;
      if (!dt) return;
      let url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').trim();
      if (!/^https?:\/\//i.test(url)) {
        const html = dt.getData('text/html');
        const m = html ? html.match(/<img[^>]+src=["']([^"']+)["']/i) : null;
        url = m ? m[1] : '';
      }
      if (/^https?:\/\//i.test(url)) {
        loadImage(url);
        return;
      }
      const file = dt.files && dt.files[0];
      if (file && file.type.startsWith('image/')) loadImage(URL.createObjectURL(file));
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [loadImage]);

  // Canvas size: fit a page-shaped grid into the available area.
  const guideW = wide ? 248 : 0;
  const canvasW = Math.min(width - guideW - 48, 460);
  const cellW = (canvasW - GAP * (cols - 1)) / cols;
  const cellH = cellW * CARD_ASPECT;
  const canvasH = cellH * rows + GAP * (rows - 1);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      if (!canvasW || !canvasH) return;
      setWin((prev) => ({
        ...prev,
        x: clampAxis(prev.x - (dx / canvasW) * prev.w, prev.w),
        y: clampAxis(prev.y - (dy / canvasH) * prev.h, prev.h),
      }));
    },
    [canvasW, canvasH],
  );

  const zoomBy = useCallback((factor: number) => {
    setWin((prev) => {
      const w = clamp(prev.w * factor, 0.18, 1);
      const h = clamp(prev.h * factor, 0.18, 1);
      return {
        w,
        h,
        x: clampAxis(prev.x + (prev.w - w) / 2, w),
        y: clampAxis(prev.y + (prev.h - h) / 2, h),
      };
    });
  }, []);

  const selectAt = useCallback(
    (x: number, y: number) => {
      if (!cellW) return;
      const c = clamp(Math.floor(x / (cellW + GAP)), 0, cols - 1);
      const r = clamp(Math.floor(y / (cellH + GAP)), 0, rows - 1);
      const panel = panels.find((p) => r >= p.r && r < p.r + p.rs && c >= p.c && c < p.c + p.cs);
      if (!panel) return;
      setSelected((sel) => {
        const next = new Set(sel);
        if (multiKeyHeld) {
          if (next.has(panel.id)) next.delete(panel.id);
          else next.add(panel.id);
        } else {
          next.clear();
          next.add(panel.id);
        }
        return next;
      });
    },
    [cellW, cellH, rows, cols, panels],
  );

  const merge = useCallback(() => {
    setPanels((ps) => {
      const chosen = ps.filter((p) => selected.has(p.id));
      if (chosen.length < 2) return ps;
      const minR = Math.min(...chosen.map((p) => p.r));
      const maxR = Math.max(...chosen.map((p) => p.r + p.rs));
      const minC = Math.min(...chosen.map((p) => p.c));
      const maxC = Math.max(...chosen.map((p) => p.c + p.cs));
      const bboxCells = (maxR - minR) * (maxC - minC);
      const selCells = chosen.reduce((n, p) => n + p.rs * p.cs, 0);
      const others = ps.filter((p) => !selected.has(p.id));
      const overlaps = others.some(
        (p) => p.r < maxR && p.r + p.rs > minR && p.c < maxC && p.c + p.cs > minC,
      );
      if (selCells !== bboxCells || overlaps) return ps; // selection isn't a clean rectangle
      return [...others, { id: uid('panel'), r: minR, c: minC, rs: maxR - minR, cs: maxC - minC }];
    });
    setSelected(new Set());
  }, [selected]);

  const split = useCallback(() => {
    setPanels((ps) => {
      const out: Panel[] = [];
      for (const p of ps) {
        if (selected.has(p.id) && (p.rs > 1 || p.cs > 1)) {
          for (let i = 0; i < p.rs; i += 1) {
            for (let j = 0; j < p.cs; j += 1) out.push({ id: uid('panel'), r: p.r + i, c: p.c + j, rs: 1, cs: 1 });
          }
        } else {
          out.push(p);
        }
      }
      return out;
    });
    setSelected(new Set());
  }, [selected]);

  const setGrid = useCallback((r: number, c: number) => {
    setRows(r);
    setCols(c);
    setPanels(makeGrid(r, c));
    setSelected(new Set());
  }, []);

  const reset = useCallback(() => {
    setPanels(makeGrid(rows, cols));
    setSelected(new Set());
    setWin({ x: 0, y: 0, w: 1, h: 1 });
  }, [rows, cols]);

  const setFitMode = useCallback((mode: 'cover' | 'contain') => {
    setFit(mode);
    if (mode === 'contain') setWin({ x: 0, y: 0, w: 1, h: 1 }); // whole image, no windowing
  }, []);

  // Quick-crop to a card's illustration: fill mode + the standard art window, then pan/zoom to taste.
  const justTheArt = useCallback(() => {
    setFit('cover');
    setSliced(true);
    setWin(ART_WINDOW);
  }, []);

  const loadUrl = useCallback(() => {
    const u = urlInput.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) return;
    setImageUrl(u);
    setFailed(false);
    setUrlInput('');
  }, [urlInput]);

  const save = useCallback(() => {
    if (!imageUrl) return;
    const aspect: ArtAspect = cols > rows ? 'landscape' : rows > cols ? 'portrait' : 'square';
    addSavedArt({
      id: `saved-${uid('art')}`,
      url: imageUrl,
      title: `${domainOf(imageUrl)} art`,
      themes: ['saved'],
      aspect,
      sourceDomain: domainOf(imageUrl),
      license: 'Unverified — review',
      licenseClear: false,
    });
    setSavedNote(true);
  }, [imageUrl, rows, cols]);

  const place = useCallback(() => {
    if (!imageUrl) return;
    if (fit === 'contain') {
      // Original aspect: one panel spanning the whole grid footprint, whole image, no crop.
      onPlace([{ r: 0, c: 0, rs: rows, cs: cols, imageUrl, crop: { x: 0, y: 0, w: 1, h: 1 }, fit: 'contain' }]);
      return;
    }
    const out: ArtPanelInput[] = panels.map((p) => ({
      r: p.r,
      c: p.c,
      rs: p.rs,
      cs: p.cs,
      imageUrl,
      crop: panelCrop(p, rows, cols, win),
      fit: 'cover',
    }));
    onPlace(out);
  }, [imageUrl, fit, panels, rows, cols, win, onPlace]);

  // Web: keyboard shortcuts + tracking Shift/Ctrl for multi-select.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const sync = (e: KeyboardEvent) => {
      multiKeyHeld = e.shiftKey || e.ctrlKey || e.metaKey;
    };
    const down = (e: KeyboardEvent) => {
      sync(e);
      const k = e.key.toLowerCase();
      if (k === 'm') merge();
      else if (k === 'b') split();
      else if (e.key === 'Escape') setSelected(new Set());
      else if (e.key === '+' || e.key === '=') zoomBy(0.85);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / 0.85);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', sync);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', sync);
    };
  }, [merge, split, zoomBy]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().onChange((e) => {
      runOnJS(panBy)(e.changeX, e.changeY);
    });
    const tap = Gesture.Tap().onEnd((e) => {
      runOnJS(selectAt)(e.x, e.y);
    });
    return Gesture.Exclusive(pan, tap);
  }, [panBy, selectAt]);

  const box = (p: Panel) => ({
    position: 'absolute' as const,
    left: p.c * (cellW + GAP),
    top: p.r * (cellH + GAP),
    width: p.cs * cellW + (p.cs - 1) * GAP,
    height: p.rs * cellH + (p.rs - 1) * GAP,
  });

  const guide = (
    <View style={[styles.guide, wide ? styles.guideSide : styles.guideBottom]}>
      <Text style={styles.guideTitle}>Controls</Text>
      {GUIDE.map((g) => (
        <View key={g.keys} style={styles.guideRow}>
          <Text style={styles.guideKeys}>{g.keys}</Text>
          <Text style={styles.guideAction}>{g.action}</Text>
        </View>
      ))}
      {Platform.OS !== 'web' ? (
        <Text style={styles.guideNote}>Keyboard / Shift / Ctrl shortcuts are web-only — use the buttons on touch.</Text>
      ) : null}
    </View>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.headerAction}>Close</Text>
          </Pressable>
          <ThemedText type="subtitle">Slice studio</ThemedText>
          <Pressable onPress={place} hitSlop={10} disabled={!imageUrl}>
            <Text style={[styles.headerAction, styles.primary, !imageUrl && styles.disabled]}>Place</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Toolbar */}
          <View style={styles.toolbar}>
            <Btn label="🎴 Card art" onPress={() => setCardPickOpen(true)} kind="primary" />
            <Btn label="Art of Pokémon ↗" onPress={() => openGallery(ART_OF_PKM_URL)} />
            <Btn label="Pinterest ↗" onPress={() => openGallery(PINTEREST_URL)} />
            <Btn label="Card sleeves ↗" onPress={() => openGallery(POKEMON_CENTER_SLEEVES_URL)} />
            <ArtUploadButton onUploaded={loadImage} />
            <TextInput
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="…or paste an image URL"
              placeholderTextColor={Palette.muted3}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Btn label="Load" onPress={loadUrl} />
          </View>
          {Platform.OS === 'web' ? (
            <Text style={styles.dragHint}>
              Tip: open “Art of Pokémon ↗” or “Pinterest ↗” in another tab and drag any image
              straight onto this window to load it.
            </Text>
          ) : null}
          <View style={styles.toolbar}>
            <Text style={styles.tLabel}>Grid</Text>
            {GRID_SIZES.map((g) => (
              <Chip
                key={g.label}
                label={g.label}
                active={rows === g.rows && cols === g.cols}
                onPress={() => setGrid(g.rows, g.cols)}
              />
            ))}
          </View>
          <View style={styles.toolbar}>
            <Text style={styles.tLabel}>Fit</Text>
            <Chip label="Scale to fit" active={fit === 'cover'} onPress={() => setFitMode('cover')} />
            <Chip label="Original aspect" active={fit === 'contain'} onPress={() => setFitMode('contain')} />
            <Btn label="Just the art" onPress={justTheArt} disabled={!imageUrl} />
          </View>
          <Text style={styles.dragHint}>
            Scale to fit fills the pocket edge-to-edge (crops the overflow — drag to reframe).
            Original aspect keeps the whole image, nothing cropped.
          </Text>
          <View style={styles.toolbar}>
            <Text style={styles.tLabel}>View</Text>
            <Chip label="Whole" active={!sliced} onPress={() => setSliced(false)} />
            <Chip label="Sliced" active={sliced} onPress={() => setSliced(true)} />
            <Text style={styles.tLabel}>Zoom</Text>
            <Btn label="−" onPress={() => zoomBy(1 / 0.85)} disabled={fit === 'contain'} />
            <Btn label="+" onPress={() => zoomBy(0.85)} disabled={fit === 'contain'} />
          </View>
          <View style={styles.toolbar}>
            <Btn label="Merge" onPress={merge} disabled={selected.size < 2} />
            <Btn label="Split" onPress={split} disabled={selected.size === 0} />
            <Btn label="Reset" onPress={reset} />
            <Btn label={savedNote ? 'Saved ✓' : 'Save to library'} onPress={save} disabled={!imageUrl} />
          </View>

          <View style={wide ? styles.bodyRow : styles.bodyCol}>
            {/* Canvas */}
            <View style={styles.canvasWrap}>
              {!imageUrl ? (
                <View style={[styles.canvas, { width: canvasW, height: canvasH }, styles.empty]}>
                  <Text style={styles.emptyText}>Pick card art, upload, or paste a URL to begin</Text>
                </View>
              ) : (
                <GestureDetector gesture={gesture}>
                  <View style={[styles.canvas, { width: canvasW, height: canvasH }]}>
                    {failed ? (
                      <View style={[styles.empty, StyleSheet.absoluteFill]}>
                        <Text style={styles.emptyText}>image didn’t load</Text>
                      </View>
                    ) : fit === 'contain' ? (
                      // Original aspect — the whole image, letterboxed into the pocket footprint.
                      <View style={[StyleSheet.absoluteFill, styles.pieceClip]}>
                        <Image
                          source={{ uri: imageUrl }}
                          style={StyleSheet.absoluteFill}
                          contentFit="contain"
                          onError={() => setFailed(true)}
                        />
                      </View>
                    ) : !sliced ? (
                      // Whole preview — one image showing the current window.
                      <View style={[StyleSheet.absoluteFill, styles.pieceClip]}>
                        <Image
                          source={{ uri: imageUrl }}
                          style={cropStyle(win)}
                          contentFit="cover"
                          onError={() => setFailed(true)}
                        />
                      </View>
                    ) : (
                      panels.map((p) => {
                        const sel = selected.has(p.id);
                        return (
                          <View key={p.id} style={[box(p), styles.pieceClip, sel && styles.pieceSelected]}>
                            <Image
                              source={{ uri: imageUrl }}
                              style={cropStyle(panelCrop(p, rows, cols, win))}
                              contentFit="cover"
                              onError={() => setFailed(true)}
                            />
                          </View>
                        );
                      })
                    )}
                  </View>
                </GestureDetector>
              )}
              <Text style={styles.hint}>
                {selected.size > 0
                  ? `${selected.size} selected — Merge to join, Split to break`
                  : 'Drag to pan · click a piece to select'}
              </Text>
            </View>

            {guide}
          </View>
        </ScrollView>

        {dropActive ? (
          <View pointerEvents="none" style={styles.dropOverlay}>
            <Text style={styles.dropOverlayText}>Drop image to load</Text>
          </View>
        ) : null}

        {cardPickOpen ? (
          <Modal visible transparent animationType="slide" onRequestClose={() => setCardPickOpen(false)}>
            <View style={styles.cardPickBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setCardPickOpen(false)} />
              <ThemedView type="backgroundElement" style={styles.cardPickSheet}>
                <View style={styles.cardPickHeader}>
                  <ThemedText type="subtitle">Choose card art</ThemedText>
                  <Pressable onPress={() => setCardPickOpen(false)} hitSlop={10}>
                    <Text style={[styles.headerAction, styles.primary]}>Close</Text>
                  </Pressable>
                </View>
                {catalog ? (
                  <CardBrowse
                    catalog={catalog}
                    onPickCard={(id) => {
                      loadImage(cardThumbUrl(id, 'full'));
                      setCardPickOpen(false);
                    }}
                  />
                ) : (
                  <View style={styles.cardPickLoading}>
                    <ActivityIndicator />
                  </View>
                )}
              </ThemedView>
            </View>
          </Modal>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function Btn({
  label,
  onPress,
  kind = 'default',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  kind?: 'default' | 'primary';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        controlButton.base,
        kind === 'primary' && controlButton.primary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={[controlButton.text, kind === 'primary' && controlButton.primaryText]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[pillChip.base, active && pillChip.active]}>
      <Text style={[pillChip.text, active && pillChip.textActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerAction: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.ink2 },
  primary: { color: Palette.accent },
  disabled: { opacity: 0.4 },
  scroll: { padding: 16, gap: 10 },
  toolbar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  tLabel: { fontSize: FontSize.label, color: Palette.muted, marginRight: 2 },
  input: {
    flex: 1,
    minWidth: 160,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: FontSize.body,
    color: Palette.ink,
  },
  pressed: { opacity: 0.7 },
  bodyRow: { flexDirection: 'row', gap: 16, marginTop: 6 },
  bodyCol: { flexDirection: 'column', gap: 16, marginTop: 6 },
  canvasWrap: { alignItems: 'center', flexShrink: 1 },
  canvas: { backgroundColor: Palette.chrome, borderRadius: Radius.panel, overflow: 'hidden' },
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.chrome, borderRadius: Radius.panel },
  emptyText: { color: Palette.onDarkMuted, fontSize: FontSize.label },
  pieceClip: { overflow: 'hidden', borderRadius: Radius.thumb, backgroundColor: Palette.chromeDeepest },
  pieceSelected: { borderWidth: 2, borderColor: Palette.accent },
  hint: { marginTop: 8, fontSize: FontSize.base, color: Palette.muted2, textAlign: 'center' },
  guide: { backgroundColor: Palette.panelAlt, borderRadius: Radius.panel, padding: 14 },
  guideSide: { width: 248 },
  guideBottom: { width: '100%' },
  guideTitle: { fontSize: FontSize.label, fontWeight: Weight.bold, color: Palette.ink3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  guideRow: { marginBottom: 8 },
  guideKeys: { fontSize: FontSize.base, fontWeight: Weight.bold, color: Palette.accent },
  guideAction: { fontSize: FontSize.base, color: Palette.ink4 },
  guideNote: { fontSize: FontSize.sm, color: Palette.muted3, marginTop: 6, lineHeight: 16 },
  cardPickBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Palette.scrim40 },
  cardPickSheet: {
    height: '82%',
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  cardPickHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardPickLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dragHint: { fontSize: FontSize.sm, color: Palette.muted3, lineHeight: 16 },
  dropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.scrim40,
    borderWidth: 3,
    borderColor: Palette.accent,
    borderStyle: 'dashed',
  },
  dropOverlayText: { color: Palette.white, fontSize: FontSize.h2, fontWeight: Weight.bold },
});
