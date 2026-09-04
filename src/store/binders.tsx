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
 * (cheap — the mutators already build new immutable arrays). Undo/redo restore the snapshot AND
 * re-sync it: `syncChanged` diffs the two states and persists the difference, so an undone edit is
 * undone on the server too (this was once forward-only; it is not any more).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { isCustomArtwork, isPrivateArt, markCopiedArtBorrowed } from '@/data/artAttributionCheck';
import { deriveAttribution } from '@/data/artworkLibrary';
import type { ComposePlacement } from '@/data/pageComposer';
import * as repo from '@/data/binderRepo';
import { slotSignature } from '@/data/savedSlices';
import { legalizeArtPanels, pageSide, requiredPageSide } from '@/data/binderPhysics';
import { diffSnapshots } from '@/data/binderSync';
import { EXAMPLE_FILL_SHEET_BINDER } from '@/data/exampleFillSheetBinder';
import {
  binderSignature,
  canPlaceSlot,
  cloneBinder,
  duplicatedSlots,
  emptyPage,
  fillerName,
  firstFreePlacement,
  GENERIC_BINDER_TITLES,
  movedSlots,
  occupiedCells,
  remintBinderIds,
  slotCells,
  uuidv4,
  type DemoBinder,
  type DemoPage,
  type DemoSlot,
  type ImageTransform,
  type MichiLayoutStyle,
} from '@/data/binderTypes';
import { SAMPLE_BINDERS } from '@/data/sampleData';
import { loadOwnedEntriesShared } from '@/data/collectionRepo';
import { track } from '@/lib/analytics';
import { LIMITS_ENFORCED, type Tier, type TierLimits } from '@/data/tiers';
import { useEditLock, type EditLockStatus } from '@/hooks/use-edit-lock';
import { useTier } from '@/hooks/use-tier';
import { isSupabaseConfigured } from '@/lib/env';
import { defaultBinderPublic } from '@/data/sharingDefaults';
import { importRemoteArtToBucket } from '@/lib/importArt';
import { useAuth } from '@/store/auth';

const CLOUD = isSupabaseConfigured;
const HISTORY_LIMIT = 50;

/**
 * A page with nothing on it and nothing typed on it — what the parity pass inserts as a spacer,
 * and the only thing "Compact blanks" will remove (a titled or described empty page is a page
 * the user is keeping on purpose).
 */
export function isBlankPage(page: DemoPage): boolean {
  return page.slots.length === 0 && !page.title && !page.description;
}

/**
 * Insert blank spacer pages so every side-pinned page (binderPhysics.requiredPageSide — a page
 * holding a folded 1×2 art piece on a 3-column grid) sits on the side of the spine its art
 * demands. Binders are double-sided, so ANY structural edit that shifts page indices —
 * duplicate, delete, reorder — flips the side of every page after it; running the result
 * through this keeps the whole binder physically bindable, at the cost of an occasional
 * visible blank page (which stays deletable: removing it re-runs this and only re-adds a
 * blank if something still needs it).
 */
function withParitySpacers(pages: DemoPage[]): { pages: DemoPage[]; blanksInserted: number } {
  let blanksInserted = 0;
  const out: DemoPage[] = [];
  for (const page of pages) {
    const need = requiredPageSide(page);
    if (need && pageSide(out.length) !== need) {
      out.push(emptyPage(page.rows, page.cols));
      blanksInserted += 1;
    }
    out.push(page);
  }
  return { pages: out, blanksInserted };
}

export interface SlotInput {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  type?: DemoSlot['type'];
  cardId?: string;
  insertColor?: string;
  imageUrl?: string;
  /**
   * WHICH owned copy this pocket claims (portfolio_entries.id). Implies fromCollection.
   * `null` DETACHES it — the pocket goes back to being the catalogue image and the copy goes back
   * to being free. Undefined means "not mentioned", which leaves an existing stamp alone; the two
   * have to be different values or "keep what is there" and "let my card go" are the same call.
   */
  sourceEntryId?: string | null;
}

/** One panel from the slice studio: a grid region of an image plus its crop. */
export interface ArtPanelInput {
  r: number;
  c: number;
  rs: number;
  cs: number;
  imageUrl: string;
  crop: { x: number; y: number; w: number; h: number };
  /** 'cover' (fill, crop overflow) or 'contain' (whole image, original aspect). Default 'cover'. */
  fit?: 'cover' | 'contain';
  /** Rotation / mirror applied before the crop window. Absent ⇒ as-is. */
  transform?: ImageTransform;
  /** Provenance to stamp on the placed slot (public-binder attribution gate). */
  attribution?: DemoSlot['attribution'];
}

interface BinderStore {
  binders: DemoBinder[];
  exampleBinders: DemoBinder[];
  featuredBinders: DemoBinder[];
  userBinders: DemoBinder[];
  /** True while user binders are loading from Supabase (always false in local mode). */
  loading: boolean;
  /**
   * May THIS tab write? False only while another tab of the same browser holds the editing
   * lease, or while this one is pulling the server's state after taking it over. Surfaces are
   * expected to go read-only rather than let an edit look accepted and then not save — every
   * write is refused underneath either way (see persist).
   */
  canEdit: boolean;
  /**
   * The first cloud write that failed since this was last cleared, or null. What is on screen
   * is optimistic: when a save fails the two disagree, and only the server's copy survives a
   * reload — so this exists to say so at the time rather than let it be discovered later.
   */
  saveError: string | null;
  /** Dismiss the save-failure notice (the user acknowledged it, or reloaded). */
  clearSaveError: () => void;
  /** Why canEdit reads as it does, for the banner that explains it. */
  editLockStatus: EditLockStatus;
  /** Move editing to this tab on purpose. Bringing the tab forward already does this. */
  takeOverEditing: () => void;
  /** The signed-in user's effective tier (guest / free / pro / vip). */
  tier: Tier;
  /** Active capability limits for that tier (permissive/unlimited while LIMITS_ENFORCED is off). */
  limits: TierLimits;
  /** Count of the user's own (non-example) binders. */
  binderCount: number;
  /** True when creating another binder would exceed the tier limit (always false while the flag is off). */
  atBinderLimit: boolean;
  /** True when adding a page to this binder would exceed the tier limit (always false while the flag is off). */
  pageLimitReached: (binderId: string) => boolean;
  getBinder: (id: string) => DemoBinder | undefined;
  /** Create a binder. Returns undefined when the tier's binder cap refuses it (callers show the
   *  upgrade note), same contract as duplicateBinder. Demo/example binders are free of the cap. */
  createBinder: (init?: Partial<DemoBinder>) => DemoBinder | undefined;
  /** Create a fresh binder seeded with one card in its first pocket (atomic). Undefined at the cap. */
  createBinderWithCard: (cardId: string) => DemoBinder | undefined;
  duplicateBinder: (id: string) => DemoBinder | undefined;
  /**
   * True when `id` is a duplicate created THIS session whose content is still byte-for-byte what
   * duplication produced (session-scoped — a reload forgets it). Lets the delete UI skip the
   * "type the name to confirm" gate for a throwaway copy the user made and immediately wants gone.
   */
  isPristineDuplicate: (id: string) => boolean;
  updateBinder: (id: string, patch: Partial<DemoBinder>) => void;
  deleteBinder: (id: string) => void;
  addPage: (binderId: string) => void;
  /** Clone a page (new ids for the page + every slot) and insert it right after the original.
   *  The result is re-spaced with blank pages wherever folded 1×2 art would land on the wrong
   *  side of the spine (withParitySpacers). Returns the copy's index and how many blanks were
   *  added, or null if the binder/page can't be found. */
  duplicatePage: (
    binderId: string,
    pageId: string,
  ) => { pageIndex: number; blanksInserted: number } | null;
  updatePage: (binderId: string, pageId: string, patch: Partial<DemoPage>) => void;
  /** Uniform pocket layout for the whole binder; refuses when content would fall outside. */
  setBinderPageSize: (binderId: string, rows: number, cols: number) => { ok: boolean; reason?: string };
  /** One background colour for the whole binder — see setBinderBackground. */
  setBinderBackground: (binderId: string, backgroundColor?: string) => void;
  /** Delete a page; the remainder is re-spaced with blanks so later folded art keeps its side. */
  removePage: (binderId: string, pageId: string) => { blanksInserted: number } | null;
  /** Copy (or move) a page into another binder. See the implementation for the refusal reasons. */
  sendPageToBinder: (
    fromBinderId: string,
    pageId: string,
    toBinderId: string,
    opts?: { move?: boolean },
  ) =>
    | { status: 'ok'; move: boolean; blanksInserted: number }
    | { status: 'size-mismatch' | 'target-full' | 'last-page' | 'not-found' };
  /** Move a page; the result is re-spaced with blanks so all folded art keeps its side. Returns
   *  the moved page's final index (spacers can shift it past the raw drop index). */
  reorderPages: (
    binderId: string,
    fromIndex: number,
    toIndex: number,
  ) => { pageIndex: number; blanksInserted: number } | null;
  /** Remove every blank page (no slots, no title/description) the parity pass doesn't still
   *  need as a spacer. Returns how many were removed and how many blanks remain. */
  compactBlankPages: (binderId: string) => { removed: number; kept: number } | null;
  upsertSlot: (binderId: string, pageId: string, slot: SlotInput) => void;
  /**
   * Save OUR OWN copies of a binder's unhosted (hotlink) art: fetch each off-site image, upload
   * it to the user's bucket, and point the slot at the copy, keeping the credit (the old URL
   * becomes attribution.sourceUrl when none was recorded). What converts becomes public-eligible
   * under the hosted-bytes rule; what cannot be fetched (a site that blocks both CORS and the
   * art-proxy) is counted in `failed` and stays private until uploaded by hand. Returns the
   * updated binder so the caller (ShareSheet) can re-run the gate without waiting on state.
   */
  rehostBinderArt: (binderId: string) => Promise<{ fixed: number; failed: number; binder: DemoBinder | null }>;
  /**
   * Drop a card into a binder's first free 1×1 pocket (scanning pages in order; appends a new
   * page if every page is full, but never past the tier's per-binder page cap). Atomic — one
   * history entry. Returns the page index it landed on, or null if the binder can't be found or
   * the page cap leaves nowhere to put it.
   */
  addCardToBinder: (binderId: string, cardId: string) => { pageIndex: number } | null;
  /** Batch-add many cards, each to the next free 1×1 pocket (appending pages as needed, but never
   *  past the tier's per-binder page cap), in ONE commit + persist pass — avoids the stale-closure
   *  re-placement that a per-card loop hits. `fromCollection` marks the pockets as consuming owned
   *  copies (My-collection provenance). `unplaced` is how many cards the cap left out, so callers
   *  can surface the upgrade note instead of dropping them silently.
   *
   *  `startPageIndex` switches to CONTIGUOUS placement, which is what the editor wants: fill the
   *  page the user is looking at, then insert fresh pages immediately AFTER it and keep going.
   *  Without it, placement scans from page 1 for any gap and appends overflow at the very end,
   *  which scatters one batch across a binder the user has already arranged. `blanksInserted` is
   *  the parity spacers that insertion forced (see withParitySpacers), for the caller's toast. */
  addCardsToBinder: (
    binderId: string,
    cardIds: string[],
    opts?: { fromCollection?: boolean; startPageIndex?: number; entryIds?: (string | undefined)[] },
  ) => {
    added: number;
    unplaced: number;
    blanksInserted: number;
    /** Pockets that claimed one of the user's actual copies. The rest are aspirational. */
    claimed: number;
    /** Requested claims the guard refused (the entry's budget was already spent) — the caller's
     *  cue to say a pocket shows catalogue art rather than staying silent about it. */
    droppedClaims: number;
  };
  /**
   * Append whole composed pages ("Pages around this card", VIP). Each entry becomes ONE new page
   * carrying the seed plus that method's placements. One commit, so the whole batch is one Undo.
   */
  appendComposedPages: (
    binderId: string,
    pages: { title: string; seedCardId: string; placements: ComposePlacement[] }[],
  ) => { added: number; skipped: number };
  /** Batch-place 1×1 pockets at explicit page cells (the page composer's output) in ONE commit —
   *  a single history entry so the whole auto-fill undoes at once. Each placement is a card, a
   *  tonal insert, or an artwork slice (exactly one of cardId / insertColor / imageUrl). Cells
   *  already occupied are skipped. Returns how many were placed. */
  placeCards: (
    binderId: string,
    pageId: string,
    placements: {
      row: number;
      col: number;
      cardId?: string;
      insertColor?: string;
      imageUrl?: string;
      imageCrop?: { x: number; y: number; w: number; h: number };
      /** This pocket consumes an owned copy (fill-from-my-collection provenance). */
      fromCollection?: boolean;
      /** WHICH owned copy it consumes (portfolio_entries.id). Implies fromCollection. */
      sourceEntryId?: string;
    }[],
  ) => {
    placed: number;
    droppedClaims: number;
    /** Created pockets that were MEANT to hold an owned copy but got no stamp (assigner dry or
     *  claim refused) — the exact catalogue-art count for the caller's toast. */
    placedUnclaimed: number;
  };
  placeVUnion: (binderId: string, pageId: string, row: number, col: number, pieces: readonly string[]) => void;
  placeSlicedArtwork: (
    binderId: string,
    pageId: string,
    row: number,
    col: number,
    rows: number,
    cols: number,
    imageUrl: string,
    attribution?: DemoSlot['attribution'],
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
  /** Move (or same-footprint-swap) a slot from one page to another — dragging across the spread. */
  moveSlotAcrossPages: (
    binderId: string,
    fromPageId: string,
    slotId: string,
    toPageId: string,
    toRow: number,
    toCol: number,
  ) => void;
  removeSlot: (binderId: string, pageId: string, slotId: string) => void;
  /** Set the print finish a pocket shows (pockets that claim an owned copy use setEntryVariant). */
  setSlotFinish: (binderId: string, pageId: string, slotId: string, finish: string | undefined) => void;
  /** Remove every placed artwork slot whose content matches `signature` (slotSignature) across
   *  the user's binders. One undo entry; returns how many pockets were cleared. */
  removeArtworkBySignature: (signature: string) => number;
  /**
   * Re-pull the user's binders from the server, replacing local state. For when the SERVER
   * changed them out from under us (deleting a portfolio demotes from_collection pockets at
   * commit, via 20260827220000): the in-memory slots still carry the old provenance, and any
   * undo snapshot could re-persist it, so the history resets like an identity change.
   */
  refreshUserBinders: () => Promise<void>;
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
  // Content signatures of duplicates made this session, keyed by the copy's id. A copy whose
  // current signature still matches is "pristine" (untouched) and can be deleted without the
  // type-the-name gate. Session-only (a ref, never persisted) — after a reload the gate returns.
  const pristineDupSigs = useRef<Map<string, string>>(new Map());
  // Featured = the top public binders by likes in the last rolling 3 days, fetched live from the
  // backend (empty in local mode, or when nothing qualifies → the Featured section stays hidden).
  const [featured, setFeatured] = useState<DemoBinder[]>([]);

  // The auth store owns the session. We load the signed-in user's binders and reload whenever
  // the user identity changes (sign in / out / new guest). A guest → account *upgrade* keeps
  // the same user id, so those binders stay put without a reload.
  const { ready: authReady, user, profile } = useAuth();
  const userId = user?.id ?? null;

  // Effective tier + limits gate binder/page creation. While LIMITS_ENFORCED is off, `limits`
  // reads unlimited, so every guard below is a no-op and behaviour is unchanged.
  const { tier, limits } = useTier();

  const binders = history.present;

  // Demo binders (the "Try it out!" showcase) are free of the cap, like bundled examples.
  const binderCount = binders.filter((b) => !b.isExample && !b.isDemo).length;
  const atBinderLimit = LIMITS_ENFORCED && binderCount >= limits.binders;
  const pageLimitReached = useCallback(
    (binderId: string) => {
      if (!LIMITS_ENFORCED) return false;
      const target = binders.find((b) => b.id === binderId && !b.isExample);
      return !!target && target.pages.length >= limits.pagesPerBinder;
    },
    [binders, limits.pagesPerBinder],
  );

  // Load user binders for the current user (examples stay bundled/local). On EVERY identity
  // change we fully reset the history — present AND the undo/redo stacks — so no binder or
  // snapshot from a previous account survives in memory. That carryover was the source of the
  // cross-account duplication bug: a lingering binder (or an undo that re-persisted one) would be
  // written back under whatever account was signed in next, reusing the same id under a new owner.
  useEffect(() => {
    if (!CLOUD) return;
    if (!authReady) return; // wait for the session to settle before loading
    let active = true;
    (async () => {
      setLoading(true);
      // Reset to examples-only immediately so the previous account's binders (and its undo
      // history) can't be seen or re-persisted during the switch.
      setHistory({ past: [], present: [...SAMPLE_BINDERS], future: [] });
      try {
        // No session (guest sign-in unavailable, or signed out): show examples only.
        const userBinders = userId ? await repo.fetchUserBinders(userId) : [];
        if (active) {
          setHistory({ past: [], present: [...SAMPLE_BINDERS, ...userBinders], future: [] });
        }
      } catch (error) {
        console.warn(
          `[michi-maker] Supabase load failed; showing examples only: ${(error as Error).message}`,
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authReady, userId]);

  /**
   * Re-pull the user's binders from the server, replacing local state and resetting the undo
   * history. Used wherever the SERVER is the one that changed: deleting a portfolio demotes
   * from_collection pockets at commit (20260827220000), so the in-memory slots still carry the old
   * provenance and any undo snapshot could re-persist it — and, since the edit lease landed, on
   * every hand-off between tabs, where the other tab is what changed underneath this one.
   */
  const refreshUserBinders = useCallback(async () => {
    if (!CLOUD || !userId) return;
    const userBinders = await repo.fetchUserBinders(userId);
    setHistory({ past: [], present: [...SAMPLE_BINDERS, ...userBinders], future: [] });
  }, [userId]);

  /**
   * ONE WRITER PER BROWSER. Two tabs on one account both wrote, and neither ever re-read the
   * server — no realtime on the binder tables, no refetch on focus, no version check on any
   * write — so the second tab saved from whatever it loaded with. A whole-binder save prunes
   * every page and slot its payload does not name, which is how a stale tab silently deleted a
   * card the other one had just added. The lease makes the focused tab the only writer, and a
   * hand-off re-reads before it is allowed to write. See src/lib/editLock.ts for the mechanics
   * and for what this deliberately does NOT cover (two browsers, two devices, two people).
   */
  const editLock = useEditLock(userId, refreshUserBinders);
  const canEdit = editLock.canEdit;
  // persist() is called from deep inside setState updaters and long-lived callbacks; a ref keeps
  // their identities stable while still reading the CURRENT verdict at the moment of the write.
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  // Load the Featured ranking (public 3-day-likes leaderboard). It's public data, but wait for the
  // session to settle so the Supabase client is ready. Reloads on identity change so a viewer's own
  // likes are reflected next time they land home. Failures degrade to an empty (hidden) section.
  useEffect(() => {
    if (!CLOUD || !authReady) return;
    let active = true;
    (async () => {
      try {
        const rows = await repo.fetchFeaturedBinders();
        if (active) setFeatured(rows);
      } catch (error) {
        console.warn(`[michi-maker] featured load failed: ${(error as Error).message}`);
      }
    })();
    return () => {
      active = false;
    };
  }, [authReady, userId]);

  /** Apply an immutable update to the binders, recording it on the undo stack. */
  const commit = useCallback((updater: (prev: DemoBinder[]) => DemoBinder[]) => {
    // A TAB THAT CANNOT SAVE MUST NOT PRETEND TO EDIT. Refusing the write in persist() alone was
    // not enough: the local state still changed, so the pocket filled on screen, the server never
    // heard about it, and the work vanished at the next reload with nothing ever having looked
    // wrong. That is the same silence that made a lost binder undiagnosable, reintroduced by the
    // guard meant to prevent it.
    //
    // The screen simply not responding is the honest outcome, and the banner beside it says why.
    // This is the funnel every binder mutation goes through, which is what makes it the one place
    // that can promise it — a per-surface check would only cover the surfaces someone remembered.
    if (!canEditRef.current) return;
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
   * A write that failed and said nothing is how this app lost a binder: the screen went on
   * showing the pockets, the server had none, and the mismatch only surfaced on the next
   * reload — by which time nobody could say what had been in there. So a failure is REMEMBERED
   * here and shown (SaveErrorBanner), not just logged where nobody looks.
   *
   * The first failure is the one worth showing: what follows is usually the same outage
   * repeated, and a banner that rewrites itself every second is one nobody reads.
   */
  const [saveError, setSaveError] = useState<string | null>(null);
  const clearSaveError = useCallback(() => setSaveError(null), []);

  /**
   * Run a persistence op in cloud mode; never let a failed write crash the UI. When there's no
   * session (e.g. anonymous sign-in unavailable) writes would all fail RLS, so we skip them
   * entirely — the guest banner tells the user their work isn't saving — rather than firing a
   * stream of scary errors. Genuine failures (with a session) log a soft warning, not an error.
   */
  const persist = useCallback(
    (op: () => Promise<void>) => {
      if (!CLOUD || !user) return;
      // THE BACKSTOP for the edit lease. The UI already stops a read-only tab from reaching most
      // of these paths, but this is the single place every write funnels through, so it is the
      // only place that can promise a tab without the lease never writes — including the ones
      // that fire without a click (an undo re-sync, a queued art rehost). Not a save error:
      // the other tab is saving, and the banner already explains why this one is read-only.
      if (!canEditRef.current) {
        console.warn('[michi-maker] save skipped: another tab holds editing for this account');
        return;
      }
      op().catch((error) => {
        const message = (error as Error).message;
        console.warn(`[michi-maker] cloud save failed: ${message}`);
        setSaveError((prev) => prev ?? message);
      });
    },
    [user],
  );

  /**
   * When a guest upgrades to a permanent account *in place* (same uid, anonymous → real), re-create
   * every one of their binders under BRAND-NEW ids (binder + pages + slots), then delete the old
   * rows. This guarantees an account's binders never share an id with the guest identity they came
   * from, so a stale/reused guest session can never collide with them. Insert-then-delete per binder
   * keeps it safe: a failure mid-way leaves the original intact (a duplicate at worst, never a loss).
   *
   * Re-minted, not cloned: the migration is a MOVE (same pockets, new ids), so claim stamps,
   * `fromCollection`, the demo flag and the share-preview picks all survive — routing this through
   * cloneBinder was the defect where upgrading silently stripped every pocket's claim and turned
   * the read-only demo showcase into a counted real binder. The stamps stay valid because the
   * upgrade keeps the uid and the portfolio entries with it.
   */
  // The re-mint per migration run, cached by old binder id: setHistory updaters must be pure and
  // re-invocable, and an uncached remint would mint DIFFERENT ids on a replayed invocation - each
  // replay firing its own inserts, landing an orphan binder set that duplicates every claim. With
  // the cache a replay re-fires persist with the SAME ids: the duplicate insert fails the PK and
  // is swallowed, and nothing lands twice. (Same doctrine as syncChanged's idempotence note.)
  const remintCache = useRef(new Map<string, DemoBinder>());
  const migrateOwnBindersToFreshIds = useCallback(() => {
    remintCache.current = new Map();
    setHistory((h) => {
      const mine = h.present.filter((b) => !b.isExample);
      if (mine.length === 0) return h;
      const examples = h.present.filter((b) => b.isExample);
      const cache = remintCache.current;
      const fresh = mine.map((b) => {
        const got = cache.get(b.id) ?? remintBinderIds(b);
        cache.set(b.id, got);
        return got;
      });
      mine.forEach((old, i) => {
        const nu = fresh[i];
        persist(async () => {
          await repo.insertBinder(nu);
          await repo.deleteBinder(old.id);
        });
      });
      // A fresh identity for a fresh account: drop the undo history along with the old ids.
      return { past: [], present: [...examples, ...fresh], future: [] };
    });
  }, [persist]);

  // Fire that migration exactly on the in-place guest→account upgrade. A plain sign-in to a
  // *different* existing account changes the uid and must NOT drag the guest's binders along, so
  // we require the uid to be unchanged across the anonymous→permanent flip.
  const prevAuth = useRef<{ uid: string | null; anon: boolean | null }>({ uid: null, anon: null });
  useEffect(() => {
    if (!CLOUD || !authReady) return;
    const uid = user?.id ?? null;
    const anon = user ? !!user.is_anonymous : null;
    const prev = prevAuth.current;
    prevAuth.current = { uid, anon };
    if (prev.uid && prev.uid === uid && prev.anon === true && anon === false) {
      migrateOwnBindersToFreshIds();
    }
  }, [user, authReady, migrateOwnBindersToFreshIds]);

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
      // ONLY WHAT CHANGED. This used to rewrite every binder whose object differed, IN FULL —
      // which is how a page nobody had touched was overwritten from a stale copy (2026-08-31,
      // "Pikachu and Friends", page 3). diffSnapshots is page-grained: a binder whose page list
      // is unchanged gets its row written only if the row differs, and only the pages whose
      // content differs; a binder whose page list changed is the one case written whole.
      const { full, scoped, removed } = diffSnapshots(from, to);
      if (full.length === 0 && scoped.length === 0 && removed.length === 0) return;
      // ONE ordered op, not one persist() per binder: an undo of a page MOVE touches two binders,
      // and independent fire-and-forget writes could land one side only — reviving in the DB the
      // both-binders-claim-one-card state the move itself was fixed to avoid. Serial keeps a
      // partial failure contiguous (everything before the failed write landed, nothing after).
      persist(async () => {
        for (const b of full) await repo.replaceBinder(b);
        for (const w of scoped) await repo.replaceBinderPages(w.binder, w.pageIds, w.meta);
        for (const b of removed) await repo.deleteBinder(b.id);
      });
    },
    [persist],
  );

  // Undo and redo swap whole snapshots through setHistory directly rather than through commit, so
  // they need the same guard: without it a read-only tab could roll its own view back to a state
  // the server never returns to, and then show that as the truth.
  const undo = useCallback(() => {
    if (!canEditRef.current) return;
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      syncChanged(h.present, previous);
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
    });
  }, [syncChanged]);

  const redo = useCallback(() => {
    if (!canEditRef.current) return;
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const [next, ...rest] = h.future;
      syncChanged(h.present, next);
      return { past: [...h.past, h.present], present: next, future: rest };
    });
  }, [syncChanged]);

  const getBinder = useCallback(
    (id: string) =>
      binders.find((binder) => binder.id === id) ??
      // The print-feature sampler is a standalone locked reference — resolvable at
      // /binder/example-fill-sheet, but deliberately NOT in the binder list (so it stays out of
      // the home carousels, the binder cap, and every persistence/mutation path).
      (id === EXAMPLE_FILL_SHEET_BINDER.id ? EXAMPLE_FILL_SHEET_BINDER : undefined),
    [binders],
  );

  /**
   * The lot sizes behind the uniqueness guard (entryId → quantity). Fetch-once per identity,
   * exactly like use-owned-copies and for the same reason: ownership changes in tcgscan, not
   * while cards are being placed here. Absent (guest, local mode, before the first load) every
   * lot conservatively counts as one copy, which is the strictest reading — never a looser one.
   * The guest→account upgrade keeps the uid, so the map stays valid straight through it.
   */
  const [ownedLots, setOwnedLots] = useState<{ userId: string; lots: Map<string, number> } | null>(null);
  useEffect(() => {
    if (!CLOUD || !userId) return;
    let active = true;
    let delay = 5_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The SHARED load (same promise the assigner hooks read), retried with backoff on failure:
    // a session whose budgets silently stayed at 1 while the assigner saw quantity-3 lots is how
    // the guard came to refuse copies that were genuinely free.
    const attempt = () => {
      loadOwnedEntriesShared(userId)
        .then((entries) => {
          if (active) setOwnedLots({ userId, lots: new Map(entries.map((e) => [e.entryId, e.quantity])) });
        })
        .catch((error) => {
          if (!active) return;
          console.warn(
            `[michi-maker] owned-lots load failed (claim budgets fall back to 1): ${(error as Error).message}`,
          );
          timer = setTimeout(attempt, delay);
          delay = Math.min(delay * 2, 60_000);
        });
    };
    attempt();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [userId]);
  const lotQuantities = ownedLots && ownedLots.userId === userId ? ownedLots.lots : undefined;

  /**
   * THE UNIQUENESS GUARD. A lot's pockets never outnumber its cards: one physical card is in one
   * pocket, and a lot of three can honestly back three — so a claim is free while the pockets
   * already naming that entry are fewer than the lot's quantity. This is the only thing standing
   * between that sentence and every future caller who forgets it. Callers resolve copies against
   * their own view of what is claimed (useCopyAssigner); this checks the store's, which is the one
   * that is actually true at the moment of the write — and it catches the paths that never asked,
   * which is how a duplicated page came to wear the original's scans.
   *
   * `exceptSlotId` is the pocket being edited: re-stamping the copy it already holds is not a
   * second claim, and refusing it would make a slot unable to keep its own card.
   */
  const countClaims = useCallback(
    (entryId: string, exceptSlotId?: string) => {
      let n = 0;
      for (const b of binders)
        for (const p of b.pages)
          for (const s of p.slots) if (s.sourceEntryId === entryId && s.id !== exceptSlotId) n += 1;
      return n;
    },
    [binders],
  );
  const claimBudget = useCallback(
    (entryId: string) => Math.max(1, lotQuantities?.get(entryId) ?? 1),
    [lotQuantities],
  );
  const claimIsFree = useCallback(
    (entryId: string, exceptSlotId?: string) =>
      countClaims(entryId, exceptSlotId) < claimBudget(entryId),
    [countClaims, claimBudget],
  );

  const createBinder = useCallback(
    (init?: Partial<DemoBinder>) => {
      // Creating adds a binder — refuse past the tier limit (UI shows the upgrade note), exactly
      // as duplicateBinder does. Demo/example binders sit outside the cap (see binderCount), so
      // the "Try it out!" showcase still builds for a user who is already at their limit.
      const counted = !init?.isDemo && !init?.isExample;
      if (counted && LIMITS_ENFORCED && binderCount >= limits.binders) return undefined;
      // Say so by RETURNING NOTHING when this tab cannot save. commit() would refuse the write
      // anyway, but handing back a binder the store never took leaves the caller opening a page
      // for something that does not exist — a "binder not found" screen as the answer to "+ New".
      if (!canEditRef.current) return undefined;
      // Generic placeholder titles ("New binder" / "Untitled binder") become a short random filler
      // name (e.g. "Miko") — trivial to type into the delete gate, and an obvious nudge to rename.
      // A meaningful title a caller passed (e.g. "My collection picks") is kept as-is.
      const title = init?.title && !GENERIC_BINDER_TITLES.has(init.title.trim()) ? init.title : fillerName();
      // PUBLIC BY DEFAULT once the account holds the rights attestation, and never for guests:
      // an anonymous account's binders would surface with no username to stand behind them, and
      // the attestation flow is only ever offered to signed-in accounts. Demo/example stay
      // private, and an explicit init.isPublic (none exists today) would win via the spread.
      // Duplicates are unaffected: cloneBinder hard-codes copies private (borrowed-art rule).
      const defaultPublic = defaultBinderPublic({
        attestedAt: profile?.rights_attested_at,
        isAnonymous: !user || !!user.is_anonymous,
        username: profile?.username,
        isDemo: init?.isDemo,
        isExample: init?.isExample,
      });
      // Pages can arrive pre-stamped (pagesForCards, the rebuild import), resolved against the
      // CALLER's view of the claim ledger — so re-check every stamp against the store's view with
      // the same budget arithmetic as every other write path, counting within this batch too. A
      // claim that does not fit is dropped, never honoured into a duplicate. What this closes: a
      // stale caller ledger, and a repeat create landing after the store committed (any later
      // task — which is what a real double-tap is, since React flushes between discrete events).
      // What it does NOT close: two invocations inside a single task, because countClaims reads
      // the render snapshot and commit only queues the update — the same residual window every
      // guarded batch path has.
      const batchClaims = new Map<string, number>();
      const pages = (init?.pages ?? [emptyPage()]).map((p) => ({
        ...p,
        slots: p.slots.map((s) => {
          if (!s.sourceEntryId) return s;
          const inBatch = batchClaims.get(s.sourceEntryId) ?? 0;
          if (countClaims(s.sourceEntryId) + inBatch < claimBudget(s.sourceEntryId)) {
            batchClaims.set(s.sourceEntryId, inBatch + 1);
            return s;
          }
          // fromCollection goes with the stamp (same pairing as upsertSlot's new-slot branch).
          const { sourceEntryId: _claim, fromCollection: _owned, ...rest } = s;
          return rest;
        }),
      }));
      const binder: DemoBinder = {
        id: uuidv4(),
        layoutStyle: 'freeform' as MichiLayoutStyle,
        isExample: false,
        ...(defaultPublic ? { isPublic: true } : {}),
        ...init,
        pages,
        title,
      };
      if (binder.isDemo) {
        // At most ONE demo binder per account — clear any prior one first (delete + replace in a
        // single commit so the old showcase is gone before the new one lands).
        const priorDemos = binders.filter((b) => b.isDemo);
        for (const d of priorDemos) persist(() => repo.deleteBinder(d.id));
        commit((prev) => [...prev.filter((b) => !b.isDemo), binder]);
      } else {
        commit((prev) => [...prev, binder]);
      }
      persist(() => repo.insertBinder(binder));
      track('binder.add', { isDemo: !!binder.isDemo });
      return binder;
    },
    [
      binders, binderCount, limits.binders, commit, persist, countClaims, claimBudget,
      profile?.rights_attested_at, profile?.username, user,
    ],
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
      // Locked references (the print sampler) are view-only — never copyable.
      if (source.locked) return undefined;
      // Duplicating adds a binder — refuse past the tier limit (UI shows the upgrade note).
      if (LIMITS_ENFORCED && binderCount >= limits.binders) return undefined;
      // Same reason as createBinder: a copy this tab cannot save must not be handed back, or
      // the caller opens a binder the store never took.
      if (!canEditRef.current) return undefined;
      // A duplicate gets a fresh short filler name (not "<title> (copy)") — same rationale as a
      // new binder. Stamp its content signature so an immediate, unedited delete can skip the gate.
      const clone = cloneBinder(source, { title: fillerName() });
      // Copied CUSTOM art loses reshare rights UNLESS you authored the source: examples/demos are
      // curated content you didn't create, so their art is borrowed on copy (origin 'copied' →
      // private, must be removed before the copy can go public). Duplicating your OWN binder keeps
      // your art. Card art + procedural inserts are never touched. (A future "duplicate someone's
      // public binder" path should route through markCopiedArtBorrowed too.)
      const copy = source.isExample || source.isDemo ? markCopiedArtBorrowed(clone) : clone;
      pristineDupSigs.current.set(copy.id, binderSignature(copy));
      commit((prev) => [...prev, copy]);
      // Provenance ledger: record source → copy (best-effort; no-ops until the migration is applied).
      persist(() => repo.insertBinder(copy).then(() => repo.recordReshare(copy.id, source)));
      return copy;
    },
    [binders, binderCount, limits.binders, commit, persist],
  );

  const isPristineDuplicate = useCallback(
    (id: string) => {
      const sig = pristineDupSigs.current.get(id);
      if (!sig) return false;
      const target = binders.find((binder) => binder.id === id);
      return !!target && binderSignature(target) === sig;
    },
    [binders],
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
      pristineDupSigs.current.delete(id);
      commit((prev) => prev.filter((binder) => binder.id !== id));
      if (target && !target.isExample) persist(() => repo.deleteBinder(id));
    },
    [binders, commit, persist],
  );

  const addPage = useCallback(
    (binderId: string) => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target) return;
      // Refuse past the tier's per-binder page limit (UI shows the upgrade note). Examples are
      // never persisted, so leave their in-session editing unlimited.
      if (LIMITS_ENFORCED && !target.isExample && target.pages.length >= limits.pagesPerBinder) return;
      // Real binders use ONE pocket layout throughout — new pages inherit the binder's size.
      const last = target.pages[target.pages.length - 1];
      const page = emptyPage(last?.rows ?? 3, last?.cols ?? 3, `Page ${target.pages.length + 1}`);
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId ? { ...binder, pages: [...binder.pages, page] } : binder,
        ),
      );
      if (!target.isExample) persist(() => repo.insertPage(binderId, page, target.pages.length));
    },
    [binders, limits.pagesPerBinder, commit, persist],
  );

  /**
   * "Pages around this card" (VIP): append one finished page per kept method.
   *
   * Built as a single evolving working copy and committed once — the same discipline
   * `addCardsToBinder` documents. A per-page loop over `addPage` would read stale closure state
   * every iteration and every page would land at the same index.
   *
   * The seed goes in the middle of each page (its centre cell), matching what the preview showed;
   * the method's placements fill around it. Pages past the tier's cap are reported as `skipped`
   * rather than dropped silently, so the caller can say so.
   */
  const appendComposedPages = useCallback(
    (
      binderId: string,
      requested: { title: string; seedCardId: string; placements: ComposePlacement[] }[],
    ) => {
      const target = binders.find((b) => b.id === binderId);
      if (!target || requested.length === 0) return { added: 0, skipped: 0 };
      const maxPages = LIMITS_ENFORCED && !target.isExample ? limits.pagesPerBinder : Infinity;
      // New pages inherit the binder's layout — real binders run one pocket size throughout.
      const last = target.pages[target.pages.length - 1];
      const rows = last?.rows ?? 3;
      const cols = last?.cols ?? 3;

      const pages: DemoPage[] = target.pages.map((p) => ({ ...p, slots: [...p.slots] }));
      const firstAppended = pages.length;
      let skipped = 0;

      for (const spec of requested) {
        if (pages.length >= maxPages) {
          skipped += 1;
          continue;
        }
        const page = emptyPage(rows, cols, spec.title);
        const slots: DemoSlot[] = [
          {
            id: uuidv4(),
            row: Math.floor(rows / 2),
            col: Math.floor(cols / 2),
            rowSpan: 1,
            colSpan: 1,
            type: 'card',
            cardId: spec.seedCardId,
          },
        ];
        const taken = new Set([`${Math.floor(rows / 2)},${Math.floor(cols / 2)}`]);
        for (const p of spec.placements) {
          if (p.row < 0 || p.col < 0 || p.row >= rows || p.col >= cols) continue;
          const key = `${p.row},${p.col}`;
          if (taken.has(key)) continue;
          if (!p.cardId && !p.imageUrl) continue;
          taken.add(key);
          slots.push({
            id: uuidv4(),
            row: p.row,
            col: p.col,
            rowSpan: 1,
            colSpan: 1,
            type: p.cardId ? 'card' : 'artwork',
            cardId: p.cardId,
            imageUrl: p.imageUrl,
            imageCrop: p.imageCrop,
            fromCollection: (p.cardId && p.fromCollection) || undefined,
          });
        }
        pages.push({ ...page, slots });
      }

      const added = pages.length - firstAppended;
      if (added === 0) return { added: 0, skipped };

      commit((prev) => prev.map((b) => (b.id === binderId ? { ...b, pages } : b)));
      if (!target.isExample) {
        // One ordered op: each page must exist before its slots (FK). persist() is
        // fire-and-forget and unordered, so the ordering has to live inside a single awaited op.
        persist(async () => {
          for (let i = firstAppended; i < pages.length; i += 1) {
            await repo.insertPage(binderId, pages[i], i);
            for (const slot of pages[i].slots) await repo.upsertSlot(pages[i].id, slot);
          }
        });
      }
      track('compose.pages_kept', { count: added, skipped });
      return { added, skipped };
    },
    [binders, limits.pagesPerBinder, commit, persist],
  );

  const duplicatePage = useCallback(
    (binderId: string, pageId: string) => {
      const target = binders.find((binder) => binder.id === binderId);
      const srcIndex = target ? target.pages.findIndex((p) => p.id === pageId) : -1;
      if (!target || srcIndex < 0) return null;
      // Duplicating adds a page — refuse past the tier limit, same as addPage (the UI toasts).
      if (LIMITS_ENFORCED && !target.isExample && target.pages.length >= limits.pagesPerBinder) return null;
      const src = target.pages[srcIndex];
      const copy: DemoPage = {
        ...src,
        id: uuidv4(),
        title: src.title ? `${src.title} copy` : undefined,
        // A copy of a pocket is not a copy of the card in it (see duplicatedSlots).
        slots: duplicatedSlots(src.slots),
      };
      const { pages, blanksInserted } = withParitySpacers([
        ...target.pages.slice(0, srcIndex + 1),
        copy,
        ...target.pages.slice(srcIndex + 1),
      ]);
      commit((prev) => prev.map((binder) => (binder.id === binderId ? { ...binder, pages } : binder)));
      // Inserting mid-list shifts page positions, so persist the whole binder (replaceBinder
      // rewrites pages + slots with correct positions — avoids the unique(position) dance).
      if (!target.isExample) persist(() => repo.replaceBinder({ ...target, pages }));
      return { pageIndex: pages.findIndex((p) => p.id === copy.id), blanksInserted };
    },
    [binders, limits.pagesPerBinder, commit, persist],
  );

  /**
   * Send a page to ANOTHER binder — copy it there, or move it (copy + remove from the source).
   *
   * Guards, each reported so the UI can explain rather than fail silently:
   *  · 'size-mismatch' — real binders run ONE pocket layout throughout (see addPage), so a 3×3
   *    page can't join a 4×4 binder; we refuse instead of producing a binder that can't exist.
   *  · 'target-full'   — the destination is at the tier's page cap (same rule as addPage).
   *  · 'last-page'     — moving would leave the source with zero pages; copy instead.
   * The page is re-minted (new page id + new slot ids) so the two binders never share rows.
   */
  const sendPageToBinder = useCallback(
    (
      fromBinderId: string,
      pageId: string,
      toBinderId: string,
      opts?: { move?: boolean },
    ):
      | { status: 'ok'; move: boolean; blanksInserted: number }
      | { status: 'size-mismatch' | 'target-full' | 'last-page' | 'not-found' } => {
      const source = binders.find((b) => b.id === fromBinderId);
      const target = binders.find((b) => b.id === toBinderId);
      const src = source?.pages.find((p) => p.id === pageId);
      if (!source || !target || !src || source.id === target.id) return { status: 'not-found' };

      const shape = target.pages[0];
      if (shape && (shape.rows !== src.rows || shape.cols !== src.cols)) return { status: 'size-mismatch' };
      if (LIMITS_ENFORCED && !target.isExample && target.pages.length >= limits.pagesPerBinder)
        return { status: 'target-full' };
      const move = Boolean(opts?.move);
      if (move && source.pages.length <= 1) return { status: 'last-page' };

      const copy: DemoPage = {
        ...src,
        id: uuidv4(),
        // MOVING keeps the cards - same pockets, new binder - while COPYING must not claim them
        // twice. The one flag is the whole difference between the two operations here.
        slots: move ? movedSlots(src.slots) : duplicatedSlots(src.slots),
      };
      const targetPages = [...target.pages, copy];
      // Moving flips the side of every page after the one that left, so re-space the SOURCE the
      // same way removePage does (folded art must stay on its pocket pairs).
      const sourceAfter = move
        ? withParitySpacers(source.pages.filter((p) => p.id !== pageId))
        : { pages: source.pages, blanksInserted: 0 };

      commit((prev) =>
        prev.map((b) =>
          b.id === toBinderId
            ? { ...b, pages: targetPages }
            : move && b.id === fromBinderId
              ? { ...b, pages: sourceAfter.pages }
              : b,
        ),
      );
      // Wholesale on both sides: the target gains a page WITH slots and the source's positions
      // shift, which the granular calls don't cover (same reasoning as duplicatePage). ONE
      // ordered op, not two persist() calls — those are fire-and-forget and independent, so a
      // move whose source write failed left the page in BOTH binders with both sides' pockets
      // stamped with the same entry ids after reload. Target first: a mid-failure duplicates
      // (until the source is next persisted wholesale) rather than loses the page, the same
      // trade the guest migration makes.
      if (!target.isExample || (move && !source.isExample)) {
        persist(async () => {
          if (!target.isExample) await repo.replaceBinder({ ...target, pages: targetPages });
          if (move && !source.isExample) await repo.replaceBinder({ ...source, pages: sourceAfter.pages });
        });
      }
      return { status: 'ok', move, blanksInserted: sourceAfter.blanksInserted };
    },
    [binders, limits.pagesPerBinder, commit, persist],
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

  /**
   * Set the pocket layout for the WHOLE binder — real binders don't mix page sizes, so the
   * size chips apply to every page at once. Refuses (naming the blocking page) when any slot
   * would fall outside the new grid; the user clears/moves it first, nothing is destroyed.
   */
  const setBinderPageSize = useCallback(
    (binderId: string, rows: number, cols: number): { ok: boolean; reason?: string } => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target) return { ok: false, reason: 'Binder not found.' };
      for (let i = 0; i < target.pages.length; i += 1) {
        const blocking = target.pages[i].slots.find(
          (s) => s.row + s.rowSpan > rows || s.col + s.colSpan > cols,
        );
        if (blocking) {
          return {
            ok: false,
            reason: `Page ${i + 1} has content that wouldn't fit ${rows}×${cols}. Move or clear it first.`,
          };
        }
      }
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? { ...binder, pages: binder.pages.map((page) => ({ ...page, rows, cols })) }
            : binder,
        ),
      );
      if (!target.isExample) {
        for (const p of target.pages) persist(() => repo.updatePage(p.id, { rows, cols }));
      }
      return { ok: true };
    },
    [binders, commit, persist],
  );

  /**
   * ONE BACKGROUND PER BINDER, for the same reason there is one page size: a real binder is one
   * object. Per-page colours let a binder drift into a patchwork nobody chose, and the colour
   * control sat in a per-page dialog where that drift was invisible until you flipped.
   */
  const setBinderBackground = useCallback(
    (binderId: string, backgroundColor?: string) => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target) return;
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? { ...binder, pages: binder.pages.map((page) => ({ ...page, backgroundColor })) }
            : binder,
        ),
      );
      if (!target.isExample) {
        for (const p of target.pages) persist(() => repo.updatePage(p.id, { backgroundColor }));
      }
    },
    [binders, commit, persist],
  );

  const removePage = useCallback(
    (binderId: string, pageId: string): { blanksInserted: number } | null => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target || target.pages.length <= 1) return null; // never leave a binder with zero pages
      // Removing one page flips the side of every page after it — re-space so folded art on
      // those pages stays on its pocket pairs (a blank may reappear where the page was).
      const { pages, blanksInserted } = withParitySpacers(
        target.pages.filter((page) => page.id !== pageId),
      );
      commit((prev) =>
        prev.map((binder) => (binder.id === binderId ? { ...binder, pages } : binder)),
      );
      if (!target.isExample) {
        // A spacer changes page positions and adds rows — persist wholesale; a plain removal
        // stays the cheap single delete.
        persist(() =>
          blanksInserted ? repo.replaceBinder({ ...target, pages }) : repo.deletePage(pageId),
        );
      }
      return { blanksInserted };
    },
    [binders, commit, persist],
  );

  const reorderPages = useCallback(
    (
      binderId: string,
      fromIndex: number,
      toIndex: number,
    ): { pageIndex: number; blanksInserted: number } | null => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target) return null;
      const count = target.pages.length;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= count ||
        toIndex >= count
      ) {
        return null;
      }
      const arr = [...target.pages];
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved);
      // A move flips the side of the moved page (when from/to parity differ) and of every page
      // in between — re-space so all folded art keeps its pocket-pair alignment.
      const { pages, blanksInserted } = withParitySpacers(arr);
      commit((prev) => prev.map((binder) => (binder.id === binderId ? { ...binder, pages } : binder)));
      if (!target.isExample) {
        persist(() =>
          blanksInserted
            ? repo.replaceBinder({ ...target, pages })
            : repo.reorderPages(binderId, pages.map((p) => p.id)),
        );
      }
      return { pageIndex: pages.findIndex((p) => p.id === moved.id), blanksInserted };
    },
    [binders, commit, persist],
  );

  const compactBlankPages = useCallback(
    (binderId: string): { removed: number; kept: number } | null => {
      const target = binders.find((binder) => binder.id === binderId);
      if (!target) return null;
      // Drop every removable blank, then let the parity pass re-add ONLY the spacers folded art
      // still needs — the minimal blank set falls out of the same rule that inserted them.
      const kept = target.pages.filter((page) => !isBlankPage(page));
      const { pages } = withParitySpacers(kept.length ? kept : [target.pages[0]]);
      const removed = target.pages.length - pages.length;
      const spacersKept = pages.filter(isBlankPage).length;
      if (removed <= 0) return { removed: 0, kept: spacersKept };
      commit((prev) =>
        prev.map((binder) => (binder.id === binderId ? { ...binder, pages } : binder)),
      );
      if (!target.isExample) persist(() => repo.replaceBinder({ ...target, pages }));
      return { removed, kept: spacersKept };
    },
    [binders, commit, persist],
  );

  const upsertSlot = useCallback(
    (binderId: string, pageId: string, input: SlotInput) => {
      // A claim another pocket already holds is dropped, not honoured: the pocket keeps its card
      // and shows the catalogue image, which is what "someone else has that one" looks like.
      const claimable = (id: string | null | undefined, exceptSlotId?: string) =>
        id && claimIsFree(id, exceptSlotId) ? id : undefined;
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
            // The rebuild stamp names the OWNED COPY this pocket depicts (real-scan pairing).
            // It is true of the card the rebuild placed, not of the pocket — so placing a
            // different card here must drop it, or the pocket would wear the old copy's photo.
            sourceEntryId:
              input.sourceEntryId === null
                ? undefined
                : (claimable(input.sourceEntryId, existing.id) ??
                  (input.cardId && input.cardId !== existing.cardId
                    ? undefined
                    : existing.sourceEntryId)),
            // A pocket that names a copy is owned by definition; one that just changed to a
            // different card is not, and must not keep the old card's provenance; and a detach
            // frees the copy, which is the entire point of offering it.
            fromCollection:
              input.sourceEntryId === null
                ? undefined
                : input.sourceEntryId ||
                    (existing.fromCollection && !input.cardId) ||
                    (existing.fromCollection && input.cardId === existing.cardId)
                  ? true
                  : undefined,
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
            sourceEntryId: claimable(input.sourceEntryId),
            fromCollection: claimable(input.sourceEntryId) ? true : undefined,
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
      // Count only a NEW card landing in a pocket (not span/edit tweaks of an existing slot).
      if (!existing && slot.type === 'card' && slot.cardId) {
        track('card.add', { source: 'manual', count: 1 });
      }
    },
    [binders, commit, persist, claimIsFree],
  );

  const rehostBinderArt = useCallback(
    async (binderId: string) => {
      const target = binders.find((b) => b.id === binderId);
      // Examples never persist and never share; nothing to convert.
      if (!target || target.isExample) return { fixed: 0, failed: 0, binder: target ?? null };
      const changes: { pageId: string; slot: DemoSlot }[] = [];
      let failed = 0;
      // Sequential on purpose: each conversion is a fetch plus an upload, and a binder with many
      // hotlinks fanning out in parallel is how a phone tab dies mid-share.
      for (const page of target.pages) {
        for (const slot of page.slots) {
          if (!isCustomArtwork(slot) || !isPrivateArt(slot.attribution, slot.imageUrl)) continue;
          const oldUrl = slot.imageUrl as string;
          if (!/^https?:/i.test(oldUrl)) {
            failed += 1; // not fetchable (broken/relative legacy value); needs a manual upload
            continue;
          }
          try {
            const hosted = await importRemoteArtToBucket(oldUrl);
            changes.push({
              pageId: page.id,
              slot: {
                ...slot,
                imageUrl: hosted,
                // The provenance is honest: this is imported art, and the place it came from is
                // the credit. Existing artist/source fields win; the old URL fills sourceUrl so
                // the link back survives the move.
                attribution: {
                  ...(slot.attribution ?? deriveAttribution(oldUrl)),
                  origin: 'external',
                  sourceUrl: slot.attribution?.sourceUrl ?? oldUrl,
                },
              },
            });
          } catch {
            failed += 1; // site blocks both direct CORS and the art-proxy; Upload is the way
          }
        }
      }
      // The covers, by the same rule: every decoration with a private image is pulled into the
      // user's own bucket and stamped external, and the whole cover is written once at the end.
      let coverNext = target.cover;
      if (coverNext?.surfaces) {
        const surfaces = { ...coverNext.surfaces };
        let touched = false;
        for (const key of Object.keys(surfaces) as (keyof typeof surfaces)[]) {
          const list = surfaces[key];
          if (!list) continue;
          const nextList = [...list];
          for (let i = 0; i < nextList.length; i += 1) {
            const d = nextList[i];
            if (d.kind === 'text' || !d.imageUrl || !isPrivateArt(d.attribution, d.imageUrl)) continue;
            if (!/^https?:/i.test(d.imageUrl)) {
              failed += 1;
              continue;
            }
            try {
              const hosted = await importRemoteArtToBucket(d.imageUrl);
              nextList[i] = {
                ...d,
                imageUrl: hosted,
                attribution: {
                  ...(d.attribution ?? deriveAttribution(d.imageUrl)),
                  origin: 'external',
                  sourceUrl: d.attribution?.sourceUrl ?? d.imageUrl,
                },
              };
              touched = true;
            } catch {
              failed += 1;
            }
          }
          surfaces[key] = nextList;
        }
        if (touched) coverNext = { ...coverNext, surfaces };
      }
      const coverChanged = coverNext !== target.cover;
      if (changes.length || coverChanged) {
        const apply = (b: DemoBinder): DemoBinder => ({
          ...b,
          ...(coverChanged ? { cover: coverNext } : {}),
          pages: b.pages.map((p) => ({
            ...p,
            slots: p.slots.map((s) => changes.find((c) => c.slot.id === s.id)?.slot ?? s),
          })),
        });
        commit((prev) => prev.map((b) => (b.id === binderId ? apply(b) : b)));
        for (const c of changes) persist(() => repo.upsertSlot(c.pageId, c.slot));
        if (coverChanged && coverNext) {
          const cover = coverNext;
          persist(() => repo.updateBinder(binderId, { cover }));
        }
        const coverFixed = coverChanged
          ? Object.values(coverNext?.surfaces ?? {}).reduce(
              (n, list) => n + (list ?? []).filter((d) => d.kind !== 'text' && d.attribution?.origin === 'external' && d.imageUrl && !isPrivateArt(d.attribution, d.imageUrl)).length,
              0,
            ) - Object.values(target.cover?.surfaces ?? {}).reduce(
              (n, list) => n + (list ?? []).filter((d) => d.kind !== 'text' && d.attribution?.origin === 'external' && d.imageUrl && !isPrivateArt(d.attribution, d.imageUrl)).length,
              0,
            )
          : 0;
        return { fixed: changes.length + Math.max(0, coverFixed), failed, binder: apply(target) };
      }
      return { fixed: 0, failed, binder: target };
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
        // Every page is full → append a fresh page and place at its top-left. Refuse (null, like
        // "binder not found") once the binder sits at the tier's page cap — same rule as addPage.
        if (LIMITS_ENFORCED && !target.isExample && target.pages.length >= limits.pagesPerBinder)
          return null;
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
      track('card.add', { source: 'manual', count: 1 });
      return { pageIndex };
    },
    [binders, limits.pagesPerBinder, commit, persist],
  );

  const addCardsToBinder = useCallback(
    (
      binderId: string,
      cardIds: string[],
      opts?: { fromCollection?: boolean; startPageIndex?: number; entryIds?: (string | undefined)[] },
    ) => {
      const target = binders.find((b) => b.id === binderId);
      if (!target || cardIds.length === 0)
        return { added: 0, unplaced: 0, blanksInserted: 0, claimed: 0, droppedClaims: 0 };

      // Appending pages is capped by the tier, same rule as addPage — examples are never
      // persisted, so leave their in-session editing unlimited.
      const maxPages = LIMITS_ENFORCED && !target.isExample ? limits.pagesPerBinder : Infinity;

      // Evolve ONE working copy so each card lands in the NEXT free cell. A per-card loop over
      // addCardToBinder reads stale closure state every iteration, so every card resolves to the
      // same "first free" cell → identical (page_id,row,col) with different ids → 409 on upsert.
      const pages: DemoPage[] = target.pages.map((p) => ({ ...p, slots: [...p.slots] }));
      const firstAppended = pages.length; // pages at this index and beyond are newly appended
      const placed: { pageId: string; slot: DemoSlot }[] = [];
      // Within one batch the store's own view does not update between cards, so the batch tracks
      // what it has handed out itself — a COUNT per entry, not a set, because a lot of three
      // legitimately backs three pockets and assignCopies hands the same entryId out that often.
      const claimedInBatch = new Map<string, number>();
      // Claims the guard refused (the caller resolved against a staler ledger than the store's).
      // Reported so the caller can say the pocket shows catalogue art instead of staying silent.
      let droppedClaims = 0;
      // Cards the page cap left out — reported so the caller can show the upgrade note rather
      // than quietly losing them.
      let unplaced = 0;

      // CONTIGUOUS mode: start on the page the user is looking at and grow forward from there,
      // inserting each new page directly after the one that just filled up. `cursor` is the page
      // being filled and only ever moves forward, so a batch lands as one run instead of being
      // sprinkled into whatever gaps exist earlier in the binder.
      const contiguous = opts?.startPageIndex != null;
      // A binder is never supposed to reach zero pages (sendPageToBinder refuses the move that
      // would), but the contiguous path indexes pages[cursor] directly, so an empty one would
      // crash rather than degrade. Seed a page instead. The scanning path needs no equivalent:
      // its loop simply runs zero times and falls through to the append branch.
      if (contiguous && pages.length === 0) pages.push(emptyPage(3, 3, 'Page 1'));
      let cursor = contiguous
        ? Math.min(Math.max(opts?.startPageIndex ?? 0, 0), Math.max(pages.length - 1, 0))
        : -1;
      // New pages inherit the binder's pocket layout. The old code hardcoded 3×3, which is wrong
      // for a 4×4 binder (real binders run ONE layout throughout — see addPage).
      const proto = pages[contiguous ? cursor : pages.length - 1];
      const protoRows = proto?.rows ?? 3;
      const protoCols = proto?.cols ?? 3;

      for (const [i, cardId] of cardIds.entries()) {
        let pageIndex = -1;
        let cell: { row: number; col: number } | null = null;

        if (contiguous) {
          cell = firstFreePlacement(pages[cursor], 1, 1);
          if (!cell) {
            // The current page is full. Insert the next one right behind it, unless the cap says
            // no — in which case this card and every one after it stays out.
            if (pages.length >= maxPages) {
              unplaced += 1;
              continue;
            }
            pages.splice(cursor + 1, 0, emptyPage(protoRows, protoCols));
            cursor += 1;
            cell = { row: 0, col: 0 };
          }
          pageIndex = cursor;
        } else {
          for (let i = 0; i < pages.length; i += 1) {
            const spot = firstFreePlacement(pages[i], 1, 1);
            if (spot) {
              pageIndex = i;
              cell = spot;
              break;
            }
          }
          if (pageIndex < 0 || !cell) {
            // Every page is full → append a fresh page and start at its top-left, unless the
            // binder is already at the tier's page cap: then this card stays out, and so does
            // every one after it.
            if (pages.length >= maxPages) {
              unplaced += 1;
              continue;
            }
            pages.push(emptyPage(protoRows, protoCols, `Page ${pages.length + 1}`));
            pageIndex = pages.length - 1;
            cell = { row: 0, col: 0 };
          }
        }
        // WHICH physical card, when the caller resolved one (useCopyAssigner). A pocket holding
        // a copy is owned by definition, so the stamp implies fromCollection rather than needing
        // the caller to remember both — that split is what let a browse add place a card the
        // collection went on calling free.
        // Dropped rather than refused: the pocket is still worth filling, it just holds the
        // catalogue image instead of a card that is already somewhere else.
        const wanted = opts?.entryIds?.[i];
        const inBatch = wanted ? (claimedInBatch.get(wanted) ?? 0) : 0;
        const entryId =
          wanted && countClaims(wanted) + inBatch < claimBudget(wanted) ? wanted : undefined;
        if (entryId) claimedInBatch.set(entryId, inBatch + 1);
        else if (wanted) droppedClaims += 1;
        const slot: DemoSlot = {
          id: uuidv4(),
          row: cell.row,
          col: cell.col,
          rowSpan: 1,
          colSpan: 1,
          type: 'card',
          cardId,
          sourceEntryId: entryId,
          // A REFUSED claim strips the provenance with the stamp (same pairing as createBinder's
          // sanitiser): a fromCollection pocket with no stamp would consume a copy server-side
          // that the client ledger cannot count, and would scavenge a scan the toast just said
          // it does not get. The batch-wide flag still marks slots that never asked for a copy.
          fromCollection: entryId || (opts?.fromCollection && !wanted) ? true : undefined,
        };
        pages[pageIndex] = { ...pages[pageIndex], slots: [...pages[pageIndex].slots, slot] };
        placed.push({ pageId: pages[pageIndex].id, slot });
      }

      // Nothing fitted → no commit at all, so the cap can't burn an empty undo step.
      if (placed.length === 0) return { added: 0, unplaced, blanksInserted: 0, claimed: 0, droppedClaims };

      // Inserting mid-binder can move a later page to the wrong side of the spine, so re-run the
      // parity pass that duplicatePage and sendPageToBinder use. Appending never does, so the
      // non-contiguous path keeps its cheaper per-page persist.
      const spaced = contiguous ? withParitySpacers(pages) : { pages, blanksInserted: 0 };

      commit((prev) => prev.map((b) => (b.id === binderId ? { ...b, pages: spaced.pages } : b)));
      if (!target.isExample) {
        if (contiguous) {
          // Mid-list insertion shifts every later page's position, so rewrite the binder rather
          // than trying to renumber around a unique(position) constraint — same call, and same
          // reason, as duplicatePage.
          persist(() => repo.replaceBinder({ ...target, pages: spaced.pages }));
        } else {
          // One ordered op: create any appended pages FIRST (FK), then the slots (distinct cells,
          // so no unique-constraint collision). persist() is fire-and-forget and unordered, so the
          // page→slot ordering must live inside a single awaited op.
          persist(async () => {
            for (let i = firstAppended; i < pages.length; i += 1) {
              await repo.insertPage(binderId, pages[i], i);
            }
            for (const { pageId, slot } of placed) {
              await repo.upsertSlot(pageId, slot);
            }
          });
        }
      }
      // How many of these pockets claimed one of the user's actual cards. The rest are
      // aspirational, and the ratio is the only way to see that distinction in the stream.
      const claimed = placed.filter((p) => p.slot.sourceEntryId).length;
      track('card.add', {
        source: opts?.fromCollection ? 'collection' : 'manual',
        count: placed.length,
        owned: claimed,
      });
      return { added: placed.length, unplaced, blanksInserted: spaced.blanksInserted, claimed, droppedClaims };
    },
    [binders, limits.pagesPerBinder, commit, persist, countClaims, claimBudget],
  );

  const placeCards = useCallback(
    (
      binderId: string,
      pageId: string,
      placements: {
        row: number;
        col: number;
        cardId?: string;
        insertColor?: string;
        imageUrl?: string;
        imageCrop?: { x: number; y: number; w: number; h: number };
        fromCollection?: boolean;
        sourceEntryId?: string;
      }[],
    ) => {
      const target = binders.find((b) => b.id === binderId);
      const page = target?.pages.find((p) => p.id === pageId);
      if (!target || !page || placements.length === 0)
        return { placed: 0, droppedClaims: 0, placedUnclaimed: 0 };

      // Only genuinely free, in-bounds cells — the composer targets empties, but the page may
      // have changed since it computed them; skipping keeps the write conflict-free.
      const occupied = occupiedCells(page);
      const newSlots: DemoSlot[] = [];
      // Same guard as the batch add, and the same reason: a fill can be handed a copy that another
      // pocket took while the sheet was open. A count per entry, not a set — a lot of three
      // legitimately backs three pockets.
      const claimedInBatch = new Map<string, number>();
      let droppedClaims = 0;
      // Pockets created FOR an owned copy that ended up with no stamp (assigner dry, or claim
      // refused) — the exact count the caller's catalogue-art note should report, measured over
      // slots actually created rather than placements requested.
      let placedUnclaimed = 0;
      const claimedHere = (id: string | undefined) => {
        if (!id) return undefined;
        const inBatch = claimedInBatch.get(id) ?? 0;
        if (countClaims(id) + inBatch >= claimBudget(id)) {
          droppedClaims += 1;
          return undefined;
        }
        claimedInBatch.set(id, inBatch + 1);
        return id;
      };
      for (const p of placements) {
        if (p.row < 0 || p.col < 0 || p.row >= page.rows || p.col >= page.cols) continue;
        if (!p.cardId && !p.insertColor && !p.imageUrl) continue;
        const key = `${p.row},${p.col}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        // ONE claim resolution feeding both fields. Calling claimedHere twice consumed the claim
        // on the first call and read "taken" on the second, so a stamped pocket could end up
        // without its fromCollection provenance.
        const wanted = p.cardId ? p.sourceEntryId : undefined;
        const claimed = claimedHere(wanted);
        if (p.cardId && p.fromCollection && !claimed) placedUnclaimed += 1;
        newSlots.push({
          id: uuidv4(),
          row: p.row,
          col: p.col,
          rowSpan: 1,
          colSpan: 1,
          type: p.cardId ? 'card' : p.imageUrl ? 'artwork' : 'insert',
          cardId: p.cardId,
          insertColor: p.insertColor,
          imageUrl: p.imageUrl,
          imageCrop: p.imageCrop,
          sourceEntryId: claimed,
          // A refused claim strips fromCollection with the stamp, same pairing as the batch add:
          // the flag survives only alongside a stamp or on a slot that never asked for a copy.
          fromCollection: (p.cardId && (!!claimed || (p.fromCollection && !wanted))) || undefined,
        });
      }
      if (newSlots.length === 0) return { placed: 0, droppedClaims, placedUnclaimed: 0 };

      commit((prev) =>
        prev.map((b) =>
          b.id === binderId
            ? {
                ...b,
                pages: b.pages.map((pg) =>
                  pg.id === pageId ? { ...pg, slots: [...pg.slots, ...newSlots] } : pg,
                ),
              }
            : b,
        ),
      );
      if (!target.isExample) {
        // Distinct cells → each upsert is independent; order within the batch doesn't matter.
        persist(async () => {
          for (const slot of newSlots) await repo.upsertSlot(pageId, slot);
        });
      }
      return { placed: newSlots.length, droppedClaims, placedUnclaimed };
    },
    [binders, commit, persist, countClaims, claimBudget],
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
      attribution?: DemoSlot['attribution'],
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
            attribution,
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
   * Panels are first legalized for SIDE-LOAD physics (see binderPhysics): no vertical spans, at
   * most a folded 1×2 on an inside-edge pocket pair — anything bigger is split into insertable
   * pieces with proportional crops (the assembled picture is unchanged).
   */
  const placeArtPanels = useCallback(
    (binderId: string, pageId: string, baseRow: number, baseCol: number, rawPanels: ArtPanelInput[]) => {
      const target = binders.find((binder) => binder.id === binderId);
      const pageIndex = target?.pages.findIndex((p) => p.id === pageId) ?? -1;
      const page = pageIndex >= 0 ? target?.pages[pageIndex] : undefined;
      if (!target || !page) return;
      const panels = legalizeArtPanels(baseCol, rawPanels, page.cols, pageSide(pageIndex));

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
          imageFit: panel.fit ?? 'cover',
          imageTransform: panel.transform,
          attribution: panel.attribution,
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
      if (!canPlaceSlot(page, candidate, slot.id)) return; // overlaps, caller handles it

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

  /**
   * Move a slot from one page to another (drag across the edit spread). If the destination cell
   * holds a same-footprint occupant, the two swap pages; if it's free, the slot moves; otherwise
   * it's a no-op (the drag springs back). Both pages change, so it persists via replaceBinder.
   */
  const moveSlotAcrossPages = useCallback(
    (
      binderId: string,
      fromPageId: string,
      slotId: string,
      toPageId: string,
      toRow: number,
      toCol: number,
    ) => {
      if (fromPageId === toPageId) return;
      const target = binders.find((b) => b.id === binderId);
      const fromPage = target?.pages.find((p) => p.id === fromPageId);
      const toPage = target?.pages.find((p) => p.id === toPageId);
      const slot = fromPage?.slots.find((s) => s.id === slotId);
      if (!target || !fromPage || !toPage || !slot) return;
      if (slot.rowSpan > toPage.rows || slot.colSpan > toPage.cols) return; // can't fit

      const row = Math.max(0, Math.min(toRow, toPage.rows - slot.rowSpan));
      const col = Math.max(0, Math.min(toCol, toPage.cols - slot.colSpan));
      const occupant = toPage.slots.find((s) => slotCells(s).includes(`${row},${col}`));

      let fromSlots: DemoSlot[];
      let toSlots: DemoSlot[];
      if (
        occupant &&
        occupant.row === row &&
        occupant.col === col &&
        occupant.rowSpan === slot.rowSpan &&
        occupant.colSpan === slot.colSpan
      ) {
        // Same-footprint swap across pages: each takes the other's cell.
        const movedSlot = { ...slot, row, col };
        const movedOccupant = { ...occupant, row: slot.row, col: slot.col };
        fromSlots = fromPage.slots.map((s) => (s.id === slot.id ? movedOccupant : s));
        toSlots = toPage.slots.map((s) => (s.id === occupant.id ? movedSlot : s));
      } else {
        // Move into a free footprint on the destination page.
        if (!canPlaceSlot(toPage, { row, col, rowSpan: slot.rowSpan, colSpan: slot.colSpan })) return;
        fromSlots = fromPage.slots.filter((s) => s.id !== slot.id);
        toSlots = [...toPage.slots, { ...slot, row, col }];
      }

      const pages = target.pages.map((p) =>
        p.id === fromPageId ? { ...p, slots: fromSlots } : p.id === toPageId ? { ...p, slots: toSlots } : p,
      );
      commit((prev) => prev.map((b) => (b.id === binderId ? { ...b, pages } : b)));
      if (!target.isExample) persist(() => repo.replaceBinder({ ...target, pages }));
    },
    [binders, commit, persist],
  );

  /**
   * Set the print finish a POCKET shows. Distinct from changing an owned copy's variant, which is
   * a fact about a card someone physically has and goes through setEntryVariant with a
   * confirmation: this is a property of the pocket, cheap and freely reversible, so it commits on
   * a tap. A pocket that CLAIMS an owned copy takes that copy's variant instead and never reaches
   * here — see BinderScreen.
   */
  const setSlotFinish = useCallback(
    (binderId: string, pageId: string, slotId: string, finish: string | undefined) => {
      const target = binders.find((binder) => binder.id === binderId);
      const page = target?.pages.find((p) => p.id === pageId);
      const slot = page?.slots.find((sl) => sl.id === slotId);
      if (!slot) return;
      commit((prev) =>
        prev.map((binder) =>
          binder.id === binderId
            ? {
                ...binder,
                pages: binder.pages.map((p) =>
                  p.id === pageId
                    ? {
                        ...p,
                        slots: p.slots.map((sl) => (sl.id === slotId ? { ...sl, finish } : sl)),
                      }
                    : p,
                ),
              }
            : binder,
        ),
      );
      if (target && !target.isExample) persist(() => repo.upsertSlot(pageId, { ...slot, finish }));
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

  // Delete-everywhere for a tray slice: clear every artwork slot with this content signature.
  // Examples are skipped (read-only samples); removals persist per slot and undo as ONE entry.
  const removeArtworkBySignature = useCallback(
    (signature: string): number => {
      const removedIds: string[] = [];
      commit((prev) =>
        prev.map((binder) => {
          if (binder.isExample) return binder;
          let touched = false;
          const pages = binder.pages.map((page) => {
            const keep = page.slots.filter((slot) => {
              const match = slot.type === 'artwork' && !!slot.imageUrl && slotSignature(slot) === signature;
              if (match) removedIds.push(slot.id);
              return !match;
            });
            if (keep.length === page.slots.length) return page;
            touched = true;
            return { ...page, slots: keep };
          });
          return touched ? { ...binder, pages } : binder;
        }),
      );
      for (const id of removedIds) persist(() => repo.deleteSlot(id));
      return removedIds.length;
    },
    [commit, persist],
  );

  const value = useMemo<BinderStore>(
    () => ({
      binders,
      exampleBinders: binders.filter((binder) => binder.isExample),
      featuredBinders: featured,
      userBinders: binders.filter((binder) => !binder.isExample),
      loading,
      canEdit,
      saveError,
      clearSaveError,
      editLockStatus: editLock.status,
      takeOverEditing: editLock.takeOver,
      tier,
      limits,
      binderCount,
      atBinderLimit,
      pageLimitReached,
      getBinder,
      createBinder,
      createBinderWithCard,
      duplicateBinder,
      isPristineDuplicate,
      updateBinder,
      deleteBinder,
      addPage,
      duplicatePage,
      updatePage,
      setBinderPageSize,
      setBinderBackground,
      removePage,
      sendPageToBinder,
      reorderPages,
      compactBlankPages,
      upsertSlot,
      rehostBinderArt,
      addCardToBinder,
      addCardsToBinder,
      appendComposedPages,
      placeCards,
      placeVUnion,
      placeSlicedArtwork,
      placeArtPanels,
      moveSlot,
      swapSlots,
      moveSlotAcrossPages,
      removeSlot,
      setSlotFinish,
      removeArtworkBySignature,
      refreshUserBinders,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [
      binders,
      featured,
      loading,
      canEdit,
      saveError,
      clearSaveError,
      editLock,
      tier,
      limits,
      binderCount,
      atBinderLimit,
      pageLimitReached,
      getBinder,
      createBinder,
      createBinderWithCard,
      duplicateBinder,
      isPristineDuplicate,
      updateBinder,
      deleteBinder,
      addPage,
      duplicatePage,
      updatePage,
      setBinderPageSize,
      setBinderBackground,
      removePage,
      sendPageToBinder,
      reorderPages,
      compactBlankPages,
      upsertSlot,
      rehostBinderArt,
      addCardToBinder,
      addCardsToBinder,
      appendComposedPages,
      placeCards,
      placeVUnion,
      placeSlicedArtwork,
      placeArtPanels,
      moveSlot,
      swapSlots,
      moveSlotAcrossPages,
      removeSlot,
      setSlotFinish,
      removeArtworkBySignature,
      refreshUserBinders,
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
