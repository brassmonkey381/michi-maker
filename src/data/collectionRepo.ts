/**
 * Supabase access for the collector's card inventory (`user_cards`) — the portfolio summary
 * fed by tcgscan-app scans (and, later, michi's own CSV import). Read-only from michi's side
 * for now; RLS scopes every query to the signed-in user. See docs/TCGSCAN-PORTFOLIO.md.
 */
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
 * The user's real-scan lookup: cardId → public URL of the card's newest scanned crop.
 *
 * tcgscan stamps portfolio_entries.scan_path at ENTRY CREATION (a birth field; the bytes upload
 * asynchronously into the public scan-images bucket). Newest lot wins per card, by scanned_at
 * (the camera moment) falling back to added_at. RLS scopes the read to the owner, which is what
 * makes the whole REAL_SCAN feature owner-only by construction: a stranger viewing a public
 * binder cannot run this query at all. A URL may 404 while its upload is still in flight (or
 * forever, if it failed) — display layers error-fall back to the catalog image.
 */
export async function fetchScanImages(): Promise<Map<string, string>> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('portfolio_entries')
    .select('card_id, scan_path, scanned_at, added_at')
    .not('scan_path', 'is', null);
  if (error) throw new Error(`scan images: ${error.message}`);
  const best = new Map<string, { path: string; seen: number }>();
  // Through unknown: the generated database.ts predates every tcgscan column added since 07-14
  // (storage_id, scanned_at, scan_path, ...) and is tolerated stale because michi only READS
  // these tables; the runtime shape is the migration's (20260828120000).
  for (const r of (data ?? []) as unknown as {
    card_id: string;
    scan_path: string;
    scanned_at: string | null;
    added_at: string;
  }[]) {
    const seen = Date.parse(r.scanned_at ?? r.added_at) || 0;
    const cur = best.get(r.card_id);
    if (!cur || seen >= cur.seen) best.set(r.card_id, { path: r.scan_path, seen });
  }
  const out = new Map<string, string>();
  for (const [id, { path }] of best) {
    out.set(id, supabase.storage.from('scan-images').getPublicUrl(path).data.publicUrl);
  }
  return out;
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
