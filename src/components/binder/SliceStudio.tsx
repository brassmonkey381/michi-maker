import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image as RNImage,
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
import { uid, type ImageTransform } from '@/data/binderTypes';
import { addSavedArt } from '@/data/savedArt';
import { useCatalog } from '@/hooks/use-catalog';
import { cardThumbUrl } from '@/lib/catalogConfig';
import type { ArtPanelInput } from '@/store/binders';

const CARD_ASPECT = 88 / 63;
const GAP = 6;
const MAX_GRID = 6;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Rot = ImageTransform['rot'];

/** Rough illustration window of a standard (non-full-art) Pokémon card, as fractions of the full
 *  card image — the starting crop for "Just the art". Pan/zoom to fine-tune per card. */
const ART_WINDOW: Win = { x: 0.06, y: 0.11, w: 0.88, h: 0.42 };
/** How far the crop window may travel past the image edge, as a fraction of the window. Lets you
 *  pan art partly out of frame — and pan at all when not zoomed in — while keeping ≥15% overlapping. */
const OVER = 0.85;
const clampAxis = (v: number, size: number) => clamp(v, -OVER * size, 1 - size + OVER * size);

/**
 * External galleries to pull art from — one modal instead of a button per site. `dragFriendly`
 * marks hosts whose images reliably load when dragged/pasted straight into the studio; the rest
 * often block hotlinking (403 → blank pocket), so the modal steers those users to save + Upload.
 */
const ART_SOURCES: { title: string; blurb: string; url: string; dragFriendly: boolean }[] = [
  {
    title: 'Art of Pokémon',
    url: 'https://www.artofpkm.com/artwork/all',
    blurb: 'Curated official artwork, browsable by artist and era.',
    dragFriendly: true,
  },
  {
    title: 'Bulbagarden Archives',
    url: 'https://archives.bulbagarden.net/wiki/Main_Page',
    blurb: 'The Bulbapedia media library — official art, set logos, and scans for every Pokémon.',
    dragFriendly: true,
  },
  {
    title: 'Pokémon Center card sleeves',
    url: 'https://www.pokemoncenter.com/category/card-sleeves',
    blurb: 'Official sleeve art — ready-made card-shaped designs.',
    dragFriendly: true,
  },
  {
    title: 'Pinterest',
    url: 'https://www.pinterest.com/ideas/pokemon-pictures/931192954917/',
    blurb: 'Broad fan-curated feed. Open a pin full-size before dragging it over.',
    dragFriendly: false,
  },
  {
    title: 'DeviantArt',
    url: 'https://www.deviantart.com/search?q=pokemon',
    blurb: 'Fan art in every style. May block direct loading — save, then ⬆ Upload.',
    dragFriendly: false,
  },
];

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
  { keys: 'R  ·  ⟲ ⟳', action: 'Rotate 90°' },
  { keys: 'Flip ↔ / ↕', action: 'Mirror the image' },
  { keys: 'Click a piece', action: 'Select it' },
  { keys: 'Shift / Ctrl-click', action: 'Add to selection (web)' },
  { keys: 'M  ·  Merge', action: 'Join selected into one panel' },
  { keys: 'B  ·  Split', action: 'Break a panel into pieces' },
  { keys: 'Esc', action: 'Clear selection' },
  { keys: 'Grid', action: 'Presets, or step rows/cols to 6×6' },
  { keys: 'Whole / Sliced', action: 'Preview = exactly what Place places' },
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

/**
 * The source image drawn inside one clip box (a slice piece, or the whole canvas): sized so the
 * FULL image spans `1/crop.w × 1/crop.h` of the box and offset so the box shows just its window,
 * with the rotation/flip transform applied around the centre. All in px (the caller knows its
 * box), because percentage boxes can't express a quarter-turn's width/height swap.
 *
 * When `exact` (natural size known ⇒ the window was built aspect-true) the image fills its box
 * with 'fill' — no hidden cropping, letterbox regions simply fall outside the image box. Without
 * it we fall back to the legacy cover/contain behaviour.
 */
function SourceImage({
  uri,
  boxW,
  boxH,
  crop,
  rot,
  flipH,
  flipV,
  exact,
  fallbackFit,
  onError,
}: {
  uri: string;
  boxW: number;
  boxH: number;
  crop: Win;
  rot: Rot;
  flipH: boolean;
  flipV: boolean;
  exact: boolean;
  fallbackFit: 'cover' | 'contain';
  onError: () => void;
}) {
  const cw = Math.max(0.02, crop.w);
  const ch = Math.max(0.02, crop.h);
  const W = boxW / cw;
  const H = boxH / ch;
  const left = -(crop.x / cw) * boxW;
  const top = -(crop.y / ch) * boxH;
  // A quarter turn swaps the element's width/height; lay it out pre-rotation and let the
  // centre-anchored rotate land it exactly on the intended (left, top, W, H) box.
  const quarter = rot === 90 || rot === 270;
  const style = {
    position: 'absolute' as const,
    width: quarter ? H : W,
    height: quarter ? W : H,
    left: quarter ? left + (W - H) / 2 : left,
    top: quarter ? top + (H - W) / 2 : top,
    transform: [
      { rotate: `${rot}deg` },
      { scaleX: flipH ? -1 : 1 },
      { scaleY: flipV ? -1 : 1 },
    ],
  };
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={exact ? 'fill' : fallbackFit}
      draggable={false}
      onError={onError}
    />
  );
}

interface SliceStudioProps {
  rows: number;
  cols: number;
  imageUrl?: string;
  onPlace: (panels: ArtPanelInput[]) => void;
  onClose: () => void;
}

export function SliceStudio({ rows: initRows, cols: initCols, imageUrl: initUrl, onPlace, onClose }: SliceStudioProps) {
  const { width, height } = useWindowDimensions();
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
  // The source image's natural pixel size (via Image.getSize) — the key to true-aspect windows
  // (no accidental stretching) and to rotation. Null until it resolves; everything falls back.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // Lossless orientation: quarter-turn rotation + mirror flips, applied at render time only —
  // the original image is never modified.
  const [rot, setRot] = useState<Rot>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Pick official card art from the catalog as the source image (then crop/zoom to the art).
  const [cardPickOpen, setCardPickOpen] = useState(false);
  const { catalog } = useCatalog(cardPickOpen);
  const [dropActive, setDropActive] = useState(false);
  const loadImage = useCallback((url: string) => {
    setImageUrl(url);
    setFailed(false);
    setUrlInput('');
    setRot(0);
    setFlipH(false);
    setFlipV(false);
  }, []);

  const openGallery = useCallback((url: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    else void Linking.openURL(url);
  }, []);

  // Resolve the image's natural size — re-runs per source. getSize failing (odd host / blob
  // quirk) just leaves `natural` null and the studio behaves like before this feature.
  /* eslint-disable react-hooks/set-state-in-effect -- reset + async resolve per source image */
  useEffect(() => {
    setNatural(null);
    if (!imageUrl) return;
    let stale = false;
    RNImage.getSize(
      imageUrl,
      (w, h) => {
        if (!stale && w > 0 && h > 0) setNatural({ w, h });
      },
      () => {},
    );
    return () => {
      stale = true;
    };
  }, [imageUrl]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  // Workspace: fill what the viewport allows — capped by BOTH width and height so the whole
  // page-shaped grid stays on screen below the toolbars (vs the old fixed 460px cap).
  const guideW = wide ? 248 : 0;
  const availW = Math.max(240, Math.min(width - guideW - 48, 900));
  const availH = Math.max(300, height - 360);
  const cellW = Math.min(
    (availW - GAP * (cols - 1)) / cols,
    (availH - GAP * (rows - 1)) / rows / CARD_ASPECT,
  );
  const cellH = cellW * CARD_ASPECT;
  const canvasW = cellW * cols + GAP * (cols - 1);
  const canvasH = cellH * rows + GAP * (rows - 1);

  // --- true-aspect crop windows -------------------------------------------------------------
  // The window lives in fractions of the (rotated) image. `ratio` is the h-per-w a window needs
  // for its content to render true-to-aspect on this canvas; 0 while the natural size is unknown.
  const natT = useMemo(
    () => (natural ? (rot === 90 || rot === 270 ? { w: natural.h, h: natural.w } : natural) : null),
    [natural, rot],
  );
  const ratio = natT && canvasW > 0 && canvasH > 0 ? (canvasH / canvasW) * (natT.w / natT.h) : 0;
  /** Largest true-aspect window fully inside the image — "Scale to fit"'s starting frame. */
  const coverWin = useMemo<Win>(() => {
    if (!ratio) return { x: 0, y: 0, w: 1, h: 1 };
    const w = Math.min(1, 1 / ratio);
    const h = w * ratio;
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }, [ratio]);
  /** Smallest true-aspect window CONTAINING the whole image — "Original aspect" (letterboxed). */
  const containWin = useMemo<Win>(() => {
    if (!ratio) return { x: 0, y: 0, w: 1, h: 1 };
    const w = Math.max(1, 1 / ratio);
    const h = w * ratio;
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }, [ratio]);

  // Re-frame when the source, rotation, fit mode, or canvas aspect changes. 'contain' pins the
  // window to the whole image; 'cover' starts from the best-fill frame (then pan/zoom freely).
  const skipSnap = useRef(false);
  useEffect(() => {
    if (skipSnap.current) {
      skipSnap.current = false;
      return;
    }
    setWin(fit === 'contain' ? containWin : coverWin);
  }, [fit, containWin, coverWin]);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      if (fit === 'contain') return; // whole image, locked frame
      if (!canvasW || !canvasH) return;
      setWin((prev) => ({
        ...prev,
        x: clampAxis(prev.x - (dx / canvasW) * prev.w, prev.w),
        y: clampAxis(prev.y - (dy / canvasH) * prev.h, prev.h),
      }));
    },
    [fit, canvasW, canvasH],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      if (fit === 'contain') return;
      setWin((prev) => {
        // Uniform scale so the window keeps its true aspect. Zoom-in floor ~1/8 of the image;
        // zoom-out ceiling a bit past "whole image" so you can frame with a margin.
        const maxW = ratio ? containWin.w * 1.35 : 1;
        const maxH = ratio ? containWin.h * 1.35 : 1;
        const s = clamp(
          factor,
          0.12 / Math.max(prev.w, prev.h),
          Math.min(maxW / prev.w, maxH / prev.h),
        );
        const w = prev.w * s;
        const h = prev.h * s;
        return {
          w,
          h,
          x: clampAxis(prev.x + (prev.w - w) / 2, w),
          y: clampAxis(prev.y + (prev.h - h) / 2, h),
        };
      });
    },
    [fit, ratio, containWin],
  );

  const rotate = useCallback(
    (dir: 1 | -1) => {
      if (!natural) return; // the width/height swap needs the natural size to render correctly
      setRot((r) => ((((r + dir * 90) % 360) + 360) % 360) as Rot);
    },
    [natural],
  );

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
    const nr = clamp(r, 1, MAX_GRID);
    const nc = clamp(c, 1, MAX_GRID);
    setRows(nr);
    setCols(nc);
    setPanels(makeGrid(nr, nc));
    setSelected(new Set());
  }, []);

  const reset = useCallback(() => {
    setPanels(makeGrid(rows, cols));
    setSelected(new Set());
    setRot(0);
    setFlipH(false);
    setFlipV(false);
    setWin(fit === 'contain' ? containWin : coverWin);
  }, [rows, cols, fit, containWin, coverWin]);

  // Quick-crop to a card's illustration: fill mode + the standard art window, then pan/zoom to taste.
  const justTheArt = useCallback(() => {
    if (fit !== 'cover') skipSnap.current = true; // the mode-change snap would clobber this frame
    setFit('cover');
    setSliced(true);
    if (ratio) {
      // Keep the art window's width and centre; correct its height to true aspect.
      const h = ART_WINDOW.w * ratio;
      setWin({ x: ART_WINDOW.x, w: ART_WINDOW.w, h, y: ART_WINDOW.y + ART_WINDOW.h / 2 - h / 2 });
    } else {
      setWin(ART_WINDOW);
    }
  }, [fit, ratio]);

  const loadUrl = useCallback(() => {
    const u = urlInput.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) return;
    loadImage(u);
  }, [urlInput, loadImage]);

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
    const transform: ImageTransform | undefined =
      rot !== 0 || flipH || flipV
        ? { rot, ...(flipH ? { flipH: true } : {}), ...(flipV ? { flipV: true } : {}) }
        : undefined;
    // WYSIWYG: the Whole view places ONE panel spanning the grid footprint showing the current
    // frame; the Sliced view places one slot per piece. 'Original aspect' letterboxing is baked
    // into the window — unless the natural size never resolved, where the legacy runtime-contain
    // single panel is still the correct fallback.
    if (!sliced) {
      const legacyContain = fit === 'contain' && !ratio;
      onPlace([
        {
          r: 0,
          c: 0,
          rs: rows,
          cs: cols,
          imageUrl,
          crop: legacyContain ? { x: 0, y: 0, w: 1, h: 1 } : win,
          fit: legacyContain ? 'contain' : 'cover',
          transform,
        },
      ]);
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
      transform,
    }));
    onPlace(out);
  }, [imageUrl, rot, flipH, flipV, sliced, fit, ratio, panels, rows, cols, win, onPlace]);

  // Web: keyboard shortcuts + tracking Shift/Ctrl for multi-select.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const sync = (e: KeyboardEvent) => {
      multiKeyHeld = e.shiftKey || e.ctrlKey || e.metaKey;
    };
    const down = (e: KeyboardEvent) => {
      sync(e);
      // Don't hijack typing in the URL field (an "m" there must not merge panels).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'm') merge();
      else if (k === 'b') split();
      else if (k === 'r') rotate(1);
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
  }, [merge, split, rotate, zoomBy]);

  // Web: scroll wheel over the canvas zooms (the guide promised it; now it's true).
  const canvasWrapRef = useRef<View | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !imageUrl) return;
    const node = canvasWrapRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? 1 / 0.9 : 0.9);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [zoomBy, imageUrl]);

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
            <Btn label="🖼 Art sources ↗" onPress={() => setSourcesOpen(true)} />
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
              Tip: open any gallery from “Art sources ↗” in another tab and drag an image straight
              onto this window to load it.
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
            <Text style={styles.tLabel}>
              {rows}×{cols}
            </Text>
            <Btn label="Rows −" onPress={() => setGrid(rows - 1, cols)} disabled={rows <= 1} />
            <Btn label="Rows +" onPress={() => setGrid(rows + 1, cols)} disabled={rows >= MAX_GRID} />
            <Btn label="Cols −" onPress={() => setGrid(rows, cols - 1)} disabled={cols <= 1} />
            <Btn label="Cols +" onPress={() => setGrid(rows, cols + 1)} disabled={cols >= MAX_GRID} />
          </View>
          <View style={styles.toolbar}>
            <Text style={styles.tLabel}>Fit</Text>
            <Chip label="Scale to fit" active={fit === 'cover'} onPress={() => setFit('cover')} />
            <Chip label="Original aspect" active={fit === 'contain'} onPress={() => setFit('contain')} />
            <Btn label="Just the art" onPress={justTheArt} disabled={!imageUrl} />
          </View>
          <Text style={styles.dragHint}>
            Scale to fit frames a window of the image (pan / zoom / scroll to reframe). Original
            aspect always shows the whole image, letterboxed. Both work Whole or Sliced — and your
            original image is never modified, only windowed.
          </Text>
          <View style={styles.toolbar}>
            <Text style={styles.tLabel}>View</Text>
            <Chip label="Whole" active={!sliced} onPress={() => setSliced(false)} />
            <Chip label="Sliced" active={sliced} onPress={() => setSliced(true)} />
            <Text style={styles.tLabel}>Zoom</Text>
            <Btn label="−" onPress={() => zoomBy(1 / 0.85)} disabled={fit === 'contain'} />
            <Btn label="+" onPress={() => zoomBy(0.85)} disabled={fit === 'contain'} />
            <Text style={styles.tLabel}>Rotate</Text>
            <Btn label="⟲" onPress={() => rotate(-1)} disabled={!natural} />
            <Btn label="⟳" onPress={() => rotate(1)} disabled={!natural} />
            {rot !== 0 ? <Text style={styles.tLabel}>{rot}°</Text> : null}
            <Chip label="Flip ↔" active={flipH} onPress={() => setFlipH((v) => !v)} />
            <Chip label="Flip ↕" active={flipV} onPress={() => setFlipV((v) => !v)} />
          </View>
          <View style={styles.toolbar}>
            <Btn label="Merge" onPress={merge} disabled={selected.size < 2} />
            <Btn label="Split" onPress={split} disabled={selected.size === 0} />
            <Btn label="Reset" onPress={reset} />
            <Btn label={savedNote ? 'Saved ✓' : 'Save to library'} onPress={save} disabled={!imageUrl} />
          </View>

          <View style={wide ? styles.bodyRow : styles.bodyCol}>
            {/* Canvas */}
            <View ref={canvasWrapRef} style={styles.canvasWrap}>
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
                    ) : sliced ? (
                      // Sliced preview — one clip box per piece, regardless of fit mode.
                      panels.map((p) => {
                        const sel = selected.has(p.id);
                        const b = box(p);
                        return (
                          <View key={p.id} style={[b, styles.pieceClip, sel && styles.pieceSelected]}>
                            <SourceImage
                              uri={imageUrl}
                              boxW={b.width}
                              boxH={b.height}
                              crop={panelCrop(p, rows, cols, win)}
                              rot={rot}
                              flipH={flipH}
                              flipV={flipV}
                              exact={Boolean(ratio)}
                              fallbackFit="cover"
                              onError={() => setFailed(true)}
                            />
                          </View>
                        );
                      })
                    ) : (
                      // Whole preview — one image showing the current window.
                      <View style={[StyleSheet.absoluteFill, styles.pieceClip]}>
                        <SourceImage
                          uri={imageUrl}
                          boxW={canvasW}
                          boxH={canvasH}
                          crop={win}
                          rot={rot}
                          flipH={flipH}
                          flipV={flipV}
                          exact={Boolean(ratio)}
                          fallbackFit={fit === 'contain' ? 'contain' : 'cover'}
                          onError={() => setFailed(true)}
                        />
                      </View>
                    )}
                  </View>
                </GestureDetector>
              )}
              <Text style={styles.hint}>
                {selected.size > 0
                  ? `${selected.size} selected — Merge to join, Split to break`
                  : 'Drag to pan · scroll to zoom · click a piece to select'}
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

        {sourcesOpen ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setSourcesOpen(false)}>
            <View style={styles.sourcesBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setSourcesOpen(false)} />
              <ThemedView type="backgroundElement" style={styles.sourcesCard}>
                <View style={styles.cardPickHeader}>
                  <ThemedText type="subtitle">Art sources</ThemedText>
                  <Pressable onPress={() => setSourcesOpen(false)} hitSlop={10}>
                    <Text style={[styles.headerAction, styles.primary]}>Close</Text>
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.sourcesList}>
                  {ART_SOURCES.map((s) => (
                    <Pressable key={s.title} style={styles.sourceRow} onPress={() => openGallery(s.url)}>
                      <View style={styles.sourceRowHead}>
                        <Text style={styles.sourceTitle}>{s.title} ↗</Text>
                        <Text
                          style={[
                            styles.sourceTag,
                            s.dragFriendly ? styles.sourceTagGood : styles.sourceTagWarn,
                          ]}>
                          {s.dragFriendly ? 'drag-drop OK' : 'may block hotlinks'}
                        </Text>
                      </View>
                      <Text style={styles.sourceBlurb}>{s.blurb}</Text>
                    </Pressable>
                  ))}
                  <Text style={styles.guideNote}>
                    Open a source in its own tab, then drag any image straight onto the studio to
                    load it. If a host blocks direct loading, save the image and ⬆ Upload it
                    instead — uploads are stored with your binder, so they never break.
                  </Text>
                </ScrollView>
              </ThemedView>
            </View>
          </Modal>
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
  sourcesBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.scrim40,
    padding: 24,
  },
  sourcesCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '80%',
    borderRadius: Radius.sheet,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sourcesList: { gap: 10, paddingBottom: 12 },
  sourceRow: {
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.control,
    padding: 12,
    gap: 4,
  },
  sourceRowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sourceTitle: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.accent },
  sourceTag: { fontSize: FontSize.xs, fontWeight: Weight.semibold },
  sourceTagGood: { color: Palette.accent },
  sourceTagWarn: { color: Palette.muted2 },
  sourceBlurb: { fontSize: FontSize.sm, color: Palette.ink4, lineHeight: 17 },
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
