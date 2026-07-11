/**
 * Supabase persistence for user binders.
 *
 * The single boundary between the flat view-models (src/data/binderTypes.ts) and the
 * `binders` / `binder_pages` / `binder_slots` rows. Only *user* binders are persisted;
 * the bundled example binders never reach this module.
 *
 * RLS requires a session, so reads/writes are scoped to the signed-in user automatically.
 * The session (guest or real account) is established by the auth store (src/store/auth.tsx);
 * this module assumes one exists and simply reads/writes the current user's rows.
 */

import { requireSupabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { DemoBinder, DemoPage, DemoSlot, MichiLayoutStyle } from '@/data/binderTypes';

type Tables = Database['public']['Tables'];
type BinderUpdate = Tables['binders']['Update'];
type PageUpdate = Tables['binder_pages']['Update'];

// --- view-model -> row (writes) -------------------------------------------

function binderRow(binder: DemoBinder): Tables['binders']['Insert'] {
  // owner_id is omitted so the DB default (auth.uid()) applies.
  return {
    id: binder.id,
    title: binder.title,
    description: binder.description ?? null,
    layout_style: binder.layoutStyle,
    cover_card_id: binder.coverCardId ?? null,
    is_public: binder.isPublic ?? false,
  };
}

function pageRow(page: DemoPage, binderId: string, position: number): Tables['binder_pages']['Insert'] {
  return {
    id: page.id,
    binder_id: binderId,
    position,
    title: page.title ?? null,
    notes: page.description ?? null,
    rows: page.rows,
    cols: page.cols,
    background_color: page.backgroundColor ?? null,
    is_public: page.isPublic ?? true,
  };
}

function slotRow(slot: DemoSlot, pageId: string): Tables['binder_slots']['Insert'] {
  return {
    id: slot.id,
    page_id: pageId,
    row_index: slot.row,
    col_index: slot.col,
    row_span: slot.rowSpan,
    col_span: slot.colSpan,
    slot_type: slot.type,
    card_id: slot.cardId ?? null,
    // No dedicated insert-colour column yet; stash it here (inserts aren't user-created yet).
    insert_image_url: slot.insertColor ?? null,
    // Custom artwork (uploaded or pasted) + its slice crop + fit mode, so it survives reload.
    image_url: slot.imageUrl ?? null,
    image_crop: slot.imageCrop ?? null,
    image_fit: slot.imageFit ?? null,
  };
}

// --- row -> view-model (reads) --------------------------------------------

interface SlotRowIn {
  id: string;
  row_index: number;
  col_index: number;
  row_span: number;
  col_span: number;
  slot_type: string;
  card_id: string | null;
  insert_image_url: string | null;
  image_url: string | null;
  image_crop: { x: number; y: number; w: number; h: number } | null;
  image_fit: string | null;
}

interface PageRowIn {
  id: string;
  title: string | null;
  notes: string | null;
  rows: number;
  cols: number;
  background_color: string | null;
  is_public: boolean;
  position: number;
  binder_slots: SlotRowIn[] | null;
}

interface BinderRowIn {
  id: string;
  title: string;
  description: string | null;
  layout_style: MichiLayoutStyle;
  cover_card_id: string | null;
  is_public: boolean;
  binder_pages: PageRowIn[] | null;
}

function mapSlot(row: SlotRowIn): DemoSlot {
  return {
    id: row.id,
    row: row.row_index,
    col: row.col_index,
    rowSpan: row.row_span,
    colSpan: row.col_span,
    type: row.slot_type as DemoSlot['type'],
    cardId: row.card_id ?? undefined,
    insertColor: row.insert_image_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    imageCrop: row.image_crop ?? undefined,
    imageFit: (row.image_fit as DemoSlot['imageFit']) ?? undefined,
  };
}

function mapPage(row: PageRowIn): DemoPage {
  const slots = (row.binder_slots ?? []).filter((s) => s.slot_type !== 'empty').map(mapSlot);
  return {
    id: row.id,
    title: row.title ?? undefined,
    description: row.notes ?? undefined,
    rows: row.rows,
    cols: row.cols,
    backgroundColor: row.background_color ?? undefined,
    isPublic: row.is_public,
    slots,
  };
}

function mapBinder(row: BinderRowIn): DemoBinder {
  const pages = [...(row.binder_pages ?? [])].sort((a, b) => a.position - b.position).map(mapPage);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    layoutStyle: row.layout_style,
    isExample: false,
    coverCardId: row.cover_card_id ?? undefined,
    isPublic: row.is_public,
    pages,
  };
}

// --- reads -----------------------------------------------------------------

export async function fetchUserBinders(ownerId: string): Promise<DemoBinder[]> {
  const supabase = requireSupabase();
  // MUST filter by owner explicitly. The binders table has TWO permissive SELECT policies —
  // "owner can view" OR "public is viewable" — so an unfiltered select returns the caller's own
  // binders *plus every public binder in the system*. Without this eq(), another user's public
  // binder leaks into this user's "Your binders" list (the "same binder under both accounts" bug).
  const { data, error } = await supabase
    .from('binders')
    .select('*, binder_pages(*, binder_slots(*))')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .order('position', { referencedTable: 'binder_pages', ascending: true });
  if (error) throw new Error(`load binders: ${error.message}`);
  return ((data ?? []) as unknown as BinderRowIn[]).map(mapBinder);
}

/**
 * Fetch a single binder (with pages + slots) by id, for the public `/binder/[id]` viewer.
 * RLS returns the row to the owner, or to *anyone* (incl. anonymous) when it is public —
 * so this resolves for a shared link without a session. Returns null when the binder
 * doesn't exist or isn't visible to the caller (private + not owner).
 */
export async function fetchBinder(id: string): Promise<DemoBinder | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('binders')
    .select('*, binder_pages(*, binder_slots(*))')
    .eq('id', id)
    .order('position', { referencedTable: 'binder_pages', ascending: true })
    .maybeSingle();
  if (error) throw new Error(`load binder: ${error.message}`);
  return data ? mapBinder(data as unknown as BinderRowIn) : null;
}

// --- writes ----------------------------------------------------------------

export async function insertBinder(binder: DemoBinder): Promise<void> {
  const supabase = requireSupabase();

  const { error: binderErr } = await supabase.from('binders').insert(binderRow(binder));
  if (binderErr) throw new Error(`insert binder: ${binderErr.message}`);

  if (binder.pages.length > 0) {
    const pages = binder.pages.map((page, index) => pageRow(page, binder.id, index));
    const { error: pageErr } = await supabase.from('binder_pages').insert(pages);
    if (pageErr) throw new Error(`insert pages: ${pageErr.message}`);

    const slots = binder.pages.flatMap((page) => page.slots.map((slot) => slotRow(slot, page.id)));
    if (slots.length > 0) {
      const { error: slotErr } = await supabase.from('binder_slots').insert(slots);
      if (slotErr) throw new Error(`insert slots: ${slotErr.message}`);
    }
  }
}

export async function updateBinder(id: string, patch: Partial<DemoBinder>): Promise<void> {
  const supabase = requireSupabase();
  const row: BinderUpdate = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description ?? null;
  if (patch.layoutStyle !== undefined) row.layout_style = patch.layoutStyle;
  if (patch.coverCardId !== undefined) row.cover_card_id = patch.coverCardId ?? null;
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('binders').update(row).eq('id', id);
  if (error) throw new Error(`update binder: ${error.message}`);
}

export async function deleteBinder(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('binders').delete().eq('id', id);
  if (error) throw new Error(`delete binder: ${error.message}`);
}

export async function insertPage(binderId: string, page: DemoPage, position: number): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('binder_pages').insert(pageRow(page, binderId, position));
  if (error) throw new Error(`insert page: ${error.message}`);
}

export async function updatePage(id: string, patch: Partial<DemoPage>): Promise<void> {
  const supabase = requireSupabase();
  const row: PageUpdate = {};
  if (patch.title !== undefined) row.title = patch.title ?? null;
  if (patch.description !== undefined) row.notes = patch.description ?? null;
  if (patch.rows !== undefined) row.rows = patch.rows;
  if (patch.cols !== undefined) row.cols = patch.cols;
  if (patch.backgroundColor !== undefined) row.background_color = patch.backgroundColor ?? null;
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('binder_pages').update(row).eq('id', id);
  if (error) throw new Error(`update page: ${error.message}`);
}

export async function deletePage(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('binder_pages').delete().eq('id', id);
  if (error) throw new Error(`delete page: ${error.message}`);
}

export async function upsertSlot(pageId: string, slot: DemoSlot): Promise<void> {
  const supabase = requireSupabase();
  // Clear any *other* slot sitting at this slot's top-left cell first — a stale row left by a
  // racing/failed prior write. Otherwise inserting a new-id slot there hits the
  // unique(page_id,row_index,col_index) constraint ("...binder_slots_page_id_row_index_col_index_key").
  // Makes the write idempotent w.r.t. the cell and self-heals any local↔DB divergence.
  const { error: clearErr } = await supabase
    .from('binder_slots')
    .delete()
    .eq('page_id', pageId)
    .eq('row_index', slot.row)
    .eq('col_index', slot.col)
    .neq('id', slot.id);
  if (clearErr) throw new Error(`clear slot cell: ${clearErr.message}`);

  const { error } = await supabase
    .from('binder_slots')
    .upsert(slotRow(slot, pageId), { onConflict: 'id' });
  if (error) throw new Error(`upsert slot: ${error.message}`);
}

export async function deleteSlot(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('binder_slots').delete().eq('id', id);
  if (error) throw new Error(`delete slot: ${error.message}`);
}

/**
 * Replace a binder's entire persisted state with the given snapshot — used to re-sync a binder
 * after an undo/redo (which move between whole-state snapshots that the incremental writers can't
 * express). Upserts the binder row (so it also *restores* a binder an undo brings back), then
 * wipes its pages (slots cascade) and re-inserts the current pages + slots. Idempotent: replacing
 * to the same snapshot twice yields the same result, so it's safe to call more than once.
 */
export async function replaceBinder(binder: DemoBinder): Promise<void> {
  const supabase = requireSupabase();
  const { error: bErr } = await supabase.from('binders').upsert(binderRow(binder), { onConflict: 'id' });
  if (bErr) throw new Error(`replace binder: ${bErr.message}`);

  const { error: delErr } = await supabase.from('binder_pages').delete().eq('binder_id', binder.id);
  if (delErr) throw new Error(`replace pages (delete): ${delErr.message}`);

  if (binder.pages.length > 0) {
    const pages = binder.pages.map((page, index) => pageRow(page, binder.id, index));
    const { error: pErr } = await supabase.from('binder_pages').insert(pages);
    if (pErr) throw new Error(`replace pages (insert): ${pErr.message}`);

    const slots = binder.pages.flatMap((page) => page.slots.map((slot) => slotRow(slot, page.id)));
    if (slots.length > 0) {
      const { error: sErr } = await supabase.from('binder_slots').insert(slots);
      if (sErr) throw new Error(`replace slots: ${sErr.message}`);
    }
  }
}

/**
 * Persist a page reordering by writing the new `position` of each page. Done in two phases —
 * park every page at a distinct negative position, then set the final 0..n-1 — so the
 * `unique(binder_id, position)` constraint is never violated mid-update. `orderedPageIds` is the
 * binder's full page list in its new order.
 */
export async function reorderPages(binderId: string, orderedPageIds: string[]): Promise<void> {
  const supabase = requireSupabase();
  const park = await Promise.all(
    orderedPageIds.map((id, i) =>
      supabase.from('binder_pages').update({ position: -(i + 1) }).eq('id', id).eq('binder_id', binderId),
    ),
  );
  const parkErr = park.find((r) => r.error);
  if (parkErr?.error) throw new Error(`reorder pages (park): ${parkErr.error.message}`);

  const set = await Promise.all(
    orderedPageIds.map((id, i) =>
      supabase.from('binder_pages').update({ position: i }).eq('id', id).eq('binder_id', binderId),
    ),
  );
  const setErr = set.find((r) => r.error);
  if (setErr?.error) throw new Error(`reorder pages (set): ${setErr.error.message}`);
}

// --- likes -----------------------------------------------------------------

/** One person who liked a binder (for the owner's "who liked" list). */
export interface Liker {
  userId: string;
  /** null when the liker's profile is private (shown as "Someone" in the UI). */
  displayName: string | null;
  createdAt: string;
}

/**
 * Total likes for a binder. Goes through the `binder_like_count` RPC (SECURITY DEFINER) so it
 * works for anonymous public viewers, who can't read individual `binder_likes` rows under RLS.
 */
export async function fetchLikeCount(binderId: string): Promise<number> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('binder_like_count', { p_binder_id: binderId });
  if (error) throw new Error(`like count: ${error.message}`);
  return (data as number | null) ?? 0;
}

/** Whether `userId` has already liked this binder (RLS lets a user read their own like row). */
export async function hasLiked(binderId: string, userId: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('binder_likes')
    .select('binder_id')
    .eq('binder_id', binderId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`like state: ${error.message}`);
  return !!data;
}

/** Like a binder as the current user. `user_id`/`created_at` default in the DB (auth.uid()/now()). */
export async function likeBinder(binderId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from('binder_likes').insert({ binder_id: binderId });
  if (error) throw new Error(`like: ${error.message}`);
}

/** Remove the current user's like from a binder. */
export async function unlikeBinder(binderId: string, userId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from('binder_likes')
    .delete()
    .eq('binder_id', binderId)
    .eq('user_id', userId);
  if (error) throw new Error(`unlike: ${error.message}`);
}

/**
 * Everyone who liked a binder, most recent first — for the owner's "who liked" view (RLS lets the
 * owner read all like rows on their own binder). Resolves each liker's display name in a second
 * query; a liker whose profile is private surfaces as `null` (the UI shows "Someone").
 */
export async function fetchLikers(binderId: string): Promise<Liker[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('binder_likes')
    .select('user_id, created_at')
    .eq('binder_id', binderId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`likers: ${error.message}`);
  const rows = (data ?? []) as { user_id: string; created_at: string }[];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profs, error: pErr } = await supabase
    .from('profiles')
    .select('id, display_name, is_public')
    .in('id', ids);
  if (pErr) throw new Error(`likers profiles: ${pErr.message}`);
  const byId = new Map(
    ((profs ?? []) as { id: string; display_name: string | null; is_public: boolean }[]).map((p) => [p.id, p]),
  );
  return rows.map((r) => {
    const p = byId.get(r.user_id);
    return {
      userId: r.user_id,
      displayName: p && p.is_public ? (p.display_name ?? null) : null,
      createdAt: r.created_at,
    };
  });
}

/**
 * Featured binders: the top public binders by likes received in the last rolling 3 days. The
 * `featured_binders` RPC (SECURITY DEFINER, excludes private profiles) returns the ranking; we
 * then load those binders' pages/slots via the public read path and re-attach each one's author
 * name + like count, preserving the RPC's order. Returns [] when nothing qualifies.
 */
export async function fetchFeaturedBinders(limit = 12): Promise<DemoBinder[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('featured_binders', { p_limit: limit });
  if (error) throw new Error(`featured: ${error.message}`);
  const rows = (data ?? []) as { binder_id: string; like_count: number; author_name: string | null }[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.binder_id);
  const { data: binders, error: bErr } = await supabase
    .from('binders')
    .select('*, binder_pages(*, binder_slots(*))')
    .in('id', ids)
    .order('position', { referencedTable: 'binder_pages', ascending: true });
  if (bErr) throw new Error(`featured binders: ${bErr.message}`);
  const byId = new Map(((binders ?? []) as unknown as BinderRowIn[]).map((b) => [b.id, b]));

  return rows.flatMap((r) => {
    const row = byId.get(r.binder_id);
    if (!row) return []; // vanished/hidden between the ranking and the fetch
    return [
      {
        ...mapBinder(row),
        isFeatured: true,
        authorName: r.author_name ?? undefined,
        likeCount: Number(r.like_count),
      },
    ];
  });
}
