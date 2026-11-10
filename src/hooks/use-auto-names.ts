/**
 * AUTO NAMES IN THE EDITOR (MIC-034, owner 2026-11-10). While a page or binder field is still the
 * app's (isFieldLocked), it follows the cards: 1.5 s after the cards stop changing, every unlocked
 * page title and description and the binder's title and description are set from the rules
 * (data/autoNames), on screen only, with no undo step. They are SAVED ONCE, when the editor turns
 * to another page or closes, so a burst of edits is one small write per page, not one per card.
 *
 * Card facts: the catalogue when this device already has it (members), else the cards by id from
 * the card server (the kit caches them; the page's pictures already come from the same place).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCardsByIds } from 'tcgscan-browse';

import { autoBinderText, autoPageText, isFieldLocked, type NameCard } from '@/data/autoNames';
import type { DemoBinder, DemoPage } from '@/data/binderTypes';
import { useCatalog } from '@/hooks/use-catalog';
import { useBinders } from '@/store/binders';

const SETTLE_MS = 1500;

type Pending = { binder: Partial<DemoBinder> | null; pages: Record<string, Partial<DemoPage>> };

export function useAutoNames(binder: DemoBinder | undefined, pageIndex: number, on: boolean): void {
  const store = useBinders();
  const { catalog } = useCatalog(false);
  const [fetched, setFetched] = useState<ReadonlyMap<string, NameCard>>(new Map());

  const ids = useMemo(() => {
    if (!binder) return [] as string[];
    const out = new Set<string>();
    for (const p of binder.pages) for (const s of p.slots) if (s.cardId) out.add(s.cardId);
    return [...out];
  }, [binder]);
  const idsKey = ids.join(',');

  const lookup = useMemo(() => {
    return (id: string): NameCard | undefined => (catalog?.getCard(id) as NameCard | undefined) ?? fetched.get(id);
  }, [catalog, fetched]);

  // Cards this device cannot name yet: fetch them once.
  useEffect(() => {
    if (!on || !ids.length) return;
    const missing = ids.filter((id) => !lookup(id));
    if (!missing.length) return;
    let live = true;
    fetchCardsByIds(missing)
      .then((cards) => {
        if (!live || !cards.length) return;
        setFetched((m) => {
          const next = new Map(m);
          for (const c of cards) next.set(c.id, c);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // idsKey stands in for ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, idsKey, lookup]);

  // What the rules say now, for every unlocked field that differs from what is shown.
  const want = useMemo((): Pending | null => {
    if (!on || !binder) return null;
    const pageCards = binder.pages.map((p) =>
      [...p.slots]
        .filter((s) => s.cardId)
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .map((s) => lookup(s.cardId!))
        .filter((c): c is NameCard => !!c),
    );
    // Wait until every card on a page is known, or a half-read page gets a half-right name.
    const known = binder.pages.map((p, i) => pageCards[i].length === p.slots.filter((s) => s.cardId).length);
    const pages: Record<string, Partial<DemoPage>> = {};
    binder.pages.forEach((p, i) => {
      if (!known[i] || !pageCards[i].length) return;
      const t = autoPageText(pageCards[i]);
      const patch: Partial<DemoPage> = {};
      // The words AND an explicit false: a field the app filled must still read as the app's.
      if (!isFieldLocked(p.titleLocked, p.title) && t.title && (t.title !== p.title || p.titleLocked !== false)) Object.assign(patch, { title: t.title, titleLocked: false });
      if (!isFieldLocked(p.descriptionLocked, p.description) && t.description && (t.description !== p.description || p.descriptionLocked !== false)) Object.assign(patch, { description: t.description, descriptionLocked: false });
      if (Object.keys(patch).length) pages[p.id] = patch;
    });
    let binderPatch: Partial<DemoBinder> | null = null;
    if (known.every(Boolean) && pageCards.some((c) => c.length)) {
      const t = autoBinderText(pageCards);
      const patch: Partial<DemoBinder> = {};
      if (!isFieldLocked(binder.titleLocked, binder.title) && t.title && (t.title !== binder.title || binder.titleLocked !== false)) Object.assign(patch, { title: t.title, titleLocked: false });
      if (!isFieldLocked(binder.descriptionLocked, binder.description) && t.description && (t.description !== binder.description || binder.descriptionLocked !== false)) Object.assign(patch, { description: t.description, descriptionLocked: false });
      if (Object.keys(patch).length) binderPatch = patch;
    }
    return binderPatch || Object.keys(pages).length ? { binder: binderPatch, pages } : null;
  }, [on, binder, lookup]);
  const wantKey = want ? JSON.stringify(want) : '';

  // Fields set on screen and not saved yet: field names per page id ('' = the binder).
  const dirty = useRef<Map<string, Set<string>>>(new Map());
  const latest = useRef<DemoBinder | undefined>(binder);
  useEffect(() => {
    latest.current = binder;
  }, [binder]);

  // Show the new words once the cards settle.
  useEffect(() => {
    if (!want || !binder) return;
    const id = binder.id;
    const t = setTimeout(() => {
      store.setAutoText(id, want.binder, want.pages, false);
      const mark = (key: string, fields: string[]) => {
        const s = dirty.current.get(key) ?? new Set<string>();
        for (const f of fields) s.add(f);
        dirty.current.set(key, s);
      };
      if (want.binder) mark('', Object.keys(want.binder));
      for (const [pid, patch] of Object.entries(want.pages)) mark(pid, Object.keys(patch));
    }, SETTLE_MS);
    return () => clearTimeout(t);
    // wantKey stands in for want; store's identity changes with every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantKey]);

  // Save what was shown: when the page turns, the editor closes, or the screen goes.
  useEffect(() => {
    return () => {
      const b = latest.current;
      if (!b || !dirty.current.size) return;
      let binderPatch: Partial<DemoBinder> | null = null;
      const pages: Record<string, Partial<DemoPage>> = {};
      for (const [key, fields] of dirty.current) {
        if (key === '') {
          binderPatch = {};
          // The words AND the unlocked flag: a saved auto name must still read as the app's.
          if (fields.has('title') && !b.titleLocked) Object.assign(binderPatch, { title: b.title, titleLocked: false });
          if (fields.has('description') && !b.descriptionLocked) Object.assign(binderPatch, { description: b.description, descriptionLocked: false });
          if (!Object.keys(binderPatch).length) binderPatch = null;
        } else {
          const p = b.pages.find((x) => x.id === key);
          if (!p) continue;
          const patch: Partial<DemoPage> = {};
          if (fields.has('title') && !p.titleLocked) Object.assign(patch, { title: p.title, titleLocked: false });
          if (fields.has('description') && !p.descriptionLocked) Object.assign(patch, { description: p.description, descriptionLocked: false });
          if (Object.keys(patch).length) pages[key] = patch;
        }
      }
      dirty.current.clear();
      store.setAutoText(b.id, binderPatch, pages, true);
    };
    // Only the page turn and the editor closing flush; store is read at flush time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, on, binder?.id]);
}
