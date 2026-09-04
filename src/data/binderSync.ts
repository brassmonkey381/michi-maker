/**
 * WHAT AN UNDO OR REDO ACTUALLY CHANGED, so that is all it writes.
 *
 * Undo and redo swap whole snapshots of every binder, and the sync used to answer "which binders
 * differ" and then rewrite each of those binders IN FULL — every page, every slot. That is how a
 * page nobody had touched could be overwritten: a client holding an older copy of a binder undid
 * an unrelated edit, the binder's object had changed, and the whole stale binder went back to the
 * server, page 3's art included (2026-08-31 05:36 UTC, "Pikachu and Friends", the bridge).
 *
 * This diff is page-grained. A binder whose pages are the same objects in the same order is
 * written only where it differs: its metadata row if that differs, and exactly the pages whose
 * object changed. Only a binder whose page LIST changed (a page added, removed or moved) is
 * written whole, because positions then have to be rewritten together.
 *
 * Pure and reference-based on purpose: the store never mutates a binder or page in place, so
 * "same object" is "unchanged", and this stays cheap enough to run on every undo.
 */
import type { DemoBinder, DemoPage } from '@/data/binderTypes';

export interface ScopedWrite<B> {
  binder: B;
  /** The binder row itself (title, description, flags…) differs. */
  meta: boolean;
  /** Ids of the pages whose content differs, in binder order. */
  pageIds: string[];
}

export interface SnapshotDiff<B> {
  /** Binders to rewrite whole: new to the snapshot, or with a changed page list. */
  full: B[];
  /** Binders to write in part. Only present when something in them differs. */
  scoped: ScopedWrite<B>[];
  /** Binders present before and gone after. */
  removed: B[];
}

type PageLike = Pick<DemoPage, 'id'>;
type BinderLike = Pick<DemoBinder, 'id' | 'isExample'> & { pages: PageLike[] };

/** True when both binders list the same page ids in the same order. */
function samePageList(a: BinderLike, b: BinderLike): boolean {
  if (a.pages.length !== b.pages.length) return false;
  for (let i = 0; i < a.pages.length; i++) if (a.pages[i].id !== b.pages[i].id) return false;
  return true;
}

/** The binder row differs when anything but `pages` does. */
function metaDiffers(a: BinderLike, b: BinderLike): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete('pages');
  for (const k of keys) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return true;
  }
  return false;
}

export function diffSnapshots<B extends BinderLike>(from: B[], to: B[]): SnapshotDiff<B> {
  const fromById = new Map(from.map((b) => [b.id, b]));
  const toIds = new Set(to.map((b) => b.id));
  const full: B[] = [];
  const scoped: ScopedWrite<B>[] = [];
  for (const b of to) {
    if (b.isExample) continue;
    const prev = fromById.get(b.id);
    if (prev === b) continue;
    if (!prev || !samePageList(prev, b)) {
      full.push(b);
      continue;
    }
    const pageIds = b.pages.filter((p, i) => prev.pages[i] !== p).map((p) => p.id);
    const meta = metaDiffers(prev, b);
    if (pageIds.length > 0 || meta) scoped.push({ binder: b, meta, pageIds });
  }
  const removed = from.filter((b) => !b.isExample && !toIds.has(b.id));
  return { full, scoped, removed };
}
