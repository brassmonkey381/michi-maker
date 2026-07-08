/**
 * Binder store.
 *
 * Holds binders in React state for a snappy UI. When Supabase is configured, *user* binders
 * are loaded from and persisted to the backend (optimistically — state updates immediately,
 * the write happens in the background). When it isn't, the same operations run purely
 * in-memory (local mode). The bundled example binders are always local and read-only-ish
 * (editable in-session, never persisted); duplicating one creates a real user binder.
 *
 * `binderRepo` is the only module that talks to Supabase, so this file maps the store's
 * actions onto persistence and nothing else needs to know where binders live.
 *
 * Edits flow through `commit()`, which records an undo/redo history of in-memory snapshots
 * (cheap — the mutators already build new immutable arrays). Undo/redo restore state locally;
 * re-syncing an undo to Supabase is a future follow-up (today CLOUD edits persist forward only).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import * as repo from '@/data/binderRepo';
import {
  canPlaceSlot,
  cloneBinder,
  emptyPage,
  firstFreePlacement,
  slotCells,
  uuidv4,
  type DemoBinder,
  type DemoPage,
  type DemoSlot,
  type MichiLayoutStyle,
} from '@/data/binderTypes';
import { SAMPLE_BINDERS } from '@/data/sampleData';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

const CLOUD = isSupabaseConfigured;
const HISTORY_LIMIT = 50;

export interface SlotInput {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  type?: DemoSlot['type'];
  cardId?: string;
  insertColor?: string;
  imageUrl?: string;
}

/** One panel from the slice studio: a grid region of an image plus its crop. */
export interface ArtPanelInput {
  r: number;
  c: number;
  rs: number;
  cs: number;
  imageUrl: string;
  crop: { x: number; y: number; w: number; h: number };
}

interface BinderStore {
  binders: DemoBinder[];
  exampleBinders: DemoBinder[];
  userBinders: DemoBinder[];
  /** True while user binders are loading from Supabase (always false in local mode). */
  loading: boolean;
  getBinder: (id: string) => DemoBinder | undefined;
  createBinder: (init?: Partial<DemoBinder>) => DemoBinder;
  /** Create a fresh binder seeded with one card in its first pocket (atomic). */
  createBinderWithCard: (cardId: string) => DemoBinder;
  duplicateBinder: (id: string) => DemoBinder | undefined;
  updateBinder: (id: string, patch: Partial<DemoBinder>) => void;
  deleteBinder: (id: string) => void;
  addPage: (binderId: string) => void;
  updatePage: (binderId: string, pageId: string, patch: Partial<DemoPage>) => void;
  removePage: (binderId: string, pageId: string) => void;
  reorderPages: (binderId: string, fromIndex: number, toIndex: number) => void;
  upsertSlot: (binderId: string, pageId: string, slot: SlotInput) => void;
  /**
   * Drop a card into a binder's first free 1×1 pocket (scanning pages in order; appends a new
   * page if every page is full). Atomic — one history entry. Returns the page index it landed on,
   * or null if the binder can't be found.
   */
  addCardToBinder: (binderId: string, cardId: string) => { pageIndex: number } | null;
  placeVUnion: (binderId: string, pageId: string, row: number, col: number, pieces: readonly string[]) => void;
  placeSlicedArtwork: (
    binderId: string,
    pageId: string,
    row: number,
    col: number,
    rows: number,
    cols: number,
    imageUrl: string,
  ) => void;
  placeArtPanels: (
    binderId: string,
    pageId: string,
    baseRow: number,
    baseCol: number,
    panels: ArtPanelInput[],
  ) => void;
  moveSlot: (binderId: string, pageId: string, slotId: string, toRow: number, toCol: number) => void;
  swapSlots: (binderId: string, pageId: string, slotIdA: string, slotIdB: string) => void;
  removeSlot: (binderId: string, pageId: string, slotId: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface History {
  past: DemoBinder[][];
  present: DemoBinder[];
  future: DemoBinder[][];
}

const BinderContext = createContext<BinderStore | null>(null);

export function BinderProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<History>({ past: [], present: SAMPLE_BINDERS, future: [] });
  const [loading, setLoading] = useState<boolean>(CLOUD);

  // The auth store owns the session. We load the signed-in user's binders and reload whenever
  // the user identity changes (sign in / out / new guest). A guest → account *upgrade* keeps
  // the same user id, so those binders stay put without a reload.
  const { ready: authReady, user } = useAuth();
  const userId = user?.id ?? null;

  const binders = history.present;

  // Load user binders for the current user (examples stay bundled/local). This isn't an
  // undoable edit, so it replaces `present` without touching the history stacks.
  useEffect(() => {
    if (!CLOUD) return;
    if (!authReady) return; // wait for the session to settle before loading
    let active = true;
    (async () => {
      setLoading(true);
      try {
        // No session (guest sign-in unavailable, or signed out): show examples only.
        const userBinders = userId ? await repo.fetchUserBinders() : [];
        if (active) {
          setHistory((h) => ({ ...h, present: [...SAMPLE_BINDERS, ...userBinders] }));
        }
      } catch (error) {
        console.warn(
          `[poke-michi] Supabase load failed; showing examples only: ${(error as Error).message}`,
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authReady, userId]);

  /** Apply an immutable update to the binders, recording it on the undo stack. */
  const commit = useCallback((updater: (prev: DemoBinder[]) => DemoBinder[]) => {
    setHistory((h) => {
      const next = updater(h.present);
      if (next === h.present) return h; // no-op updates don't pollute history
      return {
        past: [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
      };
    });
  }, []);

  /**
   * Run a persistence op in cloud mode; never let a failed write crash the UI. When there's no
   * session (e.g. anonymous sign-in unavailable) writes would all fail RLS, so we skip them
   * entirely — the guest banner tells the user their work isn't saving — rather than firing a
   * stream of scary errors. Genuine failures (with a session) log a soft warning, not an error.
   */
  const persist = useCallback(
    (op: () => Promise<void>) => {
      if (!CLOUD || !user) return;
      op().catch((error) => console.warn(`[poke-michi] cloud save failed: ${(error as Error).message}`));
    },
    [user],
  );

  /**
   * Re-sync Supabase after an undo/redo. Incremental writers persist forward edits, but a
   * snapshot swap can revert/restore arbitrary content, so for each user binder that changed
   * between the two snapshots we replace its whole persisted state; binders that disappeared
   * (undo of a create / redo of a delete) are deleted. `replaceBinder` is idempotent, so a
   * StrictMode double-invoke of the updater below is harmless.
   */
  const syncChanged = useCallback(
    (from: DemoBinder[], to: DemoBinder[]) => {
      if (!CLOUD) return;
      const fromById = new Map(from.map((b) => [b.id, b]));
      const toIds = new Set(to.map((b) => b.id));
      for (const b of to) {
        if (b.isExample) continue;
        if (fromById.get(b.id) !== b) persist(() => repo.replaceBinder(b)); // new or content-changed
      }
      for (const b of from) {
        if (b.isExample) continue;
        if (!toIds.has(b.id)) persist(() => repo.deleteBinder(b.id)); // removed by the undo/redo
      }
    },
    [persist],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      syncChanged(h.present, previous);
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
    });
  }, [syncChanged]);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const [next, ...rest] = h.future;
      syncChanged(h.present, next);
      return { past: [...h.past, h.present], present: next, future: rest };
    });
  }, [syncChanged]);

  const getBinder = useCallback(
    (id: string) => binders.find((binder) => binder.id === id),
    [binders],
  );

  const createBinder = useCallback(
    (init?: Partial<DemoBinder>) => {
      const binder: DemoBinder = {
        id: uuidv4(),
        title: 'Untitled binder',
        layoutStyle: 'freeform' as MichiLayoutStyle,
        isExample: false,
        pages: [emptyPage()],
        ...init,
      };
      commit((prev) => [...prev, binder]);
      persist(() => repo.insertBinder(binder));
      return binder;
    },
    [commit, persist],
  );

  const createBinderWithCard = useCallback(
    (cardId: string) => {
      const slot: DemoSlot = { id: uuidv4(), row: 0, col: 0, rowSpan: 1, colSpan: 1, type: 'card', cardId };
      const page: DemoPage = { ...emptyPage(3, 3), slots: [slot] };
      return createBinder({ title: 'New binder', pages: [page] });
    },
    [createBinder],
  );

  const duplicateBinder = useCallback(
    (id: string) => {
      const source = binders.find((binder) => binder.id === id);
      if (!source) return undefined;
      const copy = cloneBinder(source, { title: `${source.title} (copy)` });
      commit((prev) => [...prev, copy]);
      persist(() => repo.insertBinder(copy));
      return copy;
    },
    [binders, commit, persist],
  );

  const updateBinder = useCallback(
    (id: string, patch: Partial<DemoBinder>) => {
      const target = binders.find((binder) => binder.id === id);
      commit((prev) => prev.map((binder) => (binder.id === id ? { ...binder, ...patch } : binder)));
      if (target && !target.isExample) persist(() => repo.updateBinder(id, patch));
    },
    [binders, commit, persist],
  );

  const deleteBinder = useCallback(
    (id: string) => {
      const target = binders.find((binder) => binder.id === id);
      commit((prev) => prev.filter((binder) => binder.id !== id));
      if (target && !target.isExample) persist(() => repo.deleteBinder(id));
    },
    [binders, commit, persist],
  );

  const addPage = useCallback(
    (binderId: string) => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target) return;
      const page = emptyPage(3, 3, `Page ${target.pages.length + 1}`);
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId ? { ...binder, pages: [...binder.pages, page] } : binder,
        ),
      );
      if (!target.isExample) persist(() => repo.insertPage(binderId, page, target.pages.length));
    },
    [binders, commit, persist],
  );

  const updatePage = useCallback(
    (binderId: string, pageId: string, patch: Partial<DemoPage>) => {
      const target = binders.find((binder) => binder.id === binderId);
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? { ...binder, pages: binder.pages.map((page) => (page.id === pageId ? { ...page, ...patch } : page)) }
            : binder,
        ),
      );
      if (target && !target.isExample) persist(() => repo.updatePage(pageId, patch));
    },
    [binders, commit, persist],
  );

  const removePage = useCallback(
    (binderId: string, pageId: string) => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target || target.pages.length <= 1) return; // never leave a binder with zero pages
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? { ...binder, pages: binder.pages.filter((page) => page.id !== pageId) }
            : binder,
        ),
      );
      if (!target.isExample) persist(() => repo.deletePage(pageId));
    },
    [binders, commit, persist],
  );

  const reorderPages = useCallback(
    (binderId: string, fromIndex: number, toIndex: number) => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target) return;
      const count = target.pages.length;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= count ||
        toIndex >= count
      ) {
        return;
      }
      const pages = [...target.pages];
      const [moved] = pages.splice(fromIndex, 1);
      pages.splice(toIndex, 0, moved);
      commit((prev) => prev.map((binder) => (binder.id === binderId ? { ...binder, pages } : binder)));
      if (!target.isExample) persist(() => repo.reorderPages(binderId, pages.map((p) => p.id)));
    },
    [binders, commit, persist],
  );

  const upsertSlot = useCallback(
    (binderId: string, pageId: string, input: SlotInput) => {
      const target = binders.find((binder) => binder.id === binderId);
      const page = target?.pages.find((p) => p.id === pageId);
      // If the binder/page can't be found, no-op (as before) — nothing to place onto.
      if (!target || !page) return;

      const existing = page.slots.find((s) => s.row === input.row && s.col === input.col);

      // Desired span, then clamped so the slot never extends past the page grid. A span of
      // at least 1 is always honoured; the clamp only ever shrinks an over-reaching span.
      const wantRowSpan = input.rowSpan ?? existing?.rowSpan ?? 1;
      const wantColSpan = input.colSpan ?? existing?.colSpan ?? 1;
      const rowSpan = Math.max(1, Math.min(wantRowSpan, page.rows - input.row));
      const colSpan = Math.max(1, Math.min(wantColSpan, page.cols - input.col));

      const slot: DemoSlot = existing
        ? {
            ...existing,
            rowSpan,
            colSpan,
            type: input.type ?? existing.type,
            cardId: input.cardId ?? existing.cardId,
            insertColor: input.insertColor ?? existing.insertColor,
            imageUrl: input.imageUrl ?? existing.imageUrl,
          }
        : {
            id: uuidv4(),
            row: input.row,
            col: input.col,
            rowSpan,
            colSpan,
            type: input.type ?? 'card',
            cardId: input.cardId,
            insertColor: input.insertColor,
            imageUrl: input.imageUrl,
          };

      // When the placed slot spans more than one pocket, clear any *other* slots whose cells
      // it now covers so the span lands cleanly instead of overlapping. The slot being edited
      // is never removed (it's the one we're keeping/replacing). 1×1 placements skip this and
      // behave exactly as before.
      const removedSlotIds: string[] = [];
      if (slot.rowSpan > 1 || slot.colSpan > 1) {
        const covered = new Set(slotCells(slot));
        for (const other of page.slots) {
          if (other.id === slot.id) continue;
          if (slotCells(other).some((cell) => covered.has(cell))) removedSlotIds.push(other.id);
        }
      }

      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? {
                ...binder,
                pages: binder.pages.map((p) =>
                  p.id === pageId
                    ? {
                        ...p,
                        slots: (existing
                          ? p.slots.map((s) => (s.id === existing.id ? slot : s))
                          : [...p.slots, slot]
                        ).filter((s) => !removedSlotIds.includes(s.id)),
                      }
                    : p,
                ),
              }
            : binder,
        ),
      );
      if (!target.isExample) {
        for (const removedId of removedSlotIds) persist(() => repo.deleteSlot(removedId));
        persist(() => repo.upsertSlot(pageId, slot));
      }
    },
    [binders, commit, persist],
  );

  const addCardToBinder = useCallback(
    (binderId: string, cardId: string) => {
      const target = binders.find((b) => b.id === binderId);
      if (!target) return null;

      // First page (in order) with a free single pocket.
      let pageIndex = -1;
      let cell: { row: number; col: number } | null = null;
      for (let i = 0; i < target.pages.length; i += 1) {
        const spot = firstFreePlacement(target.pages[i], 1, 1);
        if (spot) {
          pageIndex = i;
          cell = spot;
          break;
        }
      }

      const makeSlot = (row: number, col: number): DemoSlot => ({
        id: uuidv4(),
        row,
        col,
        rowSpan: 1,
        colSpan: 1,
        type: 'card',
        cardId,
      });

      let pages: DemoPage[];
      let landedPage: DemoPage;
      let newSlot: DemoSlot;
      let appendedPage = false;

      if (pageIndex >= 0 && cell) {
        newSlot = makeSlot(cell.row, cell.col);
        pages = target.pages.map((p, i) => (i === pageIndex ? { ...p, slots: [...p.slots, newSlot] } : p));
        landedPage = pages[pageIndex];
      } else {
        // Every page is full → append a fresh page and place at its top-left.
        appendedPage = true;
        pageIndex = target.pages.length;
        newSlot = makeSlot(0, 0);
        landedPage = { ...emptyPage(3, 3, `Page ${target.pages.length + 1}`), slots: [newSlot] };
        pages = [...target.pages, landedPage];
      }

      commit((prev) => prev.map((b) => (b.id === binderId ? { ...b, pages } : b)));
      if (!target.isExample) {
        if (appendedPage) persist(() => repo.insertPage(binderId, landedPage, pageIndex));
        persist(() => repo.upsertSlot(landedPage.id, newSlot));
      }
      return { pageIndex };
    },
    [binders, commit, persist],
  );

  /**
   * Place a V-UNION as four 1×1 piece-cards filling the 2×2 block whose top-left is (row,col).
   * Requires a 2×2 to fit in bounds; clears any slots already overlapping those four cells.
   */
  const placeVUnion = useCallback(
    (binderId: string, pageId: string, row: number, col: number, pieces: readonly string[]) => {
      const target = binders.find((binder) => binder.id === binderId);
      const page = target?.pages.find((p) => p.id === pageId);
      if (!target || !page || pieces.length < 4) return;
      if (row < 0 || col < 0 || row + 2 > page.rows || col + 2 > page.cols) return;

      const positions: [number, number][] = [
        [row, col],
        [row, col + 1],
        [row + 1, col],
        [row + 1, col + 1],
      ];
      const coverCells = new Set(positions.map(([r, c]) => `${r},${c}`));
      const newSlots: DemoSlot[] = positions.map(([r, c], i) => ({
        id: uuidv4(),
        row: r,
        col: c,
        rowSpan: 1,
        colSpan: 1,
        type: 'card',
        cardId: pieces[i],
      }));
      const removed = page.slots.filter((s) => slotCells(s).some((cell) => coverCells.has(cell)));

      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? {
                ...binder,
                pages: binder.pages.map((p) =>
                  p.id === pageId
                    ? {
                        ...p,
                        slots: [
                          ...p.slots.filter((s) => !removed.some((r2) => r2.id === s.id)),
                          ...newSlots,
                        ],
                      }
                    : p,
                ),
              }
            : binder,
        ),
      );
      if (!target.isExample) {
        for (const s of removed) persist(() => repo.deleteSlot(s.id));
        for (const s of newSlots) persist(() => repo.upsertSlot(pageId, s));
      }
    },
    [binders, commit, persist],
  );

  /**
   * Slice one image across an `rows`×`cols` block of pockets: each cell becomes its own 1×1
   * artwork slot showing that fraction of the image, so it reads as a sliced scene with binder
   * gaps between the pieces. Each piece is a normal slot (draggable/editable). Clears overlaps.
   */
  const placeSlicedArtwork = useCallback(
    (
      binderId: string,
      pageId: string,
      row: number,
      col: number,
      rows: number,
      cols: number,
      imageUrl: string,
    ) => {
      const target = binders.find((binder) => binder.id === binderId);
      const page = target?.pages.find((p) => p.id === pageId);
      if (!target || !page) return;
      if (row < 0 || col < 0 || row + rows > page.rows || col + cols > page.cols) return;

      const coverCells = new Set<string>();
      const newSlots: DemoSlot[] = [];
      for (let i = 0; i < rows; i += 1) {
        for (let j = 0; j < cols; j += 1) {
          coverCells.add(`${row + i},${col + j}`);
          newSlots.push({
            id: uuidv4(),
            row: row + i,
            col: col + j,
            rowSpan: 1,
            colSpan: 1,
            type: 'artwork',
            imageUrl,
            imageCrop: { x: j / cols, y: i / rows, w: 1 / cols, h: 1 / rows },
          });
        }
      }
      const removed = page.slots.filter((s) => slotCells(s).some((cell) => coverCells.has(cell)));

      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? {
                ...binder,
                pages: binder.pages.map((p) =>
                  p.id === pageId
                    ? {
                        ...p,
                        slots: [
                          ...p.slots.filter((s) => !removed.some((r2) => r2.id === s.id)),
                          ...newSlots,
                        ],
                      }
                    : p,
                ),
              }
            : binder,
        ),
      );
      if (!target.isExample) {
        for (const s of removed) persist(() => repo.deleteSlot(s.id));
        for (const s of newSlots) persist(() => repo.upsertSlot(pageId, s));
      }
    },
    [binders, commit, persist],
  );

  /**
   * Place explicit artwork panels (from the slice studio) at a base offset — each panel keeps
   * its footprint and crop. Panels that would fall outside the page are skipped; overlaps cleared.
   */
  const placeArtPanels = useCallback(
    (binderId: string, pageId: string, baseRow: number, baseCol: number, panels: ArtPanelInput[]) => {
      const target = binders.find((binder) => binder.id === binderId);
      const page = target?.pages.find((p) => p.id === pageId);
      if (!target || !page) return;

      const coverCells = new Set<string>();
      const newSlots: DemoSlot[] = [];
      for (const panel of panels) {
        const r = baseRow + panel.r;
        const c = baseCol + panel.c;
        if (r < 0 || c < 0 || r + panel.rs > page.rows || c + panel.cs > page.cols) continue;
        for (let i = 0; i < panel.rs; i += 1) {
          for (let j = 0; j < panel.cs; j += 1) coverCells.add(`${r + i},${c + j}`);
        }
        newSlots.push({
          id: uuidv4(),
          row: r,
          col: c,
          rowSpan: panel.rs,
          colSpan: panel.cs,
          type: 'artwork',
          imageUrl: panel.imageUrl,
          imageCrop: panel.crop,
        });
      }
      if (newSlots.length === 0) return;
      const removed = page.slots.filter((s) => slotCells(s).some((cell) => coverCells.has(cell)));

      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? {
                ...binder,
                pages: binder.pages.map((p) =>
                  p.id === pageId
                    ? {
                        ...p,
                        slots: [
                          ...p.slots.filter((s) => !removed.some((r2) => r2.id === s.id)),
                          ...newSlots,
                        ],
                      }
                    : p,
                ),
              }
            : binder,
        ),
      );
      if (!target.isExample) {
        for (const s of removed) persist(() => repo.deleteSlot(s.id));
        for (const s of newSlots) persist(() => repo.upsertSlot(pageId, s));
      }
    },
    [binders, commit, persist],
  );

  /**
   * Move a slot to a new top-left cell (drag-and-drop). Clamps so the slot's footprint stays
   * in bounds; refuses (no-op) if the destination would overlap another slot — the caller
   * (the drag UI) decides whether to snap back or `swapSlots` instead.
   */
  const moveSlot = useCallback(
    (binderId: string, pageId: string, slotId: string, toRow: number, toCol: number) => {
      const target = binders.find((binder) => binder.id === binderId);
      const page = target?.pages.find((p) => p.id === pageId);
      const slot = page?.slots.find((s) => s.id === slotId);
      if (!target || !page || !slot) return;

      const row = Math.max(0, Math.min(toRow, page.rows - slot.rowSpan));
      const col = Math.max(0, Math.min(toCol, page.cols - slot.colSpan));
      if (row === slot.row && col === slot.col) return;

      const candidate = { row, col, rowSpan: slot.rowSpan, colSpan: slot.colSpan };
      if (!canPlaceSlot(page, candidate, slot.id)) return; // overlaps — caller handles it

      const moved: DemoSlot = { ...slot, row, col };
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? {
                ...binder,
                pages: binder.pages.map((p) =>
                  p.id === pageId
                    ? { ...p, slots: p.slots.map((s) => (s.id === slotId ? moved : s)) }
                    : p,
                ),
              }
            : binder,
        ),
      );
      if (!target.isExample) persist(() => repo.upsertSlot(pageId, moved));
    },
    [binders, commit, persist],
  );

  /**
   * Swap the positions of two slots on a page (drag a card onto an occupied pocket). Only
   * sensible when the two share a footprint — the drag UI enforces that before calling.
   */
  const swapSlots = useCallback(
    (binderId: string, pageId: string, slotIdA: string, slotIdB: string) => {
      if (slotIdA === slotIdB) return;
      const target = binders.find((binder) => binder.id === binderId);
      const page = target?.pages.find((p) => p.id === pageId);
      const a = page?.slots.find((s) => s.id === slotIdA);
      const b = page?.slots.find((s) => s.id === slotIdB);
      if (!target || !page || !a || !b) return;

      const movedA: DemoSlot = { ...a, row: b.row, col: b.col };
      const movedB: DemoSlot = { ...b, row: a.row, col: a.col };
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? {
                ...binder,
                pages: binder.pages.map((p) =>
                  p.id === pageId
                    ? {
                        ...p,
                        slots: p.slots.map((s) =>
                          s.id === slotIdA ? movedA : s.id === slotIdB ? movedB : s,
                        ),
                      }
                    : p,
                ),
              }
            : binder,
        ),
      );
      if (!target.isExample) {
        persist(() => repo.upsertSlot(pageId, movedA));
        persist(() => repo.upsertSlot(pageId, movedB));
      }
    },
    [binders, commit, persist],
  );

  const removeSlot = useCallback(
    (binderId: string, pageId: string, slotId: string) => {
      const target = binders.find((binder) => binder.id === binderId);
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? {
                ...binder,
                pages: binder.pages.map((page) =>
                  page.id === pageId
                    ? { ...page, slots: page.slots.filter((slot) => slot.id !== slotId) }
                    : page,
                ),
              }
            : binder,
        ),
      );
      if (target && !target.isExample) persist(() => repo.deleteSlot(slotId));
    },
    [binders, commit, persist],
  );

  const value = useMemo<BinderStore>(
    () => ({
      binders,
      exampleBinders: binders.filter((binder) => binder.isExample),
      userBinders: binders.filter((binder) => !binder.isExample),
      loading,
      getBinder,
      createBinder,
      createBinderWithCard,
      duplicateBinder,
      updateBinder,
      deleteBinder,
      addPage,
      updatePage,
      removePage,
      reorderPages,
      upsertSlot,
      addCardToBinder,
      placeVUnion,
      placeSlicedArtwork,
      placeArtPanels,
      moveSlot,
      swapSlots,
      removeSlot,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [
      binders,
      loading,
      getBinder,
      createBinder,
      createBinderWithCard,
      duplicateBinder,
      updateBinder,
      deleteBinder,
      addPage,
      updatePage,
      removePage,
      reorderPages,
      upsertSlot,
      addCardToBinder,
      placeVUnion,
      placeSlicedArtwork,
      placeArtPanels,
      moveSlot,
      swapSlots,
      removeSlot,
      undo,
      redo,
      history.past.length,
      history.future.length,
    ],
  );

  return <BinderContext.Provider value={value}>{children}</BinderContext.Provider>;
}

export function useBinders(): BinderStore {
  const store = useContext(BinderContext);
  if (!store) throw new Error('useBinders must be used within a BinderProvider');
  return store;
}
