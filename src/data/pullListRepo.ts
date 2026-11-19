/**
 * TCG-035: Michi's writes into BiBo's pull list (tables owned by the TCGScan app session, migration
 * on branch tcg-035-data). Michi only creates the list and its items; checking rows, swapping a
 * copy, the commit and the undo all happen in BiBo (`commit_pull_list` / `undo_pull_list`).
 *
 * The contract, as agreed 2026-11-19:
 *   pull_lists       id uuid, user_id, collection_id text, michi_binder_id uuid, source 'michi',
 *                    status 'open'|'done'|'cancelled'
 *   pull_list_items  list_id, user_id, entry_id text, card_id, michi_slot_id uuid,
 *                    target_page (1-based), target_pos (0-based row-major), target_rows/cols,
 *                    checked_at, moved_at
 * One open list per Michi binder: pulling again refreshes the rows not yet found or moved and keeps
 * the ones the owner has already checked off.
 *
 * The tables are newer than src/types/database.ts, so this file talks to an untyped client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { CopySpot, PullItem } from '@/data/pullList';
import { requireSupabase } from '@/lib/supabase';

/** "Open in BiBo" target: BiBo's web /pull/[id] (noindex). ship-tcg035.ps1 checks it answers before deploying. */
export const BIBO_PULL_LINK_LIVE = true;
export const biboPullUrl = (listId: string) => `https://www.biboscan.com/pull/${listId}`;

const db = () => requireSupabase() as unknown as SupabaseClient;

export interface CopyWhere {
  spot: CopySpot;
  collectionId: string;
}

/** Where each copy sits (loose, stack, box, binder) and which collection holds it. */
export async function fetchCopyWhere(entryIds: readonly string[]): Promise<Map<string, CopyWhere>> {
  const out = new Map<string, CopyWhere>();
  const ids = [...new Set(entryIds)];
  if (ids.length === 0) return out;
  const rows: { id: string; storage_id: string | null; collection_id: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db().from('portfolio_entries').select('id, storage_id, collection_id').in('id', ids.slice(i, i + 200));
    if (error) throw new Error(`copy spots: ${error.message}`);
    rows.push(...(data ?? []));
  }
  const unitIds = [...new Set(rows.map((r) => r.storage_id).filter((x): x is string => !!x))];
  const kinds = new Map<string, string>();
  if (unitIds.length > 0) {
    const { data, error } = await db().from('storage_units').select('id, kind').in('id', unitIds);
    if (error) throw new Error(`storage units: ${error.message}`);
    for (const u of data ?? []) kinds.set(u.id, u.kind);
  }
  for (const r of rows) {
    const k = r.storage_id ? kinds.get(r.storage_id) : undefined;
    // A storage_id that points at nothing is legal (soft reference): the card reads as loose.
    const spot: CopySpot = k === 'binder' ? 'binder' : k === 'box' ? 'box' : k === 'stack' ? 'stack' : 'loose';
    out.set(r.id, { spot, collectionId: r.collection_id });
  }
  return out;
}

/** The collection most of the chosen copies sit in: the binder's new home in BiBo. */
export function homeCollection(items: readonly PullItem[], where: ReadonlyMap<string, CopyWhere>): string | null {
  const n = new Map<string, number>();
  for (const i of items) {
    const c = where.get(i.entryId)?.collectionId;
    if (c) n.set(c, (n.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [c, k] of n) if (best === null || k > (n.get(best) ?? 0)) best = c;
  return best;
}

export interface SavedPull {
  listId: string;
  /** Rows the owner had already checked off in BiBo, kept as they were. */
  kept: number;
  added: number;
}

/**
 * Create (or refresh) the binder's open pull list.
 * `dims` gives each 1-based page's grid, for target_rows / target_cols.
 */
export async function savePullList(args: {
  userId: string;
  binderId: string;
  items: readonly PullItem[];
  dims: ReadonlyMap<number, { rows: number; cols: number }>;
  collectionId: string;
}): Promise<SavedPull> {
  const { userId, binderId, items, dims, collectionId } = args;
  const open = await db()
    .from('pull_lists')
    .select('id')
    .eq('michi_binder_id', binderId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open.error) throw new Error(`pull list: ${open.error.message}`);

  let listId: string;
  let keepSlots = new Set<string>();
  let kept = 0;
  if (open.data) {
    listId = open.data.id;
    // Rows not found yet are replanned; rows already checked or moved are the owner's work and stay.
    const del = await db().from('pull_list_items').delete().eq('list_id', listId).is('checked_at', null).is('moved_at', null);
    if (del.error) throw new Error(`refresh pull list: ${del.error.message}`);
    const left = await db().from('pull_list_items').select('michi_slot_id').eq('list_id', listId);
    if (left.error) throw new Error(`pull list rows: ${left.error.message}`);
    keepSlots = new Set((left.data ?? []).map((r: { michi_slot_id: string | null }) => r.michi_slot_id).filter((x): x is string => !!x));
    kept = keepSlots.size;
    await db().from('pull_lists').update({ updated_at: new Date().toISOString() }).eq('id', listId);
  } else {
    const made = await db()
      .from('pull_lists')
      .insert({ user_id: userId, collection_id: collectionId, michi_binder_id: binderId, source: 'michi', status: 'open' })
      .select('id')
      .single();
    if (made.error || !made.data) throw new Error(`make pull list: ${made.error?.message ?? 'no row'}`);
    listId = made.data.id;
  }

  const rows = items
    .filter((i) => !keepSlots.has(i.slotId))
    .map((i) => {
      const d = dims.get(i.page);
      return {
        list_id: listId,
        user_id: userId,
        entry_id: i.entryId,
        card_id: i.cardId,
        michi_slot_id: i.slotId,
        target_page: i.page,
        target_pos: i.pocket - 1,
        target_rows: d?.rows ?? null,
        target_cols: d?.cols ?? null,
      };
    });
  if (rows.length > 0) {
    const ins = await db().from('pull_list_items').insert(rows).select('id');
    if (ins.error) throw new Error(`pull list items: ${ins.error.message}`);
    // Read back: an insert RLS refused would otherwise look like it worked.
    if ((ins.data ?? []).length !== rows.length) throw new Error('pull list items: not every row was saved');
  }
  return { listId, kept, added: rows.length };
}
