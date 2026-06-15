/**
 * In-memory binder store.
 *
 * The single source of truth for binders while the app runs. Seeded with the premade
 * example binders. This is deliberately the *only* module that knows binders are held in
 * memory — swapping it for Supabase queries later means rewriting this file, not the UI.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  cloneBinder,
  emptyPage,
  uid,
  type DemoBinder,
  type DemoPage,
  type DemoSlot,
  type MichiLayoutStyle,
} from '@/data/binderTypes';
import { SAMPLE_BINDERS } from '@/data/sampleData';

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
  getBinder: (id: string) => DemoBinder | undefined;
  createBinder: (init?: Partial<DemoBinder>) => DemoBinder;
  duplicateBinder: (id: string) => DemoBinder | undefined;
  updateBinder: (id: string, patch: Partial<DemoBinder>) => void;
  deleteBinder: (id: string) => void;
  addPage: (binderId: string) => void;
  updatePage: (binderId: string, pageId: string, patch: Partial<DemoPage>) => void;
  removePage: (binderId: string, pageId: string) => void;
  /** Create or replace the slot whose top-left is (row, col). */
  upsertSlot: (binderId: string, pageId: string, slot: SlotInput) => void;
  removeSlot: (binderId: string, pageId: string, slotId: string) => void;
}

const BinderContext = createContext<BinderStore | null>(null);

export function BinderProvider({ children }: { children: ReactNode }) {
  const [binders, setBinders] = useState<DemoBinder[]>(SAMPLE_BINDERS);

  const mutateBinder = useCallback((id: string, fn: (binder: DemoBinder) => DemoBinder) => {
    setBinders((prev) => prev.map((binder) => (binder.id === id ? fn(binder) : binder)));
  }, []);

  const mutatePage = useCallback(
    (binderId: string, pageId: string, fn: (page: DemoPage) => DemoPage) => {
      mutateBinder(binderId, (binder) => ({
        ...binder,
        pages: binder.pages.map((page) => (page.id === pageId ? fn(page) : page)),
      }));
    },
    [mutateBinder],
  );

  const getBinder = useCallback(
    (id: string) => binders.find((binder) => binder.id === id),
    [binders],
  );

  const createBinder = useCallback((init?: Partial<DemoBinder>) => {
    const binder: DemoBinder = {
      id: uid('binder'),
      title: 'Untitled binder',
      layoutStyle: 'freeform' as MichiLayoutStyle,
      isExample: false,
      pages: [emptyPage()],
      ...init,
    };
    setBinders((prev) => [...prev, binder]);
    return binder;
  }, []);

  const duplicateBinder = useCallback(
    (id: string) => {
      const source = binders.find((binder) => binder.id === id);
      if (!source) return undefined;
      const copy = cloneBinder(source, { title: `${source.title} (copy)` });
      setBinders((prev) => [...prev, copy]);
      return copy;
    },
    [binders],
  );

  const updateBinder = useCallback(
    (id: string, patch: Partial<DemoBinder>) => mutateBinder(id, (binder) => ({ ...binder, ...patch })),
    [mutateBinder],
  );

  const deleteBinder = useCallback((id: string) => {
    setBinders((prev) => prev.filter((binder) => binder.id !== id));
  }, []);

  const addPage = useCallback(
    (binderId: string) => {
      mutateBinder(binderId, (binder) => ({
        ...binder,
        pages: [...binder.pages, emptyPage(3, 3, `Page ${binder.pages.length + 1}`)],
      }));
    },
    [mutateBinder],
  );

  const updatePage = useCallback(
    (binderId: string, pageId: string, patch: Partial<DemoPage>) =>
      mutatePage(binderId, pageId, (page) => ({ ...page, ...patch })),
    [mutatePage],
  );

  const removePage = useCallback(
    (binderId: string, pageId: string) => {
      mutateBinder(binderId, (binder) => {
        // Never leave a binder with zero pages.
        if (binder.pages.length <= 1) return binder;
        return { ...binder, pages: binder.pages.filter((page) => page.id !== pageId) };
      });
    },
    [mutateBinder],
  );

  const upsertSlot = useCallback(
    (binderId: string, pageId: string, input: SlotInput) => {
      mutatePage(binderId, pageId, (page) => {
        const existing = page.slots.find((slot) => slot.row === input.row && slot.col === input.col);
        if (existing) {
          const merged: DemoSlot = {
            ...existing,
            rowSpan: input.rowSpan ?? existing.rowSpan,
            colSpan: input.colSpan ?? existing.colSpan,
            type: input.type ?? existing.type,
            cardId: input.cardId ?? existing.cardId,
            insertColor: input.insertColor ?? existing.insertColor,
          };
          return { ...page, slots: page.slots.map((slot) => (slot.id === existing.id ? merged : slot)) };
        }
        const slot: DemoSlot = {
          id: uid('slot'),
          row: input.row,
          col: input.col,
          rowSpan: input.rowSpan ?? 1,
          colSpan: input.colSpan ?? 1,
          type: input.type ?? 'card',
          cardId: input.cardId,
          insertColor: input.insertColor,
        };
        return { ...page, slots: [...page.slots, slot] };
      });
    },
    [mutatePage],
  );

  const removeSlot = useCallback(
    (binderId: string, pageId: string, slotId: string) =>
      mutatePage(binderId, pageId, (page) => ({
        ...page,
        slots: page.slots.filter((slot) => slot.id !== slotId),
      })),
    [mutatePage],
  );

  const value = useMemo<BinderStore>(
    () => ({
      binders,
      exampleBinders: binders.filter((binder) => binder.isExample),
      userBinders: binders.filter((binder) => !binder.isExample),
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
