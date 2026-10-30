/**
 * THE FRAME TABLE, loaded once (docs/ART-FRAMES-HANDOFF.md; data/artView.ts cardFrame).
 *
 * `frames.json` sits beside the catalogue in the browse bucket: 133 classes on 2026-10-30, about
 * 14 KB, public. It is fetched the first time an art view asks for it and kept for the page's
 * life; a failed fetch leaves the table empty, which is the fallback window everywhere, and is
 * retried on the next ask. Pure module state with a subscribe, so `useFrames` can hand React a
 * snapshot through useSyncExternalStore, the way lib/catalog does for the catalogue.
 */
import { normalizeFrames, type FrameTable } from '@/data/artView';
import { browseUrl } from '@/lib/catalogConfig';

let table: FrameTable | null = null;
let loading: Promise<FrameTable> | null = null;
const listeners = new Set<() => void>();

/** The table as loaded, or null before the first fetch resolves. */
export function getFrames(): FrameTable | null {
  return table;
}

export function subscribeFrames(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Fetch once; concurrent callers share the promise. Resolves to the table, empty on failure. */
export function loadFrames(): Promise<FrameTable> {
  if (table) return Promise.resolve(table);
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetch(`${browseUrl}/frames.json`);
      if (!res.ok) throw new Error(`frames.json ${res.status}`);
      const loaded = normalizeFrames(await res.json());
      table = loaded;
      for (const fn of listeners) fn();
      return loaded;
    } catch {
      table = null; // the next ask tries again
      return {};
    } finally {
      loading = null;
    }
  })();
  return loading;
}
