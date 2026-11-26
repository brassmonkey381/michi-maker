/**
 * MIC-041: reads and writes for the Want list (card_wants) and the Trade list (entry_trades), and
 * the profile's "show my lists" switch. Owner-only tables (RLS); the public view goes through
 * public_collection_lists(), which answers only when the owner turned show_lists on.
 *
 * These tables are not in the generated database types yet (the migration is new), so this module
 * talks to them through an untyped view of the client and checks shapes itself.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import type { TradeRow, WantRow } from './collectionLists';

const db = (): SupabaseClient | null => (supabase as unknown as SupabaseClient | null) ?? null;

export interface MyLists {
  wants: WantRow[];
  trades: TradeRow[];
}

export async function fetchMyLists(userId: string): Promise<MyLists> {
  const c = db();
  if (!c) return { wants: [], trades: [] };
  const [w, t] = await Promise.all([
    c.from('card_wants').select('card_id, quantity').eq('user_id', userId).limit(5000),
    c.from('entry_trades').select('entry_id, quantity').eq('user_id', userId).limit(5000),
  ]);
  if (w.error) throw new Error(w.error.message);
  if (t.error) throw new Error(t.error.message);
  return {
    wants: (w.data ?? []).map((r: { card_id: string; quantity: number }) => ({ cardId: r.card_id, quantity: r.quantity })),
    trades: (t.data ?? []).map((r: { entry_id: string; quantity: number }) => ({ entryId: r.entry_id, quantity: r.quantity })),
  };
}

/** Add (or raise) wants. Upsert on (user_id, card_id), so a repeat never errors. */
export async function addWants(userId: string, cardIds: string[], quantity = 1): Promise<void> {
  const c = db();
  if (!c || !cardIds.length) return;
  const now = new Date().toISOString();
  for (let i = 0; i < cardIds.length; i += 500) {
    const rows = cardIds.slice(i, i + 500).map((card_id) => ({ user_id: userId, card_id, quantity, updated_at: now }));
    const { error } = await c.from('card_wants').upsert(rows, { onConflict: 'user_id,card_id' });
    if (error) throw new Error(error.message);
  }
}

export async function setWantQuantity(userId: string, cardId: string, quantity: number): Promise<void> {
  if (quantity <= 0) return removeWant(userId, cardId);
  return addWants(userId, [cardId], Math.min(99, Math.round(quantity)));
}

export async function removeWant(userId: string, cardId: string): Promise<void> {
  const c = db();
  if (!c) return;
  const { error } = await c.from('card_wants').delete().eq('user_id', userId).eq('card_id', cardId);
  if (error) throw new Error(error.message);
}

/** Offer `quantity` copies of one owned lot (the server clamps to the lot's size). */
export async function markTrade(userId: string, entryId: string, quantity = 1): Promise<void> {
  const c = db();
  if (!c) return;
  const { error } = await c
    .from('entry_trades')
    .upsert({ user_id: userId, entry_id: entryId, quantity: Math.max(1, Math.round(quantity)) }, { onConflict: 'user_id,entry_id' });
  if (error) throw new Error(error.message);
}

export async function unmarkTrade(userId: string, entryIds: string[]): Promise<void> {
  const c = db();
  if (!c || !entryIds.length) return;
  const { error } = await c.from('entry_trades').delete().eq('user_id', userId).in('entry_id', entryIds);
  if (error) throw new Error(error.message);
}

export async function setShowLists(userId: string, on: boolean): Promise<void> {
  const c = db();
  if (!c) return;
  const { data, error } = await c.from('profiles').update({ show_lists: on }).eq('id', userId).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That did not save');
}

export async function fetchShowLists(userId: string): Promise<boolean> {
  const c = db();
  if (!c) return false;
  const { data } = await c.from('profiles').select('show_lists').eq('id', userId).maybeSingle();
  return !!(data as { show_lists?: boolean } | null)?.show_lists;
}

export interface PublicLists {
  wants: { card_id: string; quantity: number }[];
  trades: { card_id: string; variant: string; condition: string; quantity: number }[];
}

/** Someone's lists, or null when they keep them private (or the function is not live yet). */
export async function fetchPublicLists(userId: string): Promise<PublicLists | null> {
  const c = db();
  if (!c) return null;
  const { data, error } = await c.rpc('public_collection_lists', { p_user: userId });
  if (error || !data || typeof data !== 'object') return null;
  const d = data as Partial<PublicLists>;
  return { wants: Array.isArray(d.wants) ? d.wants : [], trades: Array.isArray(d.trades) ? d.trades : [] };
}
