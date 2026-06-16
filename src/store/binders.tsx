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
  cloneBinder,
  emptyPage,
  slotCells,
  uuidv4,
  type DemoBinder,
  type DemoPage,
  type DemoSlot,
  type MichiLayoutStyle,
} from '@/data/binderTypes';
import { SAMPLE_BINDERS } from '@/data/sampleData';
import { isSupabaseConfigured } from '@/lib/env';

const CLOUD = isSupabaseConfigured;

export interface SlotInput {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  type?: DemoSlot['type'];
  cardId?: string;
  insertColor?: string;
}

interface BinderStore {
  binders: DemoBinder[];
  exampleBinders: DemoBinder[];
  userBinders: DemoBinder[];
  /** True while user binders are loading from Supabase (always false in local mode). */
  loading: boolean;
  getBinder: (id: string) => DemoBinder | undefined;
  createBinder: (init?: Partial<DemoBinder>) => DemoBinder;
  duplicateBinder: (id: string) => DemoBinder | undefined;
  updateBinder: (id: string, patch: Partial<DemoBinder>) => void;
  deleteBinder: (id: string) => void;
  addPage: (binderId: string) => void;
  updatePage: (binderId: string, pageId: string, patch: Partial<DemoPage>) => void;
  removePage: (binderId: string, pageId: string) => void;
  upsertSlot: (binderId: string, pageId: string, slot: SlotInput) => void;
  removeSlot: (binderId: string, pageId: string, slotId: string) => void;
}

const BinderContext = createContext<BinderStore | null>(null);

export function BinderProvider({ children }: { children: ReactNode }) {
  const [binders, setBinders] = useState<DemoBinder[]>(SAMPLE_BINDERS);
  const [loading, setLoading] = useState<boolean>(CLOUD);

  // Load user binders from Supabase once (examples stay bundled/local).
  useEffect(() => {
    if (!CLOUD) return;
    let active = true;
    (async () => {
      try {
        await repo.ensureSession();
        const userBinders = await repo.fetchUserBinders();
        if (active) setBinders([...SAMPLE_BINDERS, ...userBinders]);
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
  }, []);

  /** Run a persistence op in cloud mode; never let a failed write crash the UI. */
  const persist = useCallback((op: () => Promise<void>) => {
    if (!CLOUD) return;
    op().catch((error) => console.error(`[poke-michi] persist failed: ${(error as Error).message}`));
  }, []);

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
      setBinders((prev) => [...prev, binder]);
      persist(() => repo.insertBinder(binder));
      return binder;
    },
    [persist],
  );

  const duplicateBinder = useCallback(
    (id: string) => {
      const source = binders.find((binder) => binder.id === id);
      if (!source) return undefined;
      const copy = cloneBinder(source, { title: `${source.title} (copy)` });
      setBinders((prev) => [...prev, copy]);
      persist(() => repo.insertBinder(copy));
      return copy;
    },
    [binders, persist],
  );

  const updateBinder = useCallback(
    (id: string, patch: Partial<DemoBinder>) => {
      const target = binders.find((binder) => binder.id === id);
      setBinders((prev) => prev.map((binder) => (binder.id === id ? { ...binder, ...patch } : binder)));
      if (target && !target.isExample) persist(() => repo.updateBinder(id, patch));
    },
    [binders, persist],
  );

  const deleteBinder = useCallback(
    (id: string) => {
      const target = binders.find((binder) => binder.id === id);
      setBinders((prev) => prev.filter((binder) => binder.id !== id));
      if (target && !target.isExample) persist(() => repo.deleteBinder(id));
    },
    [binders, persist],
  );

  const addPage = useCallback(
    (binderId: string) => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target) return;
      const page = emptyPage(3, 3, `Page ${target.pages.length + 1}`);
      setBinders((prev) =>
        prev.map((binder) =>
          binder.id === binderId ? { ...binder, pages: [...binder.pages, page] } : binder,
        ),
      );
      if (!target.isExample) persist(() => repo.insertPage(binderId, page, target.pages.length));
    },
    [binders, persist],
  );

  const updatePage = useCallback(
    (binderId: string, pageId: string, patch: Partial<DemoPage>) => {
      const target = binders.find((binder) => binder.id === binderId);
      setBinders((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? { ...binder, pages: binder.pages.map((page) => (page.id === pageId ? { ...page, ...patch } : page)) }
            : binder,
        ),
      );
      if (target && !target.isExample) persist(() => repo.updatePage(pageId, patch));
    },
    [binders, persist],
  );

  const removePage = useCallback(
    (binderId: string, pageId: string) => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target || target.pages.length <= 1) return; // never leave a binder with zero pages
      setBinders((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? { ...binder, pages: binder.pages.filter((page) => page.id !== pageId) }
            : binder,
        ),
      );
      if (!target.isExample) persist(() => repo.deletePage(pageId));
    },
    [binders, persist],
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

      setBinders((prev) =>
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
    [binders, persist],
  );

  const removeSlot = useCallback(
    (binderId: string, pageId: string, slotId: string) => {
      const target = binders.find((binder) => binder.id === binderId);
      setBinders((prev) =>
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
    [binders, persist],
  );

  const value = useMemo<BinderStore>(
    () => ({
      binders,
      exampleBinders: binders.filter((binder) => binder.isExample),
      userBinders: binders.filter((binder) => !binder.isExample),
      loading,
      getBinder,
      createBinder,
      duplicateBinder,
      updateBinder,
      deleteBinder,
      addPage,
      updatePage,
      removePage,
      upsertSlot,
      removeSlot,
    }),
    [
      binders,
      loading,
      getBinder,
      createBinder,
      duplicateBinder,
      updateBinder,
      deleteBinder,
      addPage,
      updatePage,
      removePage,
      upsertSlot,
      removeSlot,
    ],
  );

  return <BinderContext.Provider value={value}>{children}</BinderContext.Provider>;
}

export function useBinders(): BinderStore {
  const store = useContext(BinderContext);
  if (!store) throw new Error('useBinders must be used within a BinderProvider');
  return store;
}
