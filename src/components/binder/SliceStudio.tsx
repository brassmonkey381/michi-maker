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

import { SignInPerk } from '@/components/auth/SignInPerk';
import { ArtUploadButton } from '@/components/binder/ArtUploadButton';
import { CardBrowse } from '@/components/binder/CardBrowse';
import { UpgradePerk } from '@/components/monetization/UpgradePerk';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette, Radius, Weight, FontSize } from '@/constants/theme';
import { sheet } from '@/constants/ui';
import { importRemoteArtToBucket } from '@/lib/importArt';
import { uploadArtImage } from '@/lib/uploadArt';
import { deriveAttribution, domainOf, type ArtAttribution } from '@/data/artworkLibrary';
import { uid, uuidv4, type ImageTransform } from '@/data/binderTypes';
import type { SavedSlice } from '@/data/savedSlices';
import { TIER_LIMITS } from '@/data/tiers';
import { useCatalog } from '@/hooks/use-catalog';
import { cardThumbUrl } from '@/lib/catalogConfig';

const CARD_ASPECT = 88 / 63;
const GAP = 6;
// Two-column workspace (controls left, canvas right) once there's room — keeps the tall page-shaped
// canvas beside the toolbars instead of below them, so users don't scroll past the controls to
// reach their art. Below the breakpoint the layout stacks (controls over canvas), as before.
const TWO_COL_MIN = 800;
const CONTROLS_W = 380;
const COL_GAP = 16;
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
    blurb: 'The Bulbapedia media library: official art, set logos, and scans for every Pokémon.',
    dragFriendly: true,
  },
  {
    title: 'Pokémon Center card sleeves',
    url: 'https://www.pokemoncenter.com/category/card-sleeves',
    blurb: 'Official sleeve art: ready-made card-shaped designs.',
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
    blurb: 'Fan art in every style. May block direct loading. Save it, then Upload.',
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

const GUIDE: { keys: string; action: string }[] = [
  { keys: 'Drag canvas', action: 'Pan / reframe the image' },
  { keys: '+ / −  (or scroll)', action: 'Zoom in / out' },
  { keys: 'R  ·  ⟲ ⟳', action: 'Rotate 90°' },
  { keys: 'Flip ↔ / ↕', action: 'Mirror the image' },
  { keys: 'Click a piece', action: 'Select it' },
  { keys: 'Shift / Ctrl-click', action: 'Add to selection (web)' },
  { keys: 'M  ·  Merge', action: 'Join two side-by-side pieces into a folded 1×2' },
  { keys: 'B  ·  Split', action: 'Break a panel into pieces' },
  { keys: 'Del  ·  Remove', action: 'Drop selected pieces (they won’t go to the tray)' },
  { keys: 'Esc', action: 'Clear selection' },
  { keys: 'Whole / Sliced', action: 'Preview the frame whole, or cut into pieces' },
  { keys: 'Save slices', action: 'Send the pieces to your slice tray' },
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
  /** Save the studio's pieces to the slice tray (instead of placing them straight into the binder). */
  onSaveSlices: (slices: SavedSlice[]) => void;
  onClose: () => void;
  /** Live tray size + the account's artwork cap (Infinity = uncapped) — gates Save slices. */
  trayCount?: number;
  trayLimit?: number;
  /** Guests can't keep artworks (cap 0): show the sign-in note, never an upgrade pitch. */
  guest?: boolean;
  /** Render inline (inside the picker's Artwork tab) instead of as a full-screen modal: no outer
   *  Modal/SafeAreaView chrome and no Close button — the host sheet's tab bar handles navigation. */
  embedded?: boolean;
}

export function SliceStudio({
  rows,
  cols,
  imageUrl: initUrl,
  onSaveSlices,
  onClose,
  trayCount = 0,
  trayLimit = Infinity,
  guest = false,
  embedded = false,
}: SliceStudioProps) {
  const { width, height } = useWindowDimensions();

  // The grid is fixed to the binder's page size (passed in); slicing across the page is the point,
  // so the studio no longer re-chooses a grid.
  const [imageUrl, setImageUrl] = useState(initUrl ?? '');
  const [urlInput, setUrlInput] = useState('');
  const [win, setWin] = useState<Win>({ x: 0, y: 0, w: 1, h: 1 });
  // How the art fills its pocket(s): 'cover' fills edge-to-edge (crop overflow, pan/zoom to frame),
  // 'contain' shows the whole image at its original aspect (letterboxed, nothing cropped).
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const [panels, setPanels] = useState<Panel[]>(() => makeGrid(rows, cols));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sliced, setSliced] = useState(true);
  const [failed, setFailed] = useState(false);
  // The source image's natural pixel size (via Image.getSize) — the key to true-aspect windows
  // (no accidental stretching) and to rotation. Null until it resolves; everything falls back.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // Lossless orientation: quarter-turn rotation + mirror flips, applied at render time only —
  // the original image is never modified.
  const [rot, setRot] = useState<Rot>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // The controls/shortcuts reference now lives behind a header "?" (was a permanent right column).
  const [guideOpen, setGuideOpen] = useState(false);
  // Pick official card art from the catalog as the source image (then crop/zoom to the art).
  const [cardPickOpen, setCardPickOpen] = useState(false);
  const { catalog } = useCatalog(cardPickOpen);
  const [dropActive, setDropActive] = useState(false);
  // Measured width of the canvas column (two-column layout) — the accurate box to size the canvas
  // into once laid out; 0 until the first onLayout, when we fall back to an estimate.
  const [measuredCanvasW, setMeasuredCanvasW] = useState(0);
  // Measured height of the scroll viewport — in two-column mode the canvas sits BESIDE the controls,
  // so it can use the whole visible height. 0 until the first layout (then we fall back to a window
  // estimate). This is what lets the canvas fill the (now taller) sheet without vertical scrolling.
  const [viewportH, setViewportH] = useState(0);
  // Provenance for the loaded image. Required before a binder can go public (the source), the
  // artist optional but encouraged. Pre-filled from the URL where derivable (an artofpkm/pin
  // link), then editable. `srcName` remembers a platform label from a known asset.
  const [artist, setArtist] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [srcName, setSrcName] = useState('');
  // Provenance class of the loaded image — 'external' (URL-pulled → PRIVATE) or 'upload' (a file
  // the user brought → public-eligible). Drives the tray PRIVATE badge + the sharing gate.
  const [origin, setOrigin] = useState<ArtAttribution['origin']>(undefined);
  // While a pasted/dragged remote image is being fetched INTO the user's own bucket (we host what
  // the user brings — never a hotlink). Shows a spinner; errors surface an "Upload instead" note.
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const loadImage = useCallback((url: string, seed?: ArtAttribution) => {
    setImageUrl(url);
    setFailed(false);
    setUrlInput('');
    setRot(0);
    setFlipH(false);
    setFlipV(false);
    // Seed the credit fields: an asset's known attribution wins; else derive from the URL.
    const a = seed ?? deriveAttribution(url);
    setArtist(a.artist ?? '');
    setSourceUrl(a.sourceUrl ?? '');
    setSrcName(a.sourceName ?? '');
    setOrigin(a.origin);
  }, []);

  // Bring a REMOTE image url in — shared by URL paste AND drag-drop. We FETCH the image and upload
  // a copy to the user's own bucket (importRemoteArtToBucket), so nothing is ever hotlinked: the
  // slot holds the user's own hosted copy, while the ORIGINAL url is kept only as attribution (the
  // credit / public-binder source).
  // If the fetch fails (a host we can't reach), we tell the user to Upload — never store the link.
  const loadRemoteUrl = useCallback(
    async (u: string) => {
      const derived = deriveAttribution(u);
      const base: ArtAttribution = { ...derived, sourceUrl: derived.sourceUrl ?? u };
      // Pulled from an outside URL — provenance we can't verify → PRIVATE. Hosting a copy in the
      // user's bucket does not change that; only a file the user uploads + attests is public.
      const attribution: ArtAttribution = { ...base, origin: 'external' };
      setImporting(true);
      setImportError(null);
      try {
        const hostedUrl = await importRemoteArtToBucket(u);
        loadImage(hostedUrl, attribution); // imageUrl = user's bucket copy; credit = original source
      } catch (e) {
        setImportError((e as Error).message);
      } finally {
        setImporting(false);
      }
    },
    [loadImage],
  );

  // Upload a user's own file (drop or picker) into their bucket, then load the hosted copy. A
  // brought file is 'upload' provenance — public-eligible once the user attests their rights.
  const importFile = useCallback(
    async (file: Blob, name?: string) => {
      setImporting(true);
      setImportError(null);
      try {
        const hostedUrl = await uploadArtImage(file, name);
        loadImage(hostedUrl, { sourceName: 'your upload', origin: 'upload' });
      } catch (e) {
        setImportError((e as Error).message);
      } finally {
        setImporting(false);
      }
    },
    [loadImage],
  );

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

  // Web: drop an image (or its URL) dragged from anywhere — a gallery tab, your files — onto the
  // studio to load it. A drop while the studio is open is for us.
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
        // A dragged remote image → fetch it into the user's bucket (no hotlink); artofpkm urls
        // also resolve to full attribution.
        void loadRemoteUrl(url);
        return;
      }
      // A dropped FILE the user brought → upload it to their bucket (persisted, not a transient blob).
      const file = dt.files && dt.files[0];
      if (file && file.type.startsWith('image/')) void importFile(file, (file as File).name);
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [loadImage, loadRemoteUrl, importFile]);

  // Workspace: fill what the viewport allows — capped by BOTH width and height so the whole
  // page-shaped grid stays on screen. In two-column mode the canvas sits in its own column, so we
  // size it to that column's measured width (estimated until the first layout); stacked, it uses
  // the full sheet width as before. Height is the same viewport budget in both layouts.
  const twoCol = width >= TWO_COL_MIN;
  const estCanvasW = twoCol
    ? Math.min(width - 48, 1400) - CONTROLS_W - COL_GAP
    : Math.min(width - 48, 960);
  const availW = Math.max(
    240,
    twoCol ? Math.min(measuredCanvasW > 0 ? measuredCanvasW : estCanvasW, 1100) : estCanvasW,
  );
  // Two-column: fill the measured viewport (canvas is beside the controls). We subtract the chrome
  // that sits INSIDE the scroll content around the canvas — the scroll's 16px top+bottom padding
  // (32) + the canvasWrap's 4px marginTop + a small buffer — so the canvas fits exactly and the tab
  // doesn't scroll by default. Single-column: the old window budget (controls stack above the canvas).
  const availH = Math.max(300, twoCol && viewportH > 0 ? viewportH - 40 : height - 360);
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
      // SIDE-LOAD physics caps a printable piece at a folded 1×2 — but WHERE that pair sits is
      // a placement concern, not a studio one: any two side-by-side singles may merge here, and
      // the pocket-pair rule is enforced when the slice is dropped onto a page.
      if (maxR - minR !== 1 || maxC - minC !== 2) return ps;
      return [...others, { id: uid('panel'), r: minR, c: minC, rs: maxR - minR, cs: maxC - minC }];
    });
    setSelected(new Set());
  }, [selected]);

  // Would merging the current selection produce a physically insertable piece? Drives the
  // Merge button state + the hint line, mirroring the guard inside merge().
  const mergeLegal = useMemo(() => {
    if (selected.size < 2) return false;
    const chosen = panels.filter((p) => selected.has(p.id));
    if (chosen.length < 2) return false;
    const minR = Math.min(...chosen.map((p) => p.r));
    const maxR = Math.max(...chosen.map((p) => p.r + p.rs));
    const minC = Math.min(...chosen.map((p) => p.c));
    const maxC = Math.max(...chosen.map((p) => p.c + p.cs));
    const selCells = chosen.reduce((n, p) => n + p.rs * p.cs, 0);
    if (selCells !== (maxR - minR) * (maxC - minC)) return false;
    return maxR - minR === 1 && maxC - minC === 2;
  }, [selected, panels]);

  // Split only means something when a selected panel is actually merged (spans >1 cell) — drives
  // whether the contextual Split action shows.
  const canSplit = useMemo(
    () => panels.some((p) => selected.has(p.id) && (p.rs > 1 || p.cs > 1)),
    [panels, selected],
  );

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

  // Drop the selected pieces entirely — not every cut is tray-worthy (sky corners, empty
  // margins), so "Save slices" only sends what's still on the canvas. Reset restores the grid.
  const removePanels = useCallback(() => {
    setPanels((ps) => ps.filter((p) => !selected.has(p.id)));
    setSelected(new Set());
  }, [selected]);

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
    void loadRemoteUrl(u);
  }, [urlInput, loadRemoteUrl]);

  // Save the studio's pieces to the tray. Each grid piece (1×1, or a merged folded 1×2) becomes a
  // SavedSlice carrying its window of the image — the source is never re-encoded. Where each slice
  // legally fits is decided later, when it's dragged/tapped into a pocket.
  const saveSlices = useCallback(() => {
    if (!imageUrl || !panels.length) return;
    const transform: ImageTransform | undefined =
      rot !== 0 || flipH || flipV
        ? { rot, ...(flipH ? { flipH: true } : {}), ...(flipV ? { flipV: true } : {}) }
        : undefined;
    const groupId = uid('slicegrp');
    const label = domainOf(imageUrl);
    // Build the credit from the fields, filling the source name/url from the URL when the user
    // left them blank. Attach only when there's something worth carrying.
    const trimmedArtist = artist.trim();
    const trimmedSource = sourceUrl.trim();
    const derived = deriveAttribution(imageUrl);
    // Always carry the origin (the sharing gate reads it), even when there's no credit text.
    const attribution: ArtAttribution | undefined =
      trimmedArtist || trimmedSource || derived.sourceUrl || origin
        ? {
            sourceName: srcName || derived.sourceName,
            ...(trimmedArtist ? { artist: trimmedArtist } : {}),
            ...(trimmedSource || derived.sourceUrl
              ? { sourceUrl: trimmedSource || derived.sourceUrl }
              : {}),
            ...(origin ? { origin } : {}),
          }
        : undefined;
    const slices: SavedSlice[] = panels.map((p) => ({
      // A real UUID — saved_slices.id is a Postgres uuid column, so a `slice-…` string id makes
      // every insert fail (silently: the tray is optimistic) and nothing ever persists.
      id: uuidv4(),
      imageUrl,
      crop: panelCrop(p, rows, cols, win),
      fit: 'cover',
      transform,
      rs: p.rs,
      cs: p.cs,
      groupId,
      label,
      attribution,
    }));
    onSaveSlices(slices);
  }, [imageUrl, rot, flipH, flipV, panels, rows, cols, win, onSaveSlices, artist, sourceUrl, srcName, origin]);

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
      else if (e.key === 'Delete' || e.key === 'Backspace') removePanels();
      else if (e.key === 'Escape') {
        // Esc clears the selection — and must NOT also close the studio (the RN Modal listens
        // for Escape too and would discard the whole framing session). Remember that this
        // Escape was consumed so onRequestClose can swallow the Modal's close.
        escapeConsumedAt.current = Date.now();
        setSelected(new Set());
        e.stopPropagation();
        e.preventDefault();
      } else if (e.key === '+' || e.key === '=') zoomBy(0.85);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / 0.85);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', sync);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', sync);
    };
  }, [merge, split, rotate, zoomBy, removePanels]);

  // When Escape just cleared a selection, the Modal's own Escape handling must not ALSO close
  // the studio (that would throw away the whole framing session). See the keydown handler.
  const escapeConsumedAt = useRef(0);
  const requestClose = useCallback(() => {
    if (Date.now() - escapeConsumedAt.current < 600) return;
    onClose();
  }, [onClose]);

  // Web: scroll wheel over the IMAGE PANEL zooms; wheel anywhere else (the controls, the page/sheet)
  // scrolls normally. Attaching to the canvas node itself — not its centring wrapper — is what scopes
  // the zoom (and the scroll-blocking preventDefault) to a pointer that's directly over the image.
  const canvasRef = useRef<View | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !imageUrl) return;
    const node = canvasRef.current as unknown as HTMLElement | null;
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

  // When a legal sideways pair is selected, draw the crease down the middle of the pair so the
  // "fold in half, slide a half into each pocket" gesture is visible on the canvas itself — the
  // core craft move made tangible rather than buried in the shortcut list.
  const foldHint = useMemo(() => {
    if (!mergeLegal || !cellW) return null;
    const chosen = panels.filter((p) => selected.has(p.id));
    if (!chosen.length) return null;
    const minC = Math.min(...chosen.map((p) => p.c));
    const minR = Math.min(...chosen.map((p) => p.r));
    return { left: minC * (cellW + GAP) + cellW + GAP / 2, top: minR * (cellH + GAP), height: cellH };
  }, [mergeLegal, panels, selected, cellW, cellH]);

  const hasImage = Boolean(imageUrl);
  const selCount = selected.size;
  // Saving would pass the account's artwork cap (a retention cap: slices KEPT, not a rate).
  const wouldExceedTray = hasImage && panels.length > 0 && trayCount + panels.length > trayLimit;

  // The three studio-level controls — title, help, and Save slices. Shared so they can sit in the
  // full-screen header (standalone) OR at the top of the left controls column (embedded), where
  // they replace a whole header row and free the vertical space for the canvas.
  const titleEl = (
    <ThemedText type="subtitle" style={styles.headerTitle}>
      Slice studio
    </ThemedText>
  );
  const helpBtn = (
    <Pressable
      onPress={() => setGuideOpen(true)}
      hitSlop={10}
      accessibilityLabel="Controls & shortcuts"
      style={styles.helpBtn}>
      <Text style={styles.helpBtnText}>?</Text>
    </Pressable>
  );
  const saveBtn = (
    <Pressable onPress={saveSlices} hitSlop={10} disabled={!hasImage || !panels.length || wouldExceedTray}>
      <View style={[styles.placeBtn, (!hasImage || !panels.length || wouldExceedTray) && styles.disabled]}>
        <Text style={styles.placeBtnText}>
          Save slices{hasImage && panels.length ? ` (${panels.length})` : ''}
        </Text>
      </View>
    </Pressable>
  );

  const body = (
    <>
        {/* Standalone (e.g. the tray's "New") keeps a full-screen header with Close on the left and
            the studio actions on the right. Embedded has no header row at all — the same actions
            live at the top of the left controls column (see studioActions below). */}
        {!embedded ? (
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.headerAction}>Close</Text>
            </Pressable>
            <View style={styles.headerRight}>
              {titleEl}
              {helpBtn}
              {saveBtn}
            </View>
          </View>
        ) : null}

        {wouldExceedTray ? (
          <View style={styles.capNote}>
            {guest ? (
              <SignInPerk
                message={`You’re keeping ${trayCount} of ${trayLimit} guest artworks. Sign in (free) to keep up to ${TIER_LIMITS.free.artUploads}.`}
              />
            ) : (
              <UpgradePerk
                message={`You’re keeping ${trayCount} of ${trayLimit} artworks. Saving ${panels.length} more needs a bigger plan.`}
                onBeforePress={onClose}
              />
            )}
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.scroll}
          onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}>
         <View style={[styles.columns, twoCol && styles.columnsRow]}>
          {/* LEFT: everything you touch — get art in, credit it, frame it. */}
          <View style={[styles.controlsCol, twoCol && styles.controlsColFixed]}>
          {/* Studio actions (embedded): title + help + Save, atop the controls instead of a header. */}
          {embedded ? (
            <View style={styles.studioActions}>
              {titleEl}
              <View style={styles.headerRight}>
                {helpBtn}
                {saveBtn}
              </View>
            </View>
          ) : null}
          {/* Source — one calm row. Everything here is about GETTING an image in. */}
          <View style={styles.sourceBar}>
            <Btn label="Card art" onPress={() => setCardPickOpen(true)} kind="primary" />
            <Btn label="Art sources ↗" onPress={() => setSourcesOpen(true)} />
            <ArtUploadButton
              onUploaded={(url) => loadImage(url, { sourceName: 'your upload', origin: 'upload' })}
              onError={setImportError}
            />
            <View style={styles.urlWrap}>
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
          </View>

          {/* Attribution hint — remind the user to credit the source; art is hosted, never hotlinked. */}
          <Text style={styles.attribHint}>
            Tip: add the artist and source below so your art stays credited. Art you bring is saved
            to your own account; we host your copy, we don’t hotlink other sites.
          </Text>

          {importing ? (
            <View style={styles.importRow}>
              <ActivityIndicator />
              <Text style={styles.attribHint}>Saving your image to your account…</Text>
            </View>
          ) : null}
          {importError ? <Text style={styles.importError}>{importError}</Text> : null}

          {/* Provenance status for the loaded image — private (URL-pulled) vs shareable (uploaded). */}
          {hasImage && origin === 'external' ? (
            <Text style={styles.privateNote}>
              PRIVATE — this art came from a link, so binders using it can’t be shared publicly. To
              share, upload your own art (art you own or created) instead.
            </Text>
          ) : hasImage && origin === 'upload' ? (
            <Text style={styles.attribHint}>
              Your upload — this can go in binders you share, once you confirm you have the rights.
            </Text>
          ) : null}

          {/* Credit — captured with the art. A SOURCE (link to the original post/shop/artist
              page) is required before a binder using this art can go public; the artist name is
              optional but encouraged. Pre-filled from known/derivable sources. */}
          {hasImage ? (
            <View style={styles.creditBar}>
              <TextInput
                value={artist}
                onChangeText={setArtist}
                placeholder="Artist / credit (optional)"
                placeholderTextColor={Palette.muted3}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, styles.creditInput]}
              />
              <TextInput
                value={sourceUrl}
                onChangeText={setSourceUrl}
                placeholder="Source URL (the original post — required to make public)"
                placeholderTextColor={Palette.muted3}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, styles.creditInput]}
              />
            </View>
          ) : null}

          {/* Framing controls only exist once there's something to frame — the empty studio stays
              quiet. Grouped, hairline-separated clusters replace the old five stacked toolbars. */}
          {hasImage ? (
            <View style={styles.controlBar}>
              <View style={styles.group}>
                <View style={styles.segGroup}>
                  <Seg label="Scale to fit" active={fit === 'cover'} onPress={() => setFit('cover')} />
                  <Seg label="Original" active={fit === 'contain'} onPress={() => setFit('contain')} />
                </View>
                <IconBtn label="Just the art" onPress={justTheArt} />
              </View>

              <View style={styles.divider} />

              <View style={styles.group}>
                <IconBtn label="−" onPress={() => zoomBy(1 / 0.85)} disabled={fit === 'contain'} />
                <IconBtn label="+" onPress={() => zoomBy(0.85)} disabled={fit === 'contain'} />
                <IconBtn label="⟲" onPress={() => rotate(-1)} disabled={!natural} />
                <IconBtn label="⟳" onPress={() => rotate(1)} disabled={!natural} />
                {rot !== 0 ? <Text style={styles.rotDeg}>{rot}°</Text> : null}
                <IconBtn label="↔" onPress={() => setFlipH((v) => !v)} active={flipH} />
                <IconBtn label="↕" onPress={() => setFlipV((v) => !v)} active={flipV} />
              </View>

              <View style={styles.divider} />

              <View style={styles.segGroup}>
                <Seg label="Whole" active={!sliced} onPress={() => setSliced(false)} />
                <Seg label="Sliced" active={sliced} onPress={() => setSliced(true)} />
              </View>

              <View style={styles.grow} />

              <Ghost label="Reset" onPress={reset} />
            </View>
          ) : null}

          {/* Interaction hint — lives with the controls (left), not over the canvas. */}
          {hasImage ? (
            <Text style={styles.hint}>Drag to pan · scroll to zoom · click a piece to select</Text>
          ) : null}
          </View>

          {/* RIGHT: the art itself. Measured so the canvas sizes to this column, not the window. */}
          <View
            style={[styles.canvasCol, twoCol && styles.canvasColFlex]}
            onLayout={(e) => setMeasuredCanvasW(e.nativeEvent.layout.width)}>
          {/* Canvas — the hero. */}
          <View style={styles.canvasWrap}>
            {!hasImage ? (
              <View style={[styles.canvas, { width: canvasW, height: canvasH }, styles.empty]}>
                <Text style={styles.emptyTitle}>Bring in some art</Text>
                <Text style={styles.emptySub}>Pick card art, upload, or paste a URL to begin.</Text>
                {Platform.OS === 'web' ? (
                  <Text style={styles.emptyDrag}>…or drag an image straight onto this window.</Text>
                ) : null}
              </View>
            ) : (
              <GestureDetector gesture={gesture}>
                <View ref={canvasRef} style={[styles.canvas, { width: canvasW, height: canvasH }]}>
                  {failed ? (
                    <View style={[styles.empty, StyleSheet.absoluteFill]}>
                      <Text style={styles.emptySub}>image didn’t load</Text>
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
                  {/* The fold crease — makes the "fold + slide into both pockets" move visible. */}
                  {foldHint ? (
                    <View
                      pointerEvents="none"
                      style={[styles.foldLine, { left: foldHint.left - 1, top: foldHint.top, height: foldHint.height }]}
                    />
                  ) : null}
                </View>
              </GestureDetector>
            )}

            {/* Contextual craft actions — only when there's a selection to act on. */}
            {hasImage && selCount > 0 ? (
              <View style={[styles.selBar, mergeLegal && styles.selBarLegal]}>
                {mergeLegal ? (
                  <Text style={styles.selText}>
                    A sideways pair. Fold down the middle to join it into one 1×2 piece.
                  </Text>
                ) : selCount >= 2 ? (
                  <Text style={styles.selWarn}>
                    Merging needs exactly two side-by-side pieces in the same row (a folded 1×2
                    is the widest a pocket pair can take).
                  </Text>
                ) : (
                  <Text style={styles.selText}>1 piece selected.</Text>
                )}
                {mergeLegal ? <Btn label="⤶ Fold & merge" onPress={merge} kind="primary" /> : null}
                {canSplit ? <Btn label="Split apart" onPress={split} /> : null}
                <Btn label="Remove" onPress={removePanels} />
                <Ghost label="Clear" onPress={() => setSelected(new Set())} />
              </View>
            ) : null}
          </View>
          </View>
         </View>
        </ScrollView>

        {dropActive ? (
          <View pointerEvents="none" style={styles.dropOverlay}>
            <Text style={styles.dropOverlayText}>Drop image to load</Text>
          </View>
        ) : null}

        {guideOpen ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setGuideOpen(false)}>
            <View style={sheet.dialogBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setGuideOpen(false)} />
              <ThemedView type="backgroundElement" style={[sheet.dialogCard, styles.sourcesCard]}>
                <View style={styles.cardPickHeader}>
                  <ThemedText type="subtitle">Controls &amp; shortcuts</ThemedText>
                  <Pressable onPress={() => setGuideOpen(false)} hitSlop={10}>
                    <Text style={[styles.headerAction, styles.primary]}>Close</Text>
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.guideList}>
                  {GUIDE.map((g) => (
                    <View key={g.keys} style={styles.guideRow}>
                      <Text style={styles.guideKeys}>{g.keys}</Text>
                      <Text style={styles.guideAction}>{g.action}</Text>
                    </View>
                  ))}
                  {Platform.OS !== 'web' ? (
                    <Text style={styles.guideNote}>
                      Keyboard / Shift / Ctrl shortcuts are web-only. Use the buttons on touch.
                    </Text>
                  ) : null}
                </ScrollView>
              </ThemedView>
            </View>
          </Modal>
        ) : null}

        {sourcesOpen ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setSourcesOpen(false)}>
            <View style={sheet.dialogBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setSourcesOpen(false)} />
              <ThemedView type="backgroundElement" style={[sheet.dialogCard, styles.sourcesCard]}>
                <View style={styles.cardPickHeader}>
                  <ThemedText type="subtitle">Art sources</ThemedText>
                  <Pressable onPress={() => setSourcesOpen(false)} hitSlop={10}>
                    <Text style={[styles.headerAction, styles.primary]}>Close</Text>
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.sourcesList}>
                  <Text style={styles.sourcesResponsibility}>
                    michi-maker is a layout tool for art you supply. These are places to find art
                    for your own personal binders — only use images you have the right to use, and
                    credit the artist and source. You are responsible for the art you add.
                  </Text>
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
                    load it. If a host blocks direct loading, save the image and Upload it
                    instead. Uploads are stored with your binder, so they never break.
                  </Text>
                </ScrollView>
              </ThemedView>
            </View>
          </Modal>
        ) : null}

        {cardPickOpen ? (
          <Modal visible transparent animationType="slide" onRequestClose={() => setCardPickOpen(false)}>
            <View style={sheet.bottomBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setCardPickOpen(false)} />
              <ThemedView type="backgroundElement" style={[sheet.bottomSheet, styles.cardPickSheet]}>
                <View style={styles.cardPickHeader}>
                  <ThemedText type="subtitle">Choose card art</ThemedText>
                  <Pressable onPress={() => setCardPickOpen(false)} hitSlop={10}>
                    <Text style={[styles.headerAction, styles.primary]}>Close</Text>
                  </Pressable>
                </View>
                {/* Rendered even without the catalog: CatalogBrowser runs cold (server search +
                    taxonomy drill-down) for guests — a `catalog ?` gate here left guests staring
                    at a spinner that never resolved (the catalog is a signed-in perk). */}
                <CardBrowse
                  catalog={catalog}
                  onPickCard={(id) => {
                    loadImage(cardThumbUrl(id, 'full'));
                    setCardPickOpen(false);
                  }}
                />
              </ThemedView>
            </View>
          </Modal>
        ) : null}
    </>
  );

  // Embedded: live inside the picker's Artwork tab (a plain flex box), so the sheet's tab bar
  // stays visible above it. Standalone: the full-screen framing modal (e.g. the tray's "New").
  if (embedded) return <View style={styles.flex}>{body}</View>;
  return (
    <Modal visible animationType="slide" onRequestClose={requestClose}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        {body}
      </SafeAreaView>
    </Modal>
  );
}

/** A filled/neutral action button — source actions and the primary "Fold & merge". */
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
        styles.btn,
        kind === 'primary' && styles.btnPrimary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.btnText, kind === 'primary' && styles.btnPrimaryText]}>{label}</Text>
    </Pressable>
  );
}

/** One cell of a segmented control (Grid presets, Fit, Whole/Sliced). */
function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.seg, active && styles.segActive]}>
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** A compact framing control — zoom / rotate / flip / "Just the art". */
function IconBtn({
  label,
  onPress,
  disabled = false,
  active = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconBtn,
        active && styles.iconBtnActive,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.iconBtnText, active && styles.iconBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** A quiet text-only action (Reset / Save / Clear). */
function Ghost({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}>
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Palette.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headerAction: { fontSize: FontSize.md, fontWeight: Weight.semibold, color: Palette.ink2 },
  headerTitle: { marginRight: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  capNote: { paddingHorizontal: 16, paddingTop: 12 },
  primary: { color: Palette.accent },
  disabled: { opacity: 0.4 },
  helpBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnText: { fontSize: FontSize.control, fontWeight: Weight.bold, color: Palette.muted, lineHeight: 18 },
  placeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  placeBtnText: { fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.accentText },

  scroll: { padding: 16, gap: 12 },
  pressed: { opacity: 0.65 },

  // Two-column workspace (controls left, canvas right). Stacks to one column below TWO_COL_MIN.
  columns: { gap: 12 },
  columnsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: COL_GAP },
  controlsCol: { gap: 12 },
  controlsColFixed: { width: CONTROLS_W, flexShrink: 0 },
  // Embedded studio actions (title + help + Save), a hairline divider grouping them above controls.
  studioActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  canvasCol: {},
  canvasColFlex: { flex: 1, minWidth: 0 },

  // Source row
  sourceBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  creditBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  creditInput: { flexBasis: 200 },
  attribHint: { marginTop: 8, fontSize: FontSize.sm, lineHeight: 17, color: Palette.muted2 },
  importRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  importError: { marginTop: 8, fontSize: FontSize.sm, lineHeight: 17, color: Palette.danger },
  privateNote: { marginTop: 8, fontSize: FontSize.sm, lineHeight: 17, color: Palette.ink3, fontWeight: Weight.semibold },
  urlWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 },
  input: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: Palette.controlBorder,
    borderRadius: Radius.control,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: FontSize.body,
    color: Palette.ink,
    backgroundColor: Palette.surface,
  },

  // Action buttons
  btn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: Radius.control, backgroundColor: Palette.panel },
  btnPrimary: { backgroundColor: Palette.accent },
  btnText: { fontSize: FontSize.body, fontWeight: Weight.semibold, color: Palette.ink2 },
  btnPrimaryText: { color: Palette.accentText },

  // Consolidated control tray (was five stacked toolbars)
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: 10,
    borderRadius: Radius.panel,
    backgroundColor: Palette.panelAlt,
  },
  group: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  divider: { width: 1, height: 24, backgroundColor: Palette.hairlineStrong, marginHorizontal: 2 },
  grow: { flexGrow: 1 },

  // Segmented control
  segGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: Palette.panel, borderRadius: Radius.pill, padding: 2 },
  seg: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill },
  segActive: {
    backgroundColor: Palette.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segText: { fontSize: FontSize.label, color: Palette.muted, fontWeight: Weight.medium },
  segTextActive: { color: Palette.ink, fontWeight: Weight.semibold },

  // Compact icon control (zoom / rotate / flip / "Just the art")
  iconBtn: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: Radius.control,
    backgroundColor: Palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: Palette.accent },
  iconBtnText: { fontSize: FontSize.control, fontWeight: Weight.semibold, color: Palette.ink2 },
  iconBtnTextActive: { color: Palette.accentText },
  rotDeg: { fontSize: FontSize.sm, color: Palette.muted, marginHorizontal: 2 },

  // Quiet text actions
  ghostBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  ghostText: { fontSize: FontSize.label, color: Palette.muted, fontWeight: Weight.semibold },

  // Canvas (the hero)
  canvasWrap: { alignItems: 'center', gap: 10, marginTop: 4 },
  canvas: {
    backgroundColor: Palette.chrome,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.chrome, borderRadius: Radius.lg, gap: 6, padding: 24 },
  emptyTitle: { color: Palette.white, fontSize: FontSize.lg, fontWeight: Weight.semibold },
  emptySub: { color: Palette.onDarkMuted, fontSize: FontSize.label, textAlign: 'center' },
  emptyDrag: { color: Palette.onDarkMuted2, fontSize: FontSize.sm, marginTop: 4, textAlign: 'center' },
  pieceClip: { overflow: 'hidden', borderRadius: Radius.thumb, backgroundColor: Palette.chromeDeepest },
  pieceSelected: { borderWidth: 2, borderColor: Palette.accent },
  foldLine: {
    position: 'absolute',
    width: 0,
    borderLeftWidth: 2,
    borderColor: Palette.white,
    borderStyle: 'dashed',
    zIndex: 5,
  },
  hint: { fontSize: FontSize.base, color: Palette.muted2, lineHeight: 17 },

  // Contextual selection / merge action bar
  selBar: {
    width: '100%',
    maxWidth: 680,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
    borderRadius: Radius.panel,
    backgroundColor: Palette.panelAlt,
  },
  selBarLegal: { backgroundColor: Palette.selectionSoft, borderWidth: 1, borderColor: Palette.accent },
  selText: { fontSize: FontSize.body, color: Palette.ink3, flexShrink: 1 },
  selWarn: { fontSize: FontSize.body, color: Palette.ink4, flexShrink: 1, lineHeight: 19 },

  // Controls & shortcuts overlay (was a permanent right column)
  guideList: { gap: 10, paddingBottom: 12 },
  guideRow: { marginBottom: 4 },
  guideKeys: { fontSize: FontSize.base, fontWeight: Weight.bold, color: Palette.accent },
  guideAction: { fontSize: FontSize.base, color: Palette.ink4 },
  guideNote: { fontSize: FontSize.sm, color: Palette.muted3, marginTop: 6, lineHeight: 16 },

  cardPickSheet: { height: '82%' },
  cardPickHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sourcesCard: { width: '100%', maxWidth: 520, maxHeight: '80%' },
  sourcesList: { gap: 10, paddingBottom: 12 },
  sourcesResponsibility: {
    fontSize: FontSize.sm,
    color: Palette.ink4,
    lineHeight: 17,
    paddingBottom: 4,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
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
