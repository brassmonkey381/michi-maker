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
  // owner_id is omitted so the DB default (auth.uid()) applies; is_public defaults false.
  return {
    id: binder.id,
    title: binder.title,
    description: binder.description ?? null,
    layout_style: binder.layoutStyle,
    cover_card_id: binder.coverCardId ?? null,
  };
}

function pageRow(page: DemoPage, binderId: string, position: number): Tables['binder_pages']['Insert'] {
  return {
    id: page.id,
    binder_id: binderId,
    position,
    title: page.title ?? null,
    rows: page.rows,
    cols: page.cols,
    background_color: page.backgroundColor ?? null,
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
}

interface PageRowIn {
  id: string;
  title: string | null;
  rows: number;
  cols: number;
  background_color: string | null;
  position: number;
  binder_slots: SlotRowIn[] | null;
}

interface BinderRowIn {
  id: string;
  title: string;
  description: string | null;
  layout_style: MichiLayoutStyle;
  cover_card_id: string | null;
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
  };
}

function mapPage(row: PageRowIn): DemoPage {
  const slots = (row.binder_slots ?? []).filter((s) => s.slot_type !== 'empty').map(mapSlot);
  return {
    id: row.id,
    title: row.title ?? undefined,
    rows: row.rows,
    cols: row.cols,
    backgroundColor: row.background_color ?? undefined,
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
    pages,
  };
}

// --- reads -----------------------------------------------------------------

export async function fetchUserBinders(): Promise<DemoBinder[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('binders')
    .select('*, binder_pages(*, binder_slots(*))')
    .order('created_at', { ascending: true })
    .order('position', { referencedTable: 'binder_pages', ascending: true });
  if (error) throw new Error(`load binders: ${error.message}`);
  return ((data ?? []) as unknown as BinderRowIn[]).map(mapBinder);
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
  if (patch.rows !== undefined) row.rows = patch.rows;
  if (patch.cols !== undefined) row.cols = patch.cols;
  if (patch.backgroundColor !== undefined) row.background_color = patch.backgroundColor ?? null;
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
