/**
 * Supabase access for the collector's card inventory (`user_cards`) — the portfolio summary
 * fed by tcgscan-app scans (and, later, michi's own CSV import). Read-only from michi's side
 * for now; RLS scopes every query to the signed-in user. See docs/TCGSCAN-PORTFOLIO.md.
 */
import type { OwnedEntry } from '@/data/ownedCopies';
import type { TcgscanBinder } from '@/data/tcgscanBinderImport';
import { requireSupabase } from '@/lib/supabase';

/** One inventory line: a card the user owns (per condition), with a quantity. */
export interface UserCard {
  cardId: string;
  condition: string;
  quantity: number;
  source: string;
  updatedAt: string;
}

/** The signed-in user's inventory, most recently touched first (RLS scopes to the owner). */
export async function fetchUserCards(): Promise<UserCard[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('user_cards')
    .select('card_id, condition, quantity, source, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`user cards: ${error.message}`);
  return ((data ?? []) as {
    card_id: string;
    condition: string;
    quantity: number;
    source: string;
    updated_at: string;
  }[]).map((r) => ({
    cardId: r.card_id,
    condition: r.condition,
    quantity: r.quantity,
    source: r.source,
    updatedAt: r.updated_at,
  }));
}

/** One tcgscan portfolio (collection) and how many copies of each card it holds. */
export interface PortfolioGroup {
  id: string;
  name: string;
  quantities: Map<string, number>;
}

/**
 * The user's tcgscan portfolios, for the "by portfolio" collection view. These are tcgscan-app's
 * own tables living in the shared project — owner-only RLS, and michi only READS them (the
 * user_cards rollup stays the write path; see docs/TCGSCAN-PORTFOLIO.md).
 */
export async function fetchPortfolioGroups(): Promise<PortfolioGroup[]> {
  const supabase = requireSupabase();
  const [cols, entries] = await Promise.all([
    supabase.from('collections').select('id, name'),
    supabase.from('portfolio_entries').select('collection_id, card_id, quantity'),
  ]);
  if (cols.error) throw new Error(`portfolios: ${cols.error.message}`);
  if (entries.error) throw new Error(`portfolio entries: ${entries.error.message}`);
  const groups = new Map<string, PortfolioGroup>();
  for (const c of (cols.data ?? []) as { id: string; name: string }[]) {
    groups.set(c.id, { id: c.id, name: c.name, quantities: new Map() });
  }
  for (const e of (entries.data ?? []) as {
    collection_id: string;
    card_id: string;
    quantity: number;
  }[]) {
    const g = groups.get(e.collection_id);
    if (g) g.quantities.set(e.card_id, (g.quantities.get(e.card_id) ?? 0) + e.quantity);
  }
  return [...groups.values()].filter((g) => g.quantities.size > 0);
}

/**
 * Delete a portfolio (collection) and everything in it. Cascades `portfolio_entries`, and the
 * `user_cards` rollup trigger removes the owned copies — so the cards vanish from My collection
 * too. Owner-only under RLS (same insert/delete grant the CSV import uses). Used to clear the
 * "Try it out!" example cards a user was only playing with.
 */
export async function deletePortfolio(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('collections').delete().eq('id', id);
  if (error) throw new Error(`delete portfolio: ${error.message}`);
}

/**
 * Every PHYSICAL copy the user owns, one row per tcgscan lot — the identities behind the
 * quantities in `user_cards`, so a pocket can hold one particular card instead of "a Charizard".
 *
 * ARCHIVED COLLECTIONS ARE EXCLUDED, matching the rule the `user_cards` rollup already follows
 * (docs/TCGSCAN-PORTFOLIO.md, 2026-07-23): an archived collection does not count as cards you own,
 * so its copies must not be offered to a pocket either. Filtered here rather than in the query
 * because the archive flag lives on `collections` and the composite FK makes the embed awkward;
 * two small reads are cheaper than getting that wrong.
 */
export async function fetchOwnedEntries(): Promise<OwnedEntry[]> {
  const supabase = requireSupabase();
  const archived = new Set<string>();
  const cols = await supabase.from('collections').select('id, archived_at');
  if (cols.error) throw new Error(`collections: ${cols.error.message}`);
  for (const c of cols.data ?? []) if (c.archived_at) archived.add(c.id);

  // Paged for the same reason as every other portfolio_entries read: PostgREST silently caps an
  // unranged select at 1000 rows, and this one is the whole collection by definition.
  const PAGE = 1000;
  const out: OwnedEntry[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await supabase
      .from('portfolio_entries')
      .select('id, card_id, collection_id, quantity, scan_path, scanned_at')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`owned copies: ${error.message}`);
    for (const e of data ?? []) {
      if (archived.has(e.collection_id)) continue;
      out.push({
        entryId: e.id,
        cardId: e.card_id,
        // A lot is at least one card. A zero or missing quantity would silently make a copy you
        // own unplaceable, which is the failure this whole module exists to stop.
        quantity: Math.max(1, e.quantity ?? 1),
        hasScan: !!e.scan_path,
        scannedAt: e.scanned_at,
      });
    }
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

/**
 * The user's tcgscan BINDERS — the physical ones, with the page shape and the pocket each card
 * sits in (`storage_units` of kind 'binder' plus the entries that claim a place in one). Michi
 * reads these, never writes them; tcgscan owns the shelf.
 *
 * The whole point is fidelity, so nothing is filtered on the way through: an entry with no pocket,
 * a pocket outside the page shape and two entries claiming one pocket all arrive as they are and
 * are counted by rebuildTcgscanBinder, which is the one place that decides what they mean.
 *
 * Binders holding no entries are kept too. A binder scanned into existence and then emptied is
 * still a binder on the shelf, and the caller shows it with its own zero.
 */
export async function fetchTcgscanBinders(): Promise<TcgscanBinder[]> {
  const supabase = requireSupabase();
  // Paged for the same reason fetchScanImages is: PostgREST silently caps an unranged select at
  // 1000 rows, and a binder-scanning collector passes that in a few hundred pages of binder.
  const PAGE = 1000;
  const rows: {
    id: string;
    card_id: string;
    storage_id: string | null;
    storage_page: number | null;
    storage_pos: number | null;
    storage_rows: number | null;
    storage_cols: number | null;
    scanned_at: string | null;
  }[] = [];
  const units = supabase
    .from('storage_units')
    .select('id, collection_id, name, grid_rows, grid_cols, page_count')
    .eq('kind', 'binder');
  const readEntries = async () => {
    for (let from = 0; from < 50_000; from += PAGE) {
      const { data, error } = await supabase
        .from('portfolio_entries')
        .select(
          'id, card_id, storage_id, storage_page, storage_pos, storage_rows, storage_cols, scanned_at',
        )
        .not('storage_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`binder entries: ${error.message}`);
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
    }
  };
  const [unitRes] = await Promise.all([units, readEntries()]);
  if (unitRes.error) throw new Error(`binders: ${unitRes.error.message}`);

  const binders = new Map<string, TcgscanBinder>();
  for (const u of unitRes.data ?? []) {
    binders.set(u.id, {
      id: u.id,
      collectionId: u.collection_id,
      name: u.name,
      rows: u.grid_rows,
      cols: u.grid_cols,
      pageCount: u.page_count,
      entries: [],
    });
  }
  for (const e of rows) {
    const b = e.storage_id ? binders.get(e.storage_id) : undefined;
    // A storage_id pointing at nothing is legal, not corruption: the reference is soft by design
    // (no FK, see 20260827130000), and a stack's entries land here too. Both simply aren't binder
    // pockets, so they're skipped rather than repaired.
    if (!b) continue;
    b.entries.push({
      cardId: e.card_id,
      page: e.storage_page,
      pos: e.storage_pos,
      // The shape of the PAGE this card was filed onto (20260828140000) — a binder that mixes
      // page sizes decodes correctly only through this, with the unit's grid as the fallback.
      rows: e.storage_rows,
      cols: e.storage_cols,
      scannedAt: e.scanned_at,
      entryId: e.id,
    });
  }
  return [...binders.values()];
}

/** The user's real scans, at both grains a surface might key on. */
export interface ScanImages {
  /** cardId → the card's NEWEST scanned crop. The per-card face, and every fallback. */
  byCard: ReadonlyMap<string, string>;
  /**
   * portfolio_entries.id → THAT copy's crop. What tells three scanned Charizards apart: a
   * rebuilt binder pocket carries the entry it depicts (DemoSlot.sourceEntryId) and resolves
   * here first, falling into byCard when the stamp is absent or the entry is gone.
   */
  byEntry: ReadonlyMap<string, string>;
}

/**
 * The user's real-scan lookup.
 *
 * tcgscan stamps portfolio_entries.scan_path at ENTRY CREATION (a birth field; the bytes upload
 * asynchronously into the public scan-images bucket). byCard keeps the newest lot per card, by
 * scanned_at (the camera moment) falling back to added_at; byEntry keeps every scanned lot under
 * its own id. RLS scopes the read to the owner, which is what makes the whole REAL_SCAN feature
 * owner-only by construction: a stranger viewing a public binder cannot run this query at all. A
 * URL may 404 while its upload is still in flight (or forever, if it failed) — display layers
 * error-fall back to the catalog image.
 */
export async function fetchScanImages(): Promise<ScanImages> {
  const supabase = requireSupabase();
  // Paged: PostgREST silently caps an unranged select (default 1000 rows), and an active
  // scanner's scan-bearing entries grow toward their whole collection. Page order is arbitrary
  // but complete, which is all the newest-wins reduction below needs.
  const PAGE = 1000;
  const rows: unknown[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await supabase
      .from('portfolio_entries')
      .select('id, card_id, scan_path, scanned_at, added_at')
      .not('scan_path', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`scan images: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  const best = new Map<string, { path: string; seen: number }>();
  const byEntry = new Map<string, string>();
  const urlOf = (path: string) =>
    supabase.storage.from('scan-images').getPublicUrl(path).data.publicUrl;
  // Through unknown: the generated database.ts predates every tcgscan column added since 07-14
  // (storage_id, scanned_at, scan_path, ...) and is tolerated stale because michi only READS
  // these tables; the runtime shape is the migration's (20260828120000).
  for (const r of rows as unknown as {
    id: string;
    card_id: string;
    scan_path: string;
    scanned_at: string | null;
    added_at: string;
  }[]) {
    byEntry.set(r.id, urlOf(r.scan_path));
    const seen = Date.parse(r.scanned_at ?? r.added_at) || 0;
    const cur = best.get(r.card_id);
    if (!cur || seen >= cur.seen) best.set(r.card_id, { path: r.scan_path, seen });
  }
  const byCard = new Map<string, string>();
  for (const [id, { path }] of best) byCard.set(id, urlOf(path));
  return { byCard, byEntry };
}

/** Monotonic suffix so every subscription gets a UNIQUE channel topic (see subscribeUserCards). */
let channelSeq = 0;

/**
 * Live changes to the user's inventory (scan-to-screen): calls `onChange` on any insert /
 * update / delete of their rows. Returns an unsubscribe. The publication includes user_cards
 * (20260714150000) and RLS keeps the stream owner-only.
 *
 * The channel topic carries a per-call `channelSeq` suffix and is NEVER just `user_cards:<userId>`.
 * A fixed topic collides whenever two subscriptions overlap — two live `useOwnedCards()` callers,
 * or a remount whose async `removeChannel()` hasn't finished — because `supabase.channel(topic)`
 * then hands back the already-`subscribe()`d channel, and chaining `.on('postgres_changes', …)`
 * onto it throws "cannot add postgres_changes callbacks … after subscribe()" synchronously in the
 * effect, blanking the page. A unique topic guarantees a fresh, un-subscribed channel every time.
 */
export function subscribeUserCards(userId: string, onChange: () => void): () => void {
  const supabase = requireSupabase();
  const channel = supabase
    .channel(`user_cards:${userId}:${++channelSeq}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_cards', filter: `owner_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
